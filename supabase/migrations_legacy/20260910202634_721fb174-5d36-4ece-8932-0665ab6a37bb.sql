-- Logística > Entregas + Concentrado a surtir V2
-- Reduce transferencias masivas al navegador y evita costo RLS correlacionado por línea.

CREATE OR REPLACE FUNCTION public.fn_logistica_entregas_workspace_v2(
  p_empresa_id uuid,
  p_search text DEFAULT NULL,
  p_vendedor_id uuid DEFAULT NULL,
  p_status text DEFAULT 'todos',
  p_ruta text DEFAULT 'todos',
  p_fecha_tipo text DEFAULT 'programada',
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT
      e.id,
      e.folio,
      e.fecha,
      e.fecha_entrega,
      e.status::text AS status,
      e.notas,
      e.pedido_id,
      e.vendedor_id,
      e.cliente_id,
      e.almacen_id,
      e.vendedor_ruta_id,
      e.fecha_asignacion,
      e.fecha_carga,
      e.validado_at,
      e.created_at,
      v.folio AS pedido_folio,
      v.fecha AS pedido_fecha
    FROM public.entregas e
    LEFT JOIN public.ventas v ON v.id = e.pedido_id
    WHERE e.empresa_id = p_empresa_id
      AND (NULLIF(BTRIM(p_search), '') IS NULL OR COALESCE(e.folio, '') ILIKE '%' || BTRIM(p_search) || '%')
      AND (p_vendedor_id IS NULL OR e.vendedor_id = p_vendedor_id)
      AND (
        COALESCE(p_ruta, 'todos') = 'todos'
        OR (p_ruta = 'sin_ruta' AND e.vendedor_ruta_id IS NULL)
        OR (p_ruta <> 'sin_ruta' AND e.vendedor_ruta_id::text = p_ruta)
      )
      AND (
        COALESCE(p_fecha_tipo, 'programada') <> 'levantamiento'
        OR (
          (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
        )
      )
      AND (
        COALESCE(p_fecha_tipo, 'programada') <> 'programada'
        OR (
          (p_fecha_desde IS NULL OR e.fecha >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR e.fecha <= p_fecha_hasta)
        )
      )
  ),
  status_counts AS (
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE status = 'borrador')::bigint AS borrador,
      COUNT(*) FILTER (WHERE status = 'surtido')::bigint AS surtido,
      COUNT(*) FILTER (WHERE status = 'asignado')::bigint AS asignado,
      COUNT(*) FILTER (WHERE status = 'cargado')::bigint AS cargado,
      COUNT(*) FILTER (WHERE status = 'en_ruta')::bigint AS en_ruta,
      COUNT(*) FILTER (WHERE status = 'listo')::bigint AS listo,
      COUNT(*) FILTER (WHERE status = 'hecho')::bigint AS hecho,
      COUNT(*) FILTER (WHERE status = 'no_entregado')::bigint AS no_entregado,
      COUNT(*) FILTER (WHERE status = 'cancelado')::bigint AS cancelado
    FROM base
  ),
  status_filtered AS MATERIALIZED (
    SELECT *
    FROM base
    WHERE COALESCE(p_status, 'todos') = 'todos' OR status = p_status
  ),
  page_ids AS MATERIALIZED (
    SELECT id, created_at
    FROM status_filtered
    ORDER BY created_at DESC, id DESC
    LIMIT v_page_size OFFSET v_offset
  ),
  details AS MATERIALIZED (
    SELECT
      b.*,
      c.nombre AS cliente_nombre,
      vend.nombre AS vendedor_nombre,
      vend.telefono AS vendedor_telefono,
      vend.almacen_id AS vendedor_almacen_destino_id,
      vend_a.nombre AS vendedor_almacen_destino_nombre,
      a.nombre AS almacen_nombre,
      vr.nombre AS vendedor_ruta_nombre,
      vr.telefono AS vendedor_ruta_telefono,
      vr.almacen_id AS vendedor_ruta_almacen_destino_id,
      vra.nombre AS vendedor_ruta_almacen_destino_nombre
    FROM page_ids p
    INNER JOIN base b ON b.id = p.id
    LEFT JOIN public.clientes c ON c.id = b.cliente_id
    LEFT JOIN public.profiles vend ON vend.id = b.vendedor_id
    LEFT JOIN public.almacenes vend_a ON vend_a.id = vend.almacen_id
    LEFT JOIN public.almacenes a ON a.id = b.almacen_id
    LEFT JOIN public.profiles vr ON vr.id = b.vendedor_ruta_id
    LEFT JOIN public.almacenes vra ON vra.id = vr.almacen_id
  ),
  rows_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'folio', d.folio,
        'fecha', d.fecha,
        'fecha_entrega', d.fecha_entrega,
        'status', d.status,
        'notas', d.notas,
        'pedido_id', d.pedido_id,
        'vendedor_id', d.vendedor_id,
        'cliente_id', d.cliente_id,
        'almacen_id', d.almacen_id,
        'vendedor_ruta_id', d.vendedor_ruta_id,
        'fecha_asignacion', d.fecha_asignacion,
        'fecha_carga', d.fecha_carga,
        'validado_at', d.validado_at,
        'created_at', d.created_at,
        'pedido_folio', d.pedido_folio,
        'pedido_fecha', d.pedido_fecha,
        'cliente_nombre', d.cliente_nombre,
        'vendedor_nombre', d.vendedor_nombre,
        'vendedor_telefono', d.vendedor_telefono,
        'vendedor_almacen_destino_id', d.vendedor_almacen_destino_id,
        'vendedor_almacen_destino_nombre', d.vendedor_almacen_destino_nombre,
        'almacen_nombre', d.almacen_nombre,
        'vendedor_ruta_nombre', d.vendedor_ruta_nombre,
        'vendedor_ruta_telefono', d.vendedor_ruta_telefono,
        'vendedor_ruta_almacen_destino_id', d.vendedor_ruta_almacen_destino_id,
        'vendedor_ruta_almacen_destino_nombre', d.vendedor_ruta_almacen_destino_nombre
      ) ORDER BY d.created_at DESC, d.id DESC
    ), '[]'::jsonb) AS rows
    FROM details d
  )
  SELECT jsonb_build_object(
    'rows', r.rows,
    'total_count', (SELECT COUNT(*) FROM status_filtered),
    'page_size', v_page_size,
    'offset', v_offset,
    'counts', jsonb_build_object(
      'total', sc.total,
      'borrador', sc.borrador,
      'surtido', sc.surtido,
      'asignado', sc.asignado,
      'cargado', sc.cargado,
      'en_ruta', sc.en_ruta,
      'listo', sc.listo,
      'hecho', sc.hecho,
      'no_entregado', sc.no_entregado,
      'cancelado', sc.cancelado
    )
  ) INTO v_result
  FROM rows_json r CROSS JOIN status_counts sc;

  RETURN COALESCE(v_result, jsonb_build_object(
    'rows', '[]'::jsonb, 'total_count', 0, 'page_size', v_page_size, 'offset', v_offset,
    'counts', jsonb_build_object('total',0,'borrador',0,'surtido',0,'asignado',0,'cargado',0,'en_ruta',0,'listo',0,'hecho',0,'no_entregado',0,'cancelado',0)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_logistica_entregas_workspace_v2(uuid,text,uuid,text,text,text,date,date,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_entregas_workspace_v2(uuid,text,uuid,text,text,text,date,date,integer,integer) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_entregas_workspace_v2(uuid,text,uuid,text,text,text,date,date,integer,integer)
IS 'Workspace paginado de Entregas con conteos en servidor y validación tenant fail-closed.';


CREATE OR REPLACE FUNCTION public.fn_logistica_concentrado_surtido_v2(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_fecha_field text DEFAULT 'fecha',
  p_statuses text[] DEFAULT NULL,
  p_tipo text DEFAULT 'pedido',
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_almacen_ids uuid[] DEFAULT NULL,
  p_pedido_page_size integer DEFAULT 50,
  p_pedido_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page_size integer := LEAST(GREATEST(COALESCE(p_pedido_page_size, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_pedido_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH filtered_ventas AS MATERIALIZED (
    SELECT
      v.id,
      v.folio,
      v.fecha,
      v.fecha_entrega,
      v.status::text AS status,
      v.tipo::text AS tipo,
      v.total,
      v.cliente_id,
      v.vendedor_id,
      c.nombre AS cliente_nombre,
      pv.nombre AS vendedor_nombre
    FROM public.ventas v
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.profiles pv ON pv.id = v.vendedor_id
    WHERE v.empresa_id = p_empresa_id
      AND (
        COALESCE(cardinality(p_statuses), 0) = 0
        OR v.status::text = ANY(p_statuses)
      )
      AND (
        COALESCE(p_tipo, 'todos') = 'todos'
        OR v.tipo::text = p_tipo
      )
      AND (
        p_vendedor_ids IS NULL
        OR cardinality(p_vendedor_ids) = 0
        OR v.vendedor_id = ANY(p_vendedor_ids)
      )
      AND (
        COALESCE(p_fecha_field, 'fecha') <> 'fecha_entrega'
        OR (
          (p_fecha_desde IS NULL OR v.fecha_entrega >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR v.fecha_entrega <= p_fecha_hasta)
        )
      )
      AND (
        COALESCE(p_fecha_field, 'fecha') = 'fecha_entrega'
        OR (
          (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
        )
      )
  ),
  venta_producto AS MATERIALIZED (
    SELECT vl.venta_id, vl.producto_id,
      SUM(COALESCE(vl.cantidad,0))::numeric AS requerido
    FROM public.venta_lineas vl
    INNER JOIN filtered_ventas fv ON fv.id = vl.venta_id
    GROUP BY vl.venta_id, vl.producto_id
  ),
  entrega_producto AS MATERIALIZED (
    SELECT e.pedido_id AS venta_id, el.producto_id,
      SUM(COALESCE(el.cantidad_entregada,0))::numeric AS surtido
    FROM public.entregas e
    INNER JOIN filtered_ventas fv ON fv.id = e.pedido_id
    INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.status::text IN ('surtido','cargado','hecho')
    GROUP BY e.pedido_id, el.producto_id
  ),
  line_calc AS MATERIALIZED (
    SELECT vp.venta_id, vp.producto_id, vp.requerido,
      COALESCE(ep.surtido,0)::numeric AS surtido,
      GREATEST(0::numeric, vp.requerido - COALESCE(ep.surtido,0))::numeric AS pendiente
    FROM venta_producto vp
    LEFT JOIN entrega_producto ep
      ON ep.venta_id = vp.venta_id
     AND ep.producto_id IS NOT DISTINCT FROM vp.producto_id
  ),
  pedido_agg AS MATERIALIZED (
    SELECT fv.id,
      COALESCE(SUM(lc.requerido),0)::numeric AS requerido,
      COALESCE(SUM(lc.surtido),0)::numeric AS surtido,
      COALESCE(SUM(lc.pendiente),0)::numeric AS pendiente
    FROM filtered_ventas fv
    LEFT JOIN line_calc lc ON lc.venta_id = fv.id
    GROUP BY fv.id
  ),
  producto_agg AS MATERIALIZED (
    SELECT lc.producto_id,
      SUM(lc.requerido)::numeric AS requerido,
      SUM(lc.surtido)::numeric AS surtido,
      SUM(lc.pendiente)::numeric AS pendiente
    FROM line_calc lc
    GROUP BY lc.producto_id
  ),
  stock_sel AS MATERIALIZED (
    SELECT sa.producto_id, SUM(COALESCE(sa.cantidad,0))::numeric AS stock
    FROM public.stock_almacen sa
    WHERE sa.empresa_id = p_empresa_id
      AND p_almacen_ids IS NOT NULL
      AND cardinality(p_almacen_ids) > 0
      AND sa.almacen_id = ANY(p_almacen_ids)
    GROUP BY sa.producto_id
  ),
  producto_final AS MATERIALIZED (
    SELECT
      pa.producto_id,
      COALESCE(p.codigo,'—') AS codigo,
      COALESCE(p.nombre,'—') AS nombre,
      pa.requerido,
      pa.surtido AS entregado,
      pa.pendiente,
      CASE
        WHEN p_almacen_ids IS NULL OR cardinality(p_almacen_ids) = 0
          THEN COALESCE(p.cantidad,0)::numeric
        ELSE COALESCE(ss.stock,0)::numeric
      END AS stock,
      GREATEST(0::numeric, pa.pendiente - CASE
        WHEN p_almacen_ids IS NULL OR cardinality(p_almacen_ids) = 0
          THEN COALESCE(p.cantidad,0)::numeric
        ELSE COALESCE(ss.stock,0)::numeric
      END)::numeric AS faltante,
      COALESCE(p.costo,0)::numeric AS costo,
      p.proveedor_preferido_id
    FROM producto_agg pa
    LEFT JOIN public.productos p ON p.id = pa.producto_id
    LEFT JOIN stock_sel ss ON ss.producto_id = pa.producto_id
  ),
  producto_stats AS (
    SELECT
      COUNT(*)::bigint AS productos,
      COUNT(*) FILTER (WHERE faltante > 0)::bigint AS con_faltante,
      COALESCE(SUM(faltante * costo) FILTER (WHERE faltante > 0),0)::numeric AS costo_faltante
    FROM producto_final
  ),
  productos_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'producto_id', pf.producto_id,
      'codigo', pf.codigo,
      'nombre', pf.nombre,
      'requerido', pf.requerido,
      'entregado', pf.entregado,
      'pendiente', pf.pendiente,
      'stock', pf.stock,
      'faltante', pf.faltante,
      'costo', pf.costo,
      'proveedor_preferido_id', pf.proveedor_preferido_id
    ) ORDER BY pf.faltante DESC, pf.nombre ASC), '[]'::jsonb) AS rows
    FROM producto_final pf
  ),
  pedido_page AS MATERIALIZED (
    SELECT fv.*, pa.requerido, pa.surtido, pa.pendiente
    FROM filtered_ventas fv
    INNER JOIN pedido_agg pa ON pa.id = fv.id
    ORDER BY fv.fecha_entrega ASC NULLS LAST, fv.folio ASC NULLS LAST, fv.id
    LIMIT v_page_size OFFSET v_offset
  ),
  pedidos_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pp.id,
      'folio', pp.folio,
      'fecha_entrega', pp.fecha_entrega,
      'status', pp.status,
      'tipo', pp.tipo,
      'cliente', COALESCE(pp.cliente_nombre,'—'),
      'vendedor_id', pp.vendedor_id,
      'vendedor', COALESCE(pp.vendedor_nombre,'—'),
      'total', COALESCE(pp.total,0),
      'requerido', pp.requerido,
      'entregado', pp.surtido,
      'pendiente', pp.pendiente,
      'surtido_status', CASE
        WHEN pp.requerido = 0 THEN 'sin_lineas'
        WHEN pp.surtido <= 0 THEN 'pendiente'
        WHEN pp.pendiente <= 0 THEN 'surtido'
        ELSE 'parcial'
      END
    ) ORDER BY pp.fecha_entrega ASC NULLS LAST, pp.folio ASC NULLS LAST, pp.id), '[]'::jsonb) AS rows
    FROM pedido_page pp
  )
  SELECT jsonb_build_object(
    'rows', pr.rows,
    'pedidos', pe.rows,
    'pedidos_count', (SELECT COUNT(*) FROM filtered_ventas),
    'pedido_page_size', v_page_size,
    'pedido_offset', v_offset,
    'productos_count', ps.productos,
    'con_faltante', ps.con_faltante,
    'costo_faltante', ps.costo_faltante
  ) INTO v_result
  FROM productos_json pr CROSS JOIN pedidos_json pe CROSS JOIN producto_stats ps;

  RETURN COALESCE(v_result, jsonb_build_object(
    'rows','[]'::jsonb,'pedidos','[]'::jsonb,'pedidos_count',0,
    'pedido_page_size',v_page_size,'pedido_offset',v_offset,
    'productos_count',0,'con_faltante',0,'costo_faltante',0
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_logistica_concentrado_surtido_v2(uuid,date,date,text,text[],text,uuid[],uuid[],integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_concentrado_surtido_v2(uuid,date,date,text,text[],text,uuid[],uuid[],integer,integer) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_concentrado_surtido_v2(uuid,date,date,text,text[],text,uuid[],uuid[],integer,integer)
IS 'Concentrado a surtir agregado en PostgreSQL: productos resumidos + pedidos paginados, con validación tenant fail-closed.';