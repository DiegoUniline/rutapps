ALTER TABLE public.stock_apartado
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_apartado_lote
  ON public.stock_apartado (empresa_id, almacen_id, producto_id, lote_id);

CREATE OR REPLACE FUNCTION public.trg_venta_lineas_apartado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo text;
  v_status text;
  v_empresa_id uuid;
  v_flag boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT v.tipo, v.status, v.empresa_id INTO v_tipo, v_status, v_empresa_id
    FROM public.ventas v WHERE v.id = NEW.venta_id;

  IF v_tipo IS DISTINCT FROM 'pedido' THEN
    RETURN NEW;
  END IF;

  SELECT apartar_stock_pedidos INTO v_flag FROM public.empresas WHERE id = v_empresa_id;
  IF NOT COALESCE(v_flag, false) THEN
    RETURN NEW;
  END IF;

  IF v_status = 'cancelado' OR NEW.almacen_id IS NULL OR NEW.producto_id IS NULL THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.stock_apartado (empresa_id, venta_id, venta_linea_id, producto_id, almacen_id, cantidad, lote_id)
  VALUES (v_empresa_id, NEW.venta_id, NEW.id, NEW.producto_id, NEW.almacen_id, COALESCE(NEW.cantidad, 0), NEW.lote_id)
  ON CONFLICT (venta_linea_id) DO UPDATE
    SET producto_id = EXCLUDED.producto_id,
        almacen_id = EXCLUDED.almacen_id,
        cantidad = EXCLUDED.cantidad,
        lote_id = EXCLUDED.lote_id,
        updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_disponible_lotes(
  p_almacen_id uuid,
  p_producto_id uuid,
  p_excluir_venta_id uuid DEFAULT NULL
)
RETURNS TABLE (
  lote_id uuid,
  codigo text,
  fecha_caducidad date,
  cantidad numeric,
  apartado numeric,
  disponible numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH emp AS (SELECT public.get_my_empresa_id() AS id)
  SELECT sl.lote_id,
         l.codigo,
         l.fecha_caducidad,
         sl.cantidad,
         COALESCE(ap.apartado, 0) AS apartado,
         sl.cantidad - COALESCE(ap.apartado, 0) AS disponible
    FROM public.stock_lotes sl
    JOIN public.lotes l ON l.id = sl.lote_id
    JOIN emp ON emp.id = sl.empresa_id
    LEFT JOIN LATERAL (
      SELECT SUM(sa.cantidad) AS apartado
        FROM public.stock_apartado sa
       WHERE sa.empresa_id = sl.empresa_id
         AND sa.almacen_id = sl.almacen_id
         AND sa.producto_id = sl.producto_id
         AND sa.lote_id = sl.lote_id
         AND (p_excluir_venta_id IS NULL OR sa.venta_id <> p_excluir_venta_id)
    ) ap ON TRUE
   WHERE sl.almacen_id = p_almacen_id
     AND sl.producto_id = p_producto_id
     AND l.activo IS DISTINCT FROM false
     AND sl.cantidad > 0
   ORDER BY COALESCE(l.fecha_caducidad, DATE '9999-12-31'), l.codigo;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_disponible_lotes(uuid, uuid, uuid) TO authenticated;