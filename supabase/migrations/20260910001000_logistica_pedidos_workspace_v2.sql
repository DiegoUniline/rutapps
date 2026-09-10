-- Logística > Pedidos V2
-- Objetivos:
-- 1) Una sola ejecución del RPC por página (sin fetchAllPages sobre el RPC).
-- 2) Evitar el costo RLS por cada venta_linea/entrega_linea usando SECURITY DEFINER,
--    pero validando explícitamente que el usuario sólo consulte su empresa (o sea super admin).
-- 3) Devolver filas + contadores + totales en un único JSON.
-- 4) Incluir todos los status de pedidos en la pestaña "Todos"; facturado/cancelado
--    no se mezclan con pestañas operativas.

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
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- SECURITY DEFINER sólo se usa para evitar reevaluar políticas RLS por cada línea.
  -- Esta validación mantiene el aislamiento multiempresa.
  IF NOT (
    public.is_super_admin(auth.uid())
    OR p_empresa_id = public.get_my_empresa_id()
  ) THEN
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
      -- Fecha de levantamiento: filtro indexable directamente en ventas.fecha.
      AND (
        COALESCE(p_fecha_tipo, 'levantamiento') = 'programada'
        OR (
          (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
        )
      )
      -- Fecha programada: preselección barata para no abrir todo el histórico.
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

REVOKE ALL ON FUNCTION public.fn_logistica_pedidos_workspace_v2(uuid, date, date, text, uuid[], text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_pedidos_workspace_v2(uuid, date, date, text, uuid[], text, text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_pedidos_workspace_v2(uuid, date, date, text, uuid[], text, text, integer, integer)
IS 'Workspace paginado de Logística > Pedidos. Valida tenant explícitamente y evita el costo RLS por línea.';
