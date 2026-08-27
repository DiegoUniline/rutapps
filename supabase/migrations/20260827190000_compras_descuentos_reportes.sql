-- Compras: descuento final, ajuste de factura y costo neto prorrateado.
-- Los datos existentes conservan exactamente sus importes (defaults en cero).

BEGIN;

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS descuento_extra numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_extra_tipo text NOT NULL DEFAULT 'monto',
  ADD COLUMN IF NOT EXISTS descuento_extra_motivo text,
  ADD COLUMN IF NOT EXISTS descuento_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_total numeric NOT NULL DEFAULT 0;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compras_descuento_extra_no_negativo'
       AND conrelid = 'public.compras'::regclass
  ) THEN
    ALTER TABLE public.compras
      ADD CONSTRAINT compras_descuento_extra_no_negativo
      CHECK (descuento_extra >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compras_descuento_total_no_negativo'
       AND conrelid = 'public.compras'::regclass
  ) THEN
    ALTER TABLE public.compras
      ADD CONSTRAINT compras_descuento_total_no_negativo
      CHECK (descuento_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compras_descuento_extra_tipo_valido'
       AND conrelid = 'public.compras'::regclass
  ) THEN
    ALTER TABLE public.compras
      ADD CONSTRAINT compras_descuento_extra_tipo_valido
      CHECK (descuento_extra_tipo IN ('monto', 'porcentaje'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compras_descuento_porcentaje_maximo'
       AND conrelid = 'public.compras'::regclass
  ) THEN
    ALTER TABLE public.compras
      ADD CONSTRAINT compras_descuento_porcentaje_maximo
      CHECK (descuento_extra_tipo <> 'porcentaje' OR descuento_extra <= 100);
  END IF;
END
$do$;

-- Sólo reduce/aumenta el costo de las líneas cuando la compra tiene un ajuste
-- explícito. Así las compras históricas con diferencias de redondeo no cambian.
CREATE OR REPLACE FUNCTION public.fn_factor_neto_compra(p_compra_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(c.descuento_total, 0) = 0
     AND COALESCE(c.ajuste_total, 0) = 0 THEN 1::numeric
    WHEN COALESCE(t.total_lineas, 0) <= 0 THEN 1::numeric
    ELSE GREATEST(COALESCE(c.total, 0), 0) / t.total_lineas
  END
  FROM public.compras c
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(cl.total), 0) AS total_lineas
      FROM public.compra_lineas cl
     WHERE cl.compra_id = c.id
  ) t ON true
  WHERE c.id = p_compra_id;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_producto_costo(p_producto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_calculo calculo_costo;
  v_new_cost numeric;
  v_empresa_id uuid;
  v_proveedor_id uuid;
BEGIN
  SELECT calculo_costo, empresa_id
    INTO v_calculo, v_empresa_id
    FROM public.productos
   WHERE id = p_producto_id;

  IF v_calculo IS NULL OR v_calculo IN ('manual', 'estandar') THEN
    RETURN;
  END IF;

  IF v_calculo = 'ultimo' THEN
    SELECT cl.precio_unitario
           * public.fn_factor_neto_compra(c.id)
           / NULLIF(COALESCE(cl.factor_conversion, 1), 0)
      INTO v_new_cost
      FROM public.compra_lineas cl
      JOIN public.compras c ON c.id = cl.compra_id
     WHERE cl.producto_id = p_producto_id
       AND c.empresa_id = v_empresa_id
       AND c.status IN ('recibida', 'pagada')
     ORDER BY c.fecha DESC, c.created_at DESC
     LIMIT 1;

  ELSIF v_calculo = 'ultimo_compra' THEN
    SELECT cl.precio_unitario
           * public.fn_factor_neto_compra(c.id)
           / NULLIF(COALESCE(cl.factor_conversion, 1), 0)
      INTO v_new_cost
      FROM public.compra_lineas cl
      JOIN public.compras c ON c.id = cl.compra_id
     WHERE cl.producto_id = p_producto_id
       AND c.empresa_id = v_empresa_id
       AND c.status IN ('recibida', 'pagada')
       AND c.condicion_pago = 'contado'
     ORDER BY c.fecha DESC, c.created_at DESC
     LIMIT 1;

  ELSIF v_calculo = 'ultimo_proveedor' THEN
    SELECT pp.proveedor_id
      INTO v_proveedor_id
      FROM public.producto_proveedores pp
     WHERE pp.producto_id = p_producto_id
       AND pp.es_principal = true
     LIMIT 1;

    IF v_proveedor_id IS NOT NULL THEN
      SELECT cl.precio_unitario
             * public.fn_factor_neto_compra(c.id)
             / NULLIF(COALESCE(cl.factor_conversion, 1), 0)
        INTO v_new_cost
        FROM public.compra_lineas cl
        JOIN public.compras c ON c.id = cl.compra_id
       WHERE cl.producto_id = p_producto_id
         AND c.empresa_id = v_empresa_id
         AND c.proveedor_id = v_proveedor_id
         AND c.status IN ('recibida', 'pagada')
       ORDER BY c.fecha DESC, c.created_at DESC
       LIMIT 1;
    END IF;

  ELSIF v_calculo = 'promedio' THEN
    SELECT SUM(
             cl.precio_unitario
             * cl.cantidad
             * public.fn_factor_neto_compra(c.id)
           ) / NULLIF(SUM(
             cl.cantidad * COALESCE(cl.factor_conversion, 1)
           ), 0)
      INTO v_new_cost
      FROM public.compra_lineas cl
      JOIN public.compras c ON c.id = cl.compra_id
     WHERE cl.producto_id = p_producto_id
       AND c.empresa_id = v_empresa_id
       AND c.status IN ('recibida', 'pagada');
  END IF;

  IF v_new_cost IS NOT NULL THEN
    UPDATE public.productos
       SET costo = ROUND(v_new_cost, 4)
     WHERE id = p_producto_id;
  END IF;
END;
$function$;

-- Si se modifica el descuento/ajuste de una compra ya recibida, vuelve a
-- calcular los productos afectados.
CREATE OR REPLACE FUNCTION public.trg_compra_recalc_costos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_should boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should := NEW.status IN ('recibida', 'pagada');
  ELSIF TG_OP = 'UPDATE' THEN
    v_should := NEW.status IN ('recibida', 'pagada')
      AND (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.fecha IS DISTINCT FROM NEW.fecha
        OR OLD.proveedor_id IS DISTINCT FROM NEW.proveedor_id
        OR OLD.condicion_pago IS DISTINCT FROM NEW.condicion_pago
        OR OLD.total IS DISTINCT FROM NEW.total
        OR OLD.descuento_total IS DISTINCT FROM NEW.descuento_total
        OR OLD.ajuste_total IS DISTINCT FROM NEW.ajuste_total
      );
  END IF;

  IF v_should THEN
    FOR r IN
      SELECT DISTINCT producto_id
        FROM public.compra_lineas
       WHERE compra_id = NEW.id
    LOOP
      PERFORM public.recalc_producto_costo(r.producto_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_compra_recalc_costos ON public.compras;
CREATE TRIGGER trg_compra_recalc_costos
AFTER INSERT OR UPDATE ON public.compras
FOR EACH ROW EXECUTE FUNCTION public.trg_compra_recalc_costos();

REVOKE ALL ON FUNCTION public.fn_factor_neto_compra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_factor_neto_compra(uuid) TO authenticated, service_role;

COMMIT;
