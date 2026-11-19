-- Velocidad: totales mensuales del tablero sumados en la BD (antes la app descargaba
-- 12 meses de venta_lineas de mil en mil y sumaba en el navegador). Solo lectura;
-- SECURITY INVOKER: respeta RLS (cada usuario ve solo su empresa). Mismos filtros
-- que la versión anterior: empresa, rango de fecha, status <> cancelado.
CREATE OR REPLACE FUNCTION public.dashboard_evolucion_mensual(p_empresa_id uuid, p_from date, p_to date)
 RETURNS TABLE (tipo text, entidad_id uuid, nombre text, mes text, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH l AS (
    SELECT vl.producto_id, v.cliente_id, v.vendedor_id,
           to_char(v.fecha, 'YYYY-MM') AS mes, COALESCE(vl.total, 0) AS total
    FROM public.venta_lineas vl
    JOIN public.ventas v ON v.id = vl.venta_id
    WHERE vl.empresa_id = p_empresa_id AND v.empresa_id = p_empresa_id
      AND v.fecha >= p_from AND v.fecha <= p_to
      AND v.status::text <> 'cancelado'
  )
  SELECT 'producto', l.producto_id, p.nombre, l.mes, SUM(l.total)
    FROM l LEFT JOIN public.productos p ON p.id = l.producto_id
   WHERE l.producto_id IS NOT NULL GROUP BY l.producto_id, p.nombre, l.mes
  UNION ALL
  SELECT 'cliente', l.cliente_id, c.nombre, l.mes, SUM(l.total)
    FROM l LEFT JOIN public.clientes c ON c.id = l.cliente_id
   WHERE l.cliente_id IS NOT NULL GROUP BY l.cliente_id, c.nombre, l.mes
  UNION ALL
  SELECT 'vendedor', l.vendedor_id, pr.nombre, l.mes, SUM(l.total)
    FROM l LEFT JOIN public.profiles pr ON pr.id = l.vendedor_id
   WHERE l.vendedor_id IS NOT NULL GROUP BY l.vendedor_id, pr.nombre, l.mes;
$function$;

REVOKE ALL ON FUNCTION public.dashboard_evolucion_mensual(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_evolucion_mensual(uuid, date, date) TO authenticated, service_role;
