-- Velocidad del tablero: dos agregados que el navegador calculaba bajando filas.
--  * dashboard_ultima_compra_clientes: última compra por cliente (antes bajaba
--    TODO el historial de ventas para quedarse con max(fecha)).
--  * dashboard_top_productos: unidades y total por producto del periodo (antes
--    ventas del periodo + venta_lineas en tandas de 150 en serie).
-- Mismas reglas que el código que reemplazan. SECURITY INVOKER: aplica RLS.

CREATE OR REPLACE FUNCTION public.dashboard_ultima_compra_clientes(p_empresa_id uuid)
 RETURNS TABLE (cliente_id uuid, fecha date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT v.cliente_id, MAX(v.fecha)
  FROM public.ventas v
  WHERE v.empresa_id = p_empresa_id
    AND v.cliente_id IS NOT NULL
    AND v.status::text <> 'cancelado'
  GROUP BY v.cliente_id;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_top_productos(p_empresa_id uuid, p_from date, p_to date)
 RETURNS TABLE (id uuid, nombre text, codigo text, qty numeric, total numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT vl.producto_id, p.nombre::text, p.codigo::text,
         SUM(COALESCE(vl.cantidad, 0))::numeric, SUM(COALESCE(vl.total, 0))::numeric
  FROM public.venta_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  LEFT JOIN public.productos p ON p.id = vl.producto_id
  WHERE vl.empresa_id = p_empresa_id AND v.empresa_id = p_empresa_id
    AND v.fecha >= p_from AND v.fecha <= p_to
    AND v.status::text <> 'cancelado'
    AND vl.producto_id IS NOT NULL
  GROUP BY vl.producto_id, p.nombre, p.codigo
  ORDER BY 5 DESC;
$function$;

REVOKE ALL ON FUNCTION public.dashboard_ultima_compra_clientes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dashboard_top_productos(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_ultima_compra_clientes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_top_productos(uuid, date, date) TO authenticated, service_role;
