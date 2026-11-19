-- Mantiene la variante optimizada de Inteligencia de Inventario como la
-- definición final, incluso al reconstruir la base desde cero.
--
-- La migración que introdujo SECURITY DEFINER quedó fechada antes de la
-- definición SECURITY INVOKER original. Esta migración posterior elimina
-- esa dependencia del orden histórico y fija también los permisos.

CREATE OR REPLACE FUNCTION public.fn_inventory_intelligence_snapshot(
  p_empresa_id uuid,
  p_window_days integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days integer := LEAST(365, GREATEST(1, COALESCE(p_window_days, 60)));
  v_since date := current_date - v_days;
  v_history_since date := current_date - 365;
  v_bucket text := CASE WHEN v_days > 90 THEN 'week' ELSE 'day' END;
  v_result jsonb;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'p_empresa_id es obligatorio' USING ERRCODE = '22004';
  END IF;

  -- SECURITY DEFINER evita evaluar RLS por cada fila. Esta validación se
  -- ejecuta una sola vez antes de leer datos y mantiene el aislamiento.
  IF p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para consultar esta empresa'
      USING ERRCODE = '42501';
  END IF;

  WITH sales_by_product AS MATERIALIZED (
    SELECT
      vl.producto_id,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha >= v_since), 0) AS sold_units,
      COALESCE(SUM(COALESCE(vl.total, 0)) FILTER (WHERE v.fecha >= v_since), 0) AS revenue,
      MAX(v.fecha) AS last_sale_at
    FROM public.venta_lineas vl
    JOIN public.ventas v
      ON v.id = vl.venta_id
     AND v.empresa_id = p_empresa_id
    WHERE vl.empresa_id = p_empresa_id
      AND vl.producto_id IS NOT NULL
      AND v.status::text <> 'cancelado'
      AND v.fecha >= v_history_since
    GROUP BY vl.producto_id
  ),
  last_inbound AS MATERIALIZED (
    SELECT producto_id, MAX(fecha) AS last_inbound_at
    FROM public.movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND producto_id IS NOT NULL
      AND tipo::text = 'entrada'
      AND fecha >= v_history_since
    GROUP BY producto_id
  ),
  movement_trend AS MATERIALIZED (
    SELECT
      date_trunc(v_bucket, fecha::timestamp)::date AS fecha,
      tipo::text AS tipo,
      SUM(ABS(cantidad)) AS cantidad
    FROM public.movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND fecha >= v_since
    GROUP BY 1, 2
  ),
  recent_movements AS MATERIALIZED (
    SELECT
      id, fecha, created_at, tipo::text AS tipo, cantidad, producto_id, lote_id,
      referencia_tipo, referencia_id, almacen_origen_id, almacen_destino_id, notas
    FROM public.movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND fecha >= v_since
    ORDER BY created_at DESC
    LIMIT 500
  ),
  movement_totals AS MATERIALIZED (
    SELECT tipo::text AS tipo, COUNT(*) AS cantidad
    FROM public.movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND fecha >= v_since
    GROUP BY tipo
  ),
  active_lot_stock AS MATERIALIZED (
    SELECT
      sl.lote_id, sl.producto_id, sl.almacen_id, sl.cantidad,
      l.codigo, l.fecha_caducidad, l.fecha_fabricacion, l.costo, l.created_at
    FROM public.stock_lotes sl
    JOIN public.lotes l
      ON l.id = sl.lote_id
     AND l.empresa_id = p_empresa_id
     AND l.activo = true
    WHERE sl.empresa_id = p_empresa_id
      AND sl.cantidad > 0
  )
  SELECT jsonb_build_object(
    'window_days', v_days,
    'sales_by_product', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM sales_by_product s), '[]'::jsonb),
    'last_inbound', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM last_inbound i), '[]'::jsonb),
    'movement_trend', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha) FROM movement_trend t), '[]'::jsonb),
    'recent_movements', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM recent_movements m), '[]'::jsonb),
    'movement_count', COALESCE((SELECT SUM(mt.cantidad) FROM movement_totals mt), 0),
    'movement_type_counts', COALESCE(
      (SELECT jsonb_object_agg(mt.tipo, mt.cantidad)
       FROM movement_totals mt
       WHERE mt.tipo IS NOT NULL),
      '{}'::jsonb
    ),
    'lot_stock', COALESCE((SELECT jsonb_agg(to_jsonb(ls)) FROM active_lot_stock ls), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_inventory_intelligence_snapshot(uuid, integer)
  IS 'Snapshot agregado de inventario con autorización única por empresa.';

REVOKE ALL ON FUNCTION public.fn_inventory_intelligence_snapshot(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_inventory_intelligence_snapshot(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
