-- 1. Persistir el precio neto crudo en las líneas
ALTER TABLE public.venta_lineas
  ADD COLUMN IF NOT EXISTS precio_unitario_sin_redondeo numeric;

-- 2. Tabla de auditoría de descuadres (solo registro, nunca corrige)
CREATE TABLE IF NOT EXISTS public.ventas_descuadre_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid,
  venta_id uuid,
  venta_linea_id uuid,
  producto_id uuid,
  tipo text NOT NULL DEFAULT 'precio_erosionado',
  precio_guardado numeric,
  precio_esperado numeric,
  diferencia numeric,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ventas_descuadre_auditoria TO authenticated;
GRANT ALL ON public.ventas_descuadre_auditoria TO service_role;

ALTER TABLE public.ventas_descuadre_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresa puede ver sus descuadres" ON public.ventas_descuadre_auditoria;
CREATE POLICY "empresa puede ver sus descuadres"
  ON public.ventas_descuadre_auditoria
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_vda_empresa ON public.ventas_descuadre_auditoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vda_venta ON public.ventas_descuadre_auditoria(venta_id);
CREATE INDEX IF NOT EXISTS idx_vda_created ON public.ventas_descuadre_auditoria(created_at DESC);

-- 3. Recalculo del encabezado a partir de las líneas
CREATE OR REPLACE FUNCTION public.fn_recalc_venta_header(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta       public.ventas%ROWTYPE;
  v_n           integer;
  v_sub         numeric := 0;
  v_iva         numeric := 0;
  v_ieps        numeric := 0;
  v_tot         numeric := 0;
  v_desc_lin    numeric := 0;
  v_extra       numeric := 0;
  v_promo       numeric := 0;
  v_promo_linea boolean := false;
  v_licencia    text;
  v_new_total   numeric;
  v_new_desc    numeric;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*),
         COALESCE(SUM(COALESCE(vl.subtotal,0)),0),
         COALESCE(SUM(COALESCE(vl.iva_monto,0)),0),
         COALESCE(SUM(COALESCE(vl.ieps_monto,0)),0),
         COALESCE(SUM(COALESCE(vl.total,0)),0),
         COALESCE(SUM(ROUND(COALESCE(vl.subtotal,0) * COALESCE(vl.descuento_pct,0) / 100.0, 2)),0)
    INTO v_n, v_sub, v_iva, v_ieps, v_tot, v_desc_lin
  FROM public.venta_lineas vl
  WHERE vl.venta_id = p_venta_id;

  -- Ventas sin líneas (saldo inicial, venta por concepto): no se tocan.
  IF v_n = 0 THEN RETURN; END IF;

  -- Descuento extra del encabezado
  v_extra := CASE
    WHEN COALESCE(v_venta.descuento_extra, 0) <= 0 THEN 0
    WHEN COALESCE(v_venta.descuento_extra_tipo, 'porcentaje') = 'monto'
      THEN LEAST(v_venta.descuento_extra, v_tot)
    ELSE ROUND(v_tot * v_venta.descuento_extra / 100.0, 2)
  END;

  -- Promoción: si la licencia guarda las líneas ya netas, NO se vuelve a restar.
  SELECT e.licencia INTO v_licencia FROM public.empresas e WHERE e.id = v_venta.empresa_id;
  SELECT EXISTS (
    SELECT 1 FROM public.feature_flags ff
    WHERE ff.clave = 'promo_descuento_linea'
      AND (ff.alcance = 'todos'
           OR (ff.alcance = 'licencias' AND v_licencia = ANY(COALESCE(ff.licencias, ARRAY[]::text[]))))
  ) INTO v_promo_linea;

  IF NOT v_promo_linea THEN
    SELECT COALESCE(SUM(COALESCE(pa.descuento_aplicado, 0)), 0) INTO v_promo
    FROM public.promocion_aplicada pa
    WHERE pa.venta_id = p_venta_id;
  END IF;

  v_new_total := GREATEST(0, ROUND(v_tot - v_extra - v_promo, 2));
  v_new_desc  := ROUND(v_desc_lin + v_extra + v_promo, 2);

  -- Idempotente: solo escribe si algo realmente cambia.
  IF ABS(COALESCE(v_venta.subtotal,0)    - ROUND(v_sub,2))  > 0.005
  OR ABS(COALESCE(v_venta.iva_total,0)   - ROUND(v_iva,2))  > 0.005
  OR ABS(COALESCE(v_venta.ieps_total,0)  - ROUND(v_ieps,2)) > 0.005
  OR ABS(COALESCE(v_venta.total,0)       - v_new_total)     > 0.005
  OR ABS(COALESCE(v_venta.descuento_total,0) - v_new_desc)  > 0.005 THEN
    UPDATE public.ventas
       SET subtotal        = ROUND(v_sub, 2),
           iva_total       = ROUND(v_iva, 2),
           ieps_total      = ROUND(v_ieps, 2),
           descuento_total = v_new_desc,
           total           = v_new_total
     WHERE id = p_venta_id;
  END IF;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_venta_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalc_venta_header(OLD.venta_id);
    RETURN OLD;
  END IF;

  PERFORM public.fn_recalc_venta_header(NEW.venta_id);
  IF TG_OP = 'UPDATE' AND NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN
    PERFORM public.fn_recalc_venta_header(OLD.venta_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venta_lineas_recalc_header ON public.venta_lineas;
CREATE TRIGGER trg_venta_lineas_recalc_header
AFTER INSERT OR UPDATE OR DELETE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_venta_header();

-- 4. Auditoría de posible erosión de precio (NO corrige nada)
CREATE OR REPLACE FUNCTION public.trg_audit_venta_linea_precio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod      public.productos%ROWTYPE;
  v_mult      numeric;
  v_esperado  numeric;
  v_guardado  numeric;
  v_empresa   uuid;
BEGIN
  IF NEW.producto_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.precio_manual, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.descuento_pct, 0) <> 0 THEN RETURN NEW; END IF;
  IF NEW.lista_precio_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_prod FROM public.productos WHERE id = NEW.producto_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Solo interesa cuando hay impuestos (la erosión venía de dividir de más).
  IF COALESCE(v_prod.tiene_iva, false) = false AND COALESCE(v_prod.tiene_ieps, false) = false THEN
    RETURN NEW;
  END IF;

  v_mult := (1 + CASE WHEN COALESCE(v_prod.tiene_ieps,false) THEN COALESCE(v_prod.ieps_pct,0)/100.0 ELSE 0 END)
          * (1 + CASE WHEN COALESCE(v_prod.tiene_iva,false)  THEN COALESCE(v_prod.iva_pct,0)/100.0  ELSE 0 END);
  IF v_mult <= 0 THEN RETURN NEW; END IF;

  v_esperado := ROUND(COALESCE(v_prod.precio_principal, 0) / v_mult, 4);
  v_guardado := ROUND(COALESCE(NEW.precio_unitario, 0), 4);

  IF v_esperado <= 0 OR v_guardado <= 0 THEN RETURN NEW; END IF;

  -- Tolerancia 1%: solo se registra lo que se ve como erosión (precio por debajo).
  IF v_guardado < v_esperado * 0.99 THEN
    SELECT empresa_id INTO v_empresa FROM public.ventas WHERE id = NEW.venta_id;
    INSERT INTO public.ventas_descuadre_auditoria
      (empresa_id, venta_id, venta_linea_id, producto_id, tipo,
       precio_guardado, precio_esperado, diferencia, detalle)
    VALUES
      (v_empresa, NEW.venta_id, NEW.id, NEW.producto_id, 'precio_erosionado',
       v_guardado, v_esperado, ROUND(v_esperado - v_guardado, 4),
       jsonb_build_object(
         'iva_pct', v_prod.iva_pct, 'ieps_pct', v_prod.ieps_pct,
         'precio_principal', v_prod.precio_principal,
         'precio_unitario_sin_redondeo', NEW.precio_unitario_sin_redondeo,
         'op', TG_OP));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venta_lineas_audit_precio ON public.venta_lineas;
CREATE TRIGGER trg_venta_lineas_audit_precio
AFTER INSERT OR UPDATE OF precio_unitario ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_venta_linea_precio();
