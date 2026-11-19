CREATE OR REPLACE FUNCTION public.stock_almacen_at_eod(p_almacen_id uuid, p_fecha date)
RETURNS TABLE(producto_id uuid, cantidad numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH tz AS (
    SELECT COALESCE(NULLIF(e.zona_horaria, ''), 'America/Mexico_City') AS zh
    FROM public.almacenes a
    LEFT JOIN public.empresas e ON e.id = a.empresa_id
    WHERE a.id = p_almacen_id
    LIMIT 1
  ),
  cutoff AS (
    SELECT (((p_fecha + INTERVAL '1 day')::timestamp) AT TIME ZONE (SELECT zh FROM tz)) AS ts
  ),
  actual AS (
    SELECT sa.producto_id, sa.cantidad
    FROM public.stock_almacen sa
    WHERE sa.almacen_id = p_almacen_id
  ),
  movs_post AS (
    SELECT
      mi.producto_id,
      SUM(
        CASE WHEN mi.almacen_destino_id = p_almacen_id THEN mi.cantidad ELSE 0 END
        - CASE WHEN mi.almacen_origen_id  = p_almacen_id THEN mi.cantidad ELSE 0 END
      ) AS delta
    FROM public.movimientos_inventario mi, cutoff c
    WHERE (mi.almacen_destino_id = p_almacen_id OR mi.almacen_origen_id = p_almacen_id)
      AND mi.created_at > c.ts
    GROUP BY mi.producto_id
  )
  SELECT
    COALESCE(a.producto_id, m.producto_id) AS producto_id,
    COALESCE(a.cantidad, 0) - COALESCE(m.delta, 0) AS cantidad
  FROM actual a
  FULL OUTER JOIN movs_post m ON m.producto_id = a.producto_id
  WHERE COALESCE(a.cantidad, 0) - COALESCE(m.delta, 0) <> 0;
$function$;