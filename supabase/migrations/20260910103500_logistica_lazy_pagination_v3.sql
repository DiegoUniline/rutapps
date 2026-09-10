-- Logística lazy loading + tamaños de página configurables
-- 0 en page_size significa "Todo" por decisión explícita del usuario.

CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_workspace_v2(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_fecha_tipo text DEFAULT 'levantamiento',
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_tab text DEFAULT 'pendientes',
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
  v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500) END;
  v_offset integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN 0 ELSE GREATEST(COALESCE(p_offset, 0), 0) END;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Fail closed: un usuario normal sólo puede consultar exactamente su empresa.
  -- Super admin conserva acceso multiempresa. SECURITY DEFINER evita reevaluar
  -- las políticas RLS correlacionadas en venta_lineas/entrega_lineas por cada fila.
  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT
      v.id,
      v.folio,
      v.cliente_id,
      c.nombre AS cliente_nombre,
      c.direccion AS cliente_direccion,
      c.telefono AS cliente_telefono,
      v.vendedor_id,
      vp.nombre AS vendedor_nombre,
      v.status::text AS status,
      v.fecha AS fecha,
      v.fecha_entrega AS fecha_entrega_original,
      COALESCE(v.total, 0)::numeric AS total,
      v.cerrado_at,
      v.notas,
      v.created_at
    FROM public.ventas v
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.profiles vp ON vp.id = v.vendedor_id
    WHERE v.empresa_id = p_empresa_id
      AND v.tipo = 'pedido'
      AND (
        p_vendedor_ids IS NULL
        OR cardinality(p_vendedor_ids) = 0
        OR v.vendedor_id = ANY(p_vendedor_ids)
      )
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR COALESCE(v.folio, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(c.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
      )
      AND (
        COALESCE(p_fecha_tipo, 'levantamiento') = 'programada'
        OR (
          (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
        )
      )
      AND (
        COALESCE(p_fecha_tipo, 'levantamiento') <> 'programada'
        OR (p_fecha_desde IS NULL AND p_fecha_hasta IS NULL)
        OR (
          (
            v.fecha_entrega IS NOT NULL
            AND (p_fecha_desde IS NULL OR v.fecha_entrega >= p_fecha_desde)
            AND (p_fecha_hasta IS NULL OR v.fecha_entrega <= p_fecha_hasta)
          )
          OR EXISTS (
            SELECT 1
            FROM public.entregas ex
            WHERE ex.pedido_id = v.id
              AND ex.status::text <> 'cancelado'
              AND (p_fecha_desde IS NULL OR ex.fecha >= p_fecha_desde)
              AND (p_fecha_hasta IS NULL OR ex.fecha <= p_fecha_hasta)
          )
        )
      )
  ),
  entrega_meta AS MATERIALIZED (
    SELECT
      e.pedido_id,
      MAX(e.fecha) FILTER (WHERE e.status::text <> 'cancelado') AS fecha_programada_actual,
      MAX(e.fecha_entrega) FILTER (WHERE e.status::text = 'hecho') AS fecha_entrega_real,
      BOOL_OR(e.status::text IN ('asignado', 'cargado', 'en_ruta')) AS tiene_en_ruta,
      (
        ARRAY_AGG(
          e.vendedor_ruta_id
          ORDER BY e.fecha DESC NULLS LAST, e.created_at DESC
        ) FILTER (
          WHERE e.status::text <> 'cancelado'
            AND e.vendedor_ruta_id IS NOT NULL
        )
      )[1] AS vendedor_ruta_id
    FROM public.entregas e
    INNER JOIN base b ON b.id = e.pedido_id
    GROUP BY e.pedido_id
  ),
  filtered AS MATERIALIZED (
    SELECT
      b.*,
      COALESCE(em.fecha_programada_actual, b.fecha_entrega_original) AS fecha_programada,
      em.fecha_entrega_real,
      COALESCE(em.tiene_en_ruta, false) AS tiene_en_ruta,
      em.vendedor_ruta_id,
      CASE
        WHEN COALESCE(p_fecha_tipo, 'levantamiento') = 'programada'
          THEN COALESCE(em.fecha_programada_actual, b.fecha_entrega_original, b.fecha)
        ELSE b.fecha
      END AS sort_date
    FROM base b
    LEFT JOIN entrega_meta em ON em.pedido_id = b.id
    WHERE
      COALESCE(p_fecha_tipo, 'levantamiento') <> 'programada'
      OR (
        (p_fecha_desde IS NULL OR COALESCE(em.fecha_programada_actual, b.fecha_entrega_original) >= p_fecha_desde)
        AND (p_fecha_hasta IS NULL OR COALESCE(em.fecha_programada_actual, b.fecha_entrega_original) <= p_fecha_hasta)
      )
  ),
  venta_producto AS MATERIALIZED (
    SELECT
      vl.venta_id,
      vl.producto_id,
      SUM(COALESCE(vl.cantidad, 0))::numeric AS cantidad,
      SUM(COALESCE(vl.cantidad, 0) * COALESCE(vl.precio_unitario, 0))::numeric AS valor
    FROM public.venta_lineas vl
    INNER JOIN filtered f ON f.id = vl.venta_id
    GROUP BY vl.venta_id, vl.producto_id
  ),
  entrega_producto AS MATERIALIZED (
    SELECT
      e.pedido_id,
      el.producto_id,
      SUM(CASE WHEN e.status::text = 'borrador' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS generada,
      SUM(CASE WHEN e.status::text IN ('surtido', 'asignado', 'cargado', 'en_ruta', 'hecho') THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS surtida,
      SUM(CASE WHEN e.status::text = 'hecho' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS entregada
    FROM public.entregas e
    INNER JOIN filtered f ON f.id = e.pedido_id
    INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.status::text <> 'cancelado'
    GROUP BY e.pedido_id, el.producto_id
  ),
  line_calc AS MATERIALIZED (
    SELECT
      vp.venta_id,
      vp.producto_id,
      vp.cantidad,
      COALESCE(ep.generada, 0)::numeric AS generada,
      COALESCE(ep.surtida, 0)::numeric AS surtida,
      COALESCE(ep.entregada, 0)::numeric AS entregada,
      GREATEST(0::numeric, vp.cantidad - COALESCE(ep.surtida, 0) - COALESCE(ep.generada, 0))::numeric AS pendiente,
      CASE
        WHEN vp.cantidad > 0 THEN
          GREATEST(0::numeric, vp.cantidad - COALESCE(ep.surtida, 0) - COALESCE(ep.generada, 0)) * (vp.valor / vp.cantidad)
        ELSE 0::numeric
      END AS valor_pendiente
    FROM venta_producto vp
    LEFT JOIN entrega_producto ep
      ON ep.pedido_id = vp.venta_id
     AND ep.producto_id IS NOT DISTINCT FROM vp.producto_id
  ),
  agg AS MATERIALIZED (
    SELECT
      f.id,
      COALESCE(SUM(lc.cantidad), 0)::numeric AS total_demanda,
      COALESCE(SUM(lc.generada), 0)::numeric AS total_generada,
      COALESCE(SUM(lc.surtida), 0)::numeric AS total_surtido,
      COALESCE(SUM(lc.entregada), 0)::numeric AS total_entregado,
      COALESCE(SUM(lc.pendiente), 0)::numeric AS total_pendiente,
      COALESCE(SUM(lc.valor_pendiente), 0)::numeric AS total_valor_pendiente,
      COUNT(*) FILTER (WHERE lc.pendiente > 0)::bigint AS lineas_pendientes
    FROM filtered f
    LEFT JOIN line_calc lc ON lc.venta_id = f.id
    GROUP BY f.id
  ),
  calc AS MATERIALIZED (
    SELECT
      f.*,
      a.total_demanda,
      a.total_generada,
      a.total_surtido,
      a.total_entregado,
      a.total_pendiente,
      a.total_valor_pendiente,
      a.lineas_pendientes,
      (a.total_demanda > 0 AND a.total_entregado >= a.total_demanda) AS fully_delivered,
      (a.total_demanda > 0 AND a.total_surtido >= a.total_demanda) AS fully_surtido,
      (
        NOT (a.total_demanda > 0 AND a.total_surtido >= a.total_demanda)
        AND a.total_demanda > 0
        AND (a.total_generada + a.total_surtido) >= a.total_demanda
      ) AS fully_generada
    FROM filtered f
    INNER JOIN agg a ON a.id = f.id
  ),
  final_calc AS MATERIALIZED (
    SELECT
      c.*,
      (NOT c.fully_delivered AND c.tiene_en_ruta) AS en_ruta,
      CASE
        WHEN c.fully_delivered THEN 'entregado'
        WHEN (NOT c.fully_delivered AND c.tiene_en_ruta) THEN 'en_ruta'
        WHEN c.fully_surtido THEN 'surtido_completo'
        WHEN c.total_surtido > 0 THEN 'surtido_parcial'
        WHEN c.total_generada > 0 AND c.fully_generada THEN 'pendiente_surtir'
        WHEN c.total_generada > 0 THEN 'en_surtido'
        ELSE NULL
      END AS estado_odoo,
      (
        c.cerrado_at IS NULL
        AND c.status NOT IN ('cancelado', 'facturado')
      ) AS operativo
    FROM calc c
  ),
  stats AS (
    SELECT
      COUNT(*) FILTER (WHERE operativo AND NOT fully_generada AND NOT fully_surtido AND NOT fully_delivered AND NOT en_ruta)::bigint AS pendientes,
      COUNT(*) FILTER (WHERE operativo AND fully_generada AND NOT fully_surtido AND NOT fully_delivered AND NOT en_ruta)::bigint AS generadas,
      COUNT(*) FILTER (WHERE operativo AND fully_surtido AND NOT fully_delivered AND NOT en_ruta)::bigint AS surtidos,
      COUNT(*) FILTER (WHERE operativo AND en_ruta AND NOT fully_delivered)::bigint AS en_ruta,
      COUNT(*) FILTER (WHERE operativo AND fully_delivered)::bigint AS entregados,
      COUNT(*) FILTER (WHERE cerrado_at IS NOT NULL)::bigint AS cerrados,
      COUNT(*)::bigint AS todos
    FROM final_calc
  ),
  tab_filtered AS MATERIALIZED (
    SELECT *
    FROM final_calc
    WHERE CASE COALESCE(p_tab, 'pendientes')
      WHEN 'todos' THEN true
      WHEN 'cerrados' THEN cerrado_at IS NOT NULL
      WHEN 'generadas' THEN operativo AND fully_generada AND NOT fully_surtido AND NOT fully_delivered AND NOT en_ruta
      WHEN 'surtidos' THEN operativo AND fully_surtido AND NOT fully_delivered AND NOT en_ruta
      WHEN 'en_ruta' THEN operativo AND en_ruta AND NOT fully_delivered
      WHEN 'entregados' THEN operativo AND fully_delivered
      ELSE operativo AND NOT fully_generada AND NOT fully_surtido AND NOT fully_delivered AND NOT en_ruta
    END
  ),
  tab_stats AS (
    SELECT
      COUNT(*)::bigint AS total_count,
      COALESCE(SUM(total_pendiente), 0)::numeric AS total_pendiente,
      COALESCE(SUM(total_valor_pendiente), 0)::numeric AS total_valor_pendiente
    FROM tab_filtered
  ),
  paged AS MATERIALIZED (
    SELECT *
    FROM tab_filtered
    ORDER BY sort_date DESC NULLS LAST, created_at DESC, id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ),
  rows_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'folio', p.folio,
          'cliente_id', p.cliente_id,
          'cliente_nombre', p.cliente_nombre,
          'cliente_direccion', p.cliente_direccion,
          'cliente_telefono', p.cliente_telefono,
          'vendedor_id', p.vendedor_id,
          'vendedor_nombre', p.vendedor_nombre,
          'status', p.status,
          'fecha', p.fecha,
          'fecha_programada', p.fecha_programada,
          'fecha_entrega_real', p.fecha_entrega_real,
          'total', p.total,
          'cerrado_at', p.cerrado_at,
          'notas', p.notas,
          'total_demanda', p.total_demanda,
          'total_generada', p.total_generada,
          'total_surtido', p.total_surtido,
          'total_entregado', p.total_entregado,
          'total_pendiente', p.total_pendiente,
          'total_valor_pendiente', p.total_valor_pendiente,
          'lineas_pendientes', p.lineas_pendientes,
          'fully_generada', p.fully_generada,
          'fully_surtido', p.fully_surtido,
          'fully_delivered', p.fully_delivered,
          'en_ruta', p.en_ruta,
          'estado_odoo', p.estado_odoo,
          'pct_generada', CASE WHEN p.total_demanda > 0 THEN ROUND((p.total_generada / p.total_demanda) * 100)::int ELSE 0 END,
          'pct_surtido', CASE WHEN p.total_demanda > 0 THEN ROUND((p.total_surtido / p.total_demanda) * 100)::int ELSE 0 END,
          'pct_entregado', CASE WHEN p.total_demanda > 0 THEN ROUND((p.total_entregado / p.total_demanda) * 100)::int ELSE 0 END,
          'vendedor_ruta_id', p.vendedor_ruta_id,
          'sort_date', p.sort_date
        )
        ORDER BY p.sort_date DESC NULLS LAST, p.created_at DESC, p.id DESC
      ),
      '[]'::jsonb
    ) AS rows
    FROM paged p
  )
  SELECT jsonb_build_object(
    'rows', r.rows,
    'page_size', v_page_size,
    'offset', v_offset,
    'total_count', ts.total_count,
    'total_pendiente', ts.total_pendiente,
    'total_valor_pendiente', ts.total_valor_pendiente,
    'counts', jsonb_build_object(
      'pendientes', s.pendientes,
      'generadas', s.generadas,
      'surtidos', s.surtidos,
      'en_ruta', s.en_ruta,
      'entregados', s.entregados,
      'cerrados', s.cerrados,
      'todos', s.todos
    )
  )
  INTO v_result
  FROM rows_json r
  CROSS JOIN stats s
  CROSS JOIN tab_stats ts;

  RETURN COALESCE(
    v_result,
    jsonb_build_object(
      'rows', '[]'::jsonb,
      'page_size', v_page_size,
      'offset', v_offset,
      'total_count', 0,
      'total_pendiente', 0,
      'total_valor_pendiente', 0,
      'counts', jsonb_build_object(
        'pendientes', 0,
        'generadas', 0,
        'surtidos', 0,
        'en_ruta', 0,
        'entregados', 0,
        'cerrados', 0,
        'todos', 0
      )
    )
  );
END;
$$;

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
  v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500) END;
  v_offset integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN 0 ELSE GREATEST(COALESCE(p_offset, 0), 0) END;
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

CREATE OR REPLACE FUNCTION public.fn_logistica_concentrado_pedidos_v3(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_fecha_field text DEFAULT 'fecha',
  p_statuses text[] DEFAULT NULL,
  p_tipo text DEFAULT 'pedido',
  p_vendedor_ids uuid[] DEFAULT NULL,
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
  v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500) END;
  v_offset integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN 0 ELSE GREATEST(COALESCE(p_offset, 0), 0) END;
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
      AND (COALESCE(cardinality(p_statuses), 0) = 0 OR v.status::text = ANY(p_statuses))
      AND (COALESCE(p_tipo, 'todos') = 'todos' OR v.tipo::text = p_tipo)
      AND (p_vendedor_ids IS NULL OR cardinality(p_vendedor_ids) = 0 OR v.vendedor_id = ANY(p_vendedor_ids))
      AND (
        COALESCE(p_fecha_field, 'fecha') <> 'fecha_entrega'
        OR ((p_fecha_desde IS NULL OR v.fecha_entrega >= p_fecha_desde) AND (p_fecha_hasta IS NULL OR v.fecha_entrega <= p_fecha_hasta))
      )
      AND (
        COALESCE(p_fecha_field, 'fecha') = 'fecha_entrega'
        OR ((p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde) AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta))
      )
  ),
  page_ventas AS MATERIALIZED (
    SELECT *
    FROM filtered_ventas
    ORDER BY fecha_entrega ASC NULLS LAST, folio ASC NULLS LAST, id
    LIMIT v_page_size OFFSET v_offset
  ),
  venta_producto AS MATERIALIZED (
    SELECT vl.venta_id, vl.producto_id, SUM(COALESCE(vl.cantidad, 0))::numeric AS requerido
    FROM public.venta_lineas vl
    INNER JOIN page_ventas pv ON pv.id = vl.venta_id
    GROUP BY vl.venta_id, vl.producto_id
  ),
  entrega_producto AS MATERIALIZED (
    SELECT e.pedido_id AS venta_id, el.producto_id, SUM(COALESCE(el.cantidad_entregada, 0))::numeric AS surtido
    FROM public.entregas e
    INNER JOIN page_ventas pv ON pv.id = e.pedido_id
    INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.status::text IN ('surtido', 'cargado', 'hecho')
    GROUP BY e.pedido_id, el.producto_id
  ),
  pedido_agg AS MATERIALIZED (
    SELECT
      pv.id,
      COALESCE(SUM(vp.requerido), 0)::numeric AS requerido,
      COALESCE(SUM(COALESCE(ep.surtido, 0)), 0)::numeric AS surtido,
      COALESCE(SUM(GREATEST(0::numeric, vp.requerido - COALESCE(ep.surtido, 0))), 0)::numeric AS pendiente
    FROM page_ventas pv
    LEFT JOIN venta_producto vp ON vp.venta_id = pv.id
    LEFT JOIN entrega_producto ep ON ep.venta_id = vp.venta_id AND ep.producto_id IS NOT DISTINCT FROM vp.producto_id
    GROUP BY pv.id
  ),
  pedidos_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pv.id,
      'folio', pv.folio,
      'fecha_entrega', pv.fecha_entrega,
      'status', pv.status,
      'tipo', pv.tipo,
      'cliente', COALESCE(pv.cliente_nombre, '—'),
      'vendedor_id', pv.vendedor_id,
      'vendedor', COALESCE(pv.vendedor_nombre, '—'),
      'total', COALESCE(pv.total, 0),
      'requerido', pa.requerido,
      'entregado', pa.surtido,
      'pendiente', pa.pendiente,
      'surtido_status', CASE
        WHEN pa.requerido = 0 THEN 'sin_lineas'
        WHEN pa.surtido <= 0 THEN 'pendiente'
        WHEN pa.pendiente <= 0 THEN 'surtido'
        ELSE 'parcial'
      END
    ) ORDER BY pv.fecha_entrega ASC NULLS LAST, pv.folio ASC NULLS LAST, pv.id), '[]'::jsonb) AS rows
    FROM page_ventas pv
    INNER JOIN pedido_agg pa ON pa.id = pv.id
  )
  SELECT jsonb_build_object(
    'pedidos', pj.rows,
    'pedidos_count', (SELECT COUNT(*) FROM filtered_ventas),
    'page_size', COALESCE(v_page_size, -1),
    'offset', v_offset
  ) INTO v_result
  FROM pedidos_json pj;

  RETURN COALESCE(v_result, jsonb_build_object('pedidos', '[]'::jsonb, 'pedidos_count', 0, 'page_size', COALESCE(v_page_size, -1), 'offset', v_offset));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_logistica_concentrado_pedidos_v3(uuid,date,date,text,text[],text,uuid[],integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_concentrado_pedidos_v3(uuid,date,date,text,text[],text,uuid[],integer,integer) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_concentrado_pedidos_v3(uuid,date,date,text,text[],text,uuid[],integer,integer)
IS 'Vista Por pedido del Concentrado: pagina ventas primero y calcula lineas solamente para la pagina visible; 0 = Todo.';
