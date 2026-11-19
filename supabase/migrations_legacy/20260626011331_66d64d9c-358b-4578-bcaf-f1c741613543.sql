
CREATE OR REPLACE FUNCTION public.stock_almacen_at_eod(p_almacen_id uuid, p_fecha date)
RETURNS TABLE(producto_id uuid, cantidad numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actual AS (
    SELECT sa.producto_id, sa.cantidad
    FROM public.stock_almacen sa
    WHERE sa.almacen_id = p_almacen_id
  ),
  movs_post AS (
    -- Movimientos posteriores al cierre del día seleccionado
    SELECT
      mi.producto_id,
      SUM(
        CASE WHEN mi.almacen_destino_id = p_almacen_id THEN mi.cantidad ELSE 0 END
        - CASE WHEN mi.almacen_origen_id  = p_almacen_id THEN mi.cantidad ELSE 0 END
      ) AS delta
    FROM public.movimientos_inventario mi
    WHERE (mi.almacen_destino_id = p_almacen_id OR mi.almacen_origen_id = p_almacen_id)
      AND mi.created_at > (p_fecha + INTERVAL '1 day')::timestamptz
    GROUP BY mi.producto_id
  )
  SELECT
    COALESCE(a.producto_id, m.producto_id) AS producto_id,
    COALESCE(a.cantidad, 0) - COALESCE(m.delta, 0) AS cantidad
  FROM actual a
  FULL OUTER JOIN movs_post m ON m.producto_id = a.producto_id
  WHERE COALESCE(a.cantidad, 0) - COALESCE(m.delta, 0) <> 0;
$$;

GRANT EXECUTE ON FUNCTION public.stock_almacen_at_eod(uuid, date) TO authenticated, service_role;
