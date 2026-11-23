-- D-060 (2026-11-23) · Dashboard y Reportes → Utilidad cuentan SOLO lo realmente vendido.
--
-- Regla (misma que src/lib/ventasRealizadas.ts):
--   * tipo = 'venta_directa' con status IN ('confirmado','entregado','facturado'), por `fecha`.
--   * tipo = 'pedido' con status IN ('entregado','facturado'), por fecha de entrega
--     (`fecha_entrega`; si es null, `fecha`). Un pedido levantado en octubre y entregado
--     en noviembre cuenta en noviembre.
--   * Nunca borradores, cancelados ni pedidos sin entregar. Siempre es_saldo_inicial = false
--     y filtro por empresa.
--
-- Funciones (misma firma, CREATE OR REPLACE; los permisos existentes se conservan):
--   1. dashboard_costo_ventas(uuid,date,date,uuid)  → costo = cantidad × costo del producto
--      activo, igual que antes; mismo chequeo de autorización (is_super_admin OR
--      get_my_empresa_id). SECURITY DEFINER como antes.
--   2. dashboard_top_productos(uuid,date,date)       → Rankings del Dashboard.
--   3. dashboard_evolucion_mensual(uuid,date,date)   → pestaña Evolución; los pedidos se
--      agrupan en el mes de su entrega.
--   (2 y 3 siguen siendo SECURITY INVOKER: RLS de ventas/venta_lineas aplica igual que antes.)
--
-- Índices: no se crea ninguno. Cada rama usa uno existente (verificado en prod 2026-11-23):
--   directas            → idx_ventas_empresa_tipo_status_fecha (empresa_id, tipo, status, fecha DESC)
--   pedidos con entrega → idx_ventas_logistica_pedidos_fecha_entrega (empresa_id, fecha_entrega DESC)
--                         WHERE tipo='pedido' AND fecha_entrega IS NOT NULL
--   pedidos sin entrega → idx_ventas_logistica_pedidos_fecha (empresa_id, fecha DESC) WHERE tipo='pedido'
--
-- CÓMO REVERTIR: volver a crear las tres funciones con su definición anterior (la de
-- supabase/migrations/20261119000001_base_public.sql, idéntica a la de producción al
-- 2026-11-23). El cambio de las tres era solo el WHERE:
--   dashboard_costo_ventas:      v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
--                                AND v.fecha BETWEEN p_from AND p_to AND v.status <> 'cancelado'
--                                AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
--   dashboard_top_productos:     vl.empresa_id = p_empresa_id AND v.empresa_id = p_empresa_id
--                                AND v.fecha BETWEEN p_from AND p_to AND v.status::text <> 'cancelado'
--                                AND vl.producto_id IS NOT NULL
--   dashboard_evolucion_mensual: mes = to_char(v.fecha,'YYYY-MM'); mismo WHERE que top_productos
--                                sin la condición de producto.
-- Revertir no toca datos (solo funciones de lectura).

-- ─── 1. Costo de lo vendido ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_costo_ventas(p_empresa_id uuid, p_from date, p_to date, p_vendedor_id uuid DEFAULT NULL::uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_costo numeric;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR p_empresa_id = public.get_my_empresa_id()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Tres conjuntos disjuntos (UNION ALL no duplica): cada uno usa su índice.
  WITH realizadas AS (
    SELECT v.id
      FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'venta_directa'
       AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
    UNION ALL
    SELECT v.id
      FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido'
       AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NOT NULL
       AND v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
    UNION ALL
    SELECT v.id
      FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido'
       AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NULL
       AND v.fecha >= p_from AND v.fecha <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
  )
  SELECT COALESCE(SUM(vl.cantidad * COALESCE(pr.costo, 0)), 0)
    INTO v_costo
  FROM realizadas r
  JOIN public.venta_lineas vl ON vl.venta_id = r.id
  LEFT JOIN public.productos pr
    ON pr.id = vl.producto_id
   AND pr.empresa_id = p_empresa_id
   AND pr.status = 'activo';

  RETURN COALESCE(v_costo, 0);
END;
$function$;

-- Permisos vigentes en producción (2026-11-23): sin PUBLIC ni anon. Se reafirman para que
-- un entorno nuevo (que parte del dump base con GRANT a anon) quede igual que producción.
REVOKE ALL ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) TO authenticated, service_role;

-- ─── 2. Top productos (Rankings) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_top_productos(p_empresa_id uuid, p_from date, p_to date)
RETURNS TABLE(id uuid, nombre text, codigo text, qty numeric, total numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH realizadas AS (
    SELECT v.id FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'venta_directa' AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
    UNION ALL
    SELECT v.id FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NOT NULL AND v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to
    UNION ALL
    SELECT v.id FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NULL AND v.fecha >= p_from AND v.fecha <= p_to
  )
  SELECT vl.producto_id, p.nombre::text, p.codigo::text,
         SUM(COALESCE(vl.cantidad, 0))::numeric, SUM(COALESCE(vl.total, 0))::numeric
  FROM realizadas r
  JOIN public.venta_lineas vl ON vl.venta_id = r.id
  LEFT JOIN public.productos p ON p.id = vl.producto_id
  WHERE vl.empresa_id = p_empresa_id
    AND vl.producto_id IS NOT NULL
  GROUP BY vl.producto_id, p.nombre, p.codigo
  ORDER BY 5 DESC;
$function$;

-- ─── 3. Evolución mensual (producto / cliente / vendedor) ───────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_evolucion_mensual(p_empresa_id uuid, p_from date, p_to date)
RETURNS TABLE(tipo text, entidad_id uuid, nombre text, mes text, total numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH realizadas AS (
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha AS fecha_venta FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'venta_directa' AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
    UNION ALL
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha_entrega FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NOT NULL AND v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to
    UNION ALL
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NULL AND v.fecha >= p_from AND v.fecha <= p_to
  ),
  l AS (
    SELECT vl.producto_id, r.cliente_id, r.vendedor_id, to_char(r.fecha_venta, 'YYYY-MM') AS mes, COALESCE(vl.total, 0) AS total
    FROM realizadas r JOIN public.venta_lineas vl ON vl.venta_id = r.id
    WHERE vl.empresa_id = p_empresa_id)
  SELECT 'producto', l.producto_id, p.nombre, l.mes, SUM(l.total) FROM l LEFT JOIN public.productos p ON p.id = l.producto_id WHERE l.producto_id IS NOT NULL GROUP BY l.producto_id, p.nombre, l.mes
  UNION ALL SELECT 'cliente', l.cliente_id, c.nombre, l.mes, SUM(l.total) FROM l LEFT JOIN public.clientes c ON c.id = l.cliente_id WHERE l.cliente_id IS NOT NULL GROUP BY l.cliente_id, c.nombre, l.mes
  UNION ALL SELECT 'vendedor', l.vendedor_id, pr.nombre, l.mes, SUM(l.total) FROM l LEFT JOIN public.profiles pr ON pr.id = l.vendedor_id WHERE l.vendedor_id IS NOT NULL GROUP BY l.vendedor_id, pr.nombre, l.mes;
$function$;
