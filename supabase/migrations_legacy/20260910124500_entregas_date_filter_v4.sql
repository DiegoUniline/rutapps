-- Entregas: filtro de fecha centralizado y server-side.
-- Mantiene la firma del RPC V2 para no romper consumidores existentes.
-- Modos soportados:
--   programada   -> entregas.fecha
--   real         -> entregas.fecha_entrega
--   creacion     -> entregas.created_at
--   levantamiento-> ventas.fecha (compatibilidad con UI/consumidores anteriores)

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_fecha_entrega
  ON public.entregas (empresa_id, fecha_entrega DESC)
  WHERE fecha_entrega IS NOT NULL;

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
  v_page_size integer := CASE
    WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL
    ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500)
  END;
  v_offset integer := CASE
    WHEN COALESCE(p_page_size, 50) <= 0 THEN 0
    ELSE GREATEST(COALESCE(p_offset, 0), 0)
  END;
  v_result jsonb;
  v_search text := NULLIF(BTRIM(p_search), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH candidate_ids AS MATERIALIZED (
    -- Fecha programada de entrega: entregas.fecha.
    SELECT e.id
    FROM public.entregas e
    WHERE COALESCE(p_fecha_tipo, 'programada') = 'programada'
      AND e.empresa_id = p_empresa_id
      AND (p_fecha_desde IS NULL OR e.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR e.fecha < (p_fecha_hasta + 1))

    UNION ALL

    -- Fecha real: entregas.fecha_entrega.
    SELECT e.id
    FROM public.entregas e
    WHERE p_fecha_tipo = 'real'
      AND e.empresa_id = p_empresa_id
      AND (p_fecha_desde IS NULL OR e.fecha_entrega >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR e.fecha_entrega < (p_fecha_hasta + 1))

    UNION ALL

    -- Fecha de creación: half-open interval para conservar el índice de created_at.
    SELECT e.id
    FROM public.entregas e
    WHERE p_fecha_tipo = 'creacion'
      AND e.empresa_id = p_empresa_id
      AND (p_fecha_desde IS NULL OR e.created_at >= p_fecha_desde::timestamptz)
      AND (p_fecha_hasta IS NULL OR e.created_at < (p_fecha_hasta + 1)::timestamptz)

    UNION ALL

    -- Compatibilidad: fecha de levantamiento del pedido asociado.
    SELECT e.id
    FROM public.entregas e
    INNER JOIN public.ventas v ON v.id = e.pedido_id
    WHERE p_fecha_tipo = 'levantamiento'
      AND e.empresa_id = p_empresa_id
      AND (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR v.fecha < (p_fecha_hasta + 1))
  ),
  base AS MATERIALIZED (
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
    FROM candidate_ids ci
    INNER JOIN public.entregas e ON e.id = ci.id
    LEFT JOIN public.ventas v ON v.id = e.pedido_id
    WHERE
      (p_vendedor_id IS NULL OR e.vendedor_id = p_vendedor_id)
      AND (
        COALESCE(p_ruta, 'todos') = 'todos'
        OR (p_ruta = 'sin_ruta' AND e.vendedor_ruta_id IS NULL)
        OR (p_ruta <> 'sin_ruta' AND e.vendedor_ruta_id::text = p_ruta)
      )
      AND (
        v_search IS NULL
        OR COALESCE(e.folio, '') ILIKE '%' || v_search || '%'
        OR COALESCE(v.folio, '') ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.clientes cs
          WHERE cs.id = e.cliente_id
            AND COALESCE(cs.nombre, '') ILIKE '%' || v_search || '%'
        )
        OR EXISTS (
          SELECT 1
          FROM public.profiles ps
          WHERE ps.id IN (e.vendedor_id, e.vendedor_ruta_id)
            AND COALESCE(ps.nombre, '') ILIKE '%' || v_search || '%'
        )
        OR EXISTS (
          SELECT 1
          FROM public.entrega_lineas els
          INNER JOIN public.productos prs ON prs.id = els.producto_id
          WHERE els.entrega_id = e.id
            AND (
              COALESCE(prs.codigo, '') ILIKE '%' || v_search || '%'
              OR COALESCE(prs.nombre, '') ILIKE '%' || v_search || '%'
            )
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
    WHERE COALESCE(p_status, 'todos') = 'todos'
       OR status = p_status
  ),
  page_ids AS MATERIALIZED (
    SELECT id, created_at
    FROM status_filtered
    ORDER BY created_at DESC, id DESC
    LIMIT v_page_size
    OFFSET v_offset
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
    SELECT COALESCE(
      jsonb_agg(
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
        )
        ORDER BY d.created_at DESC, d.id DESC
      ),
      '[]'::jsonb
    ) AS rows
    FROM details d
  )
  SELECT jsonb_build_object(
    'rows', r.rows,
    'total_count', (SELECT COUNT(*) FROM status_filtered),
    'page_size', COALESCE(v_page_size, -1),
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
  )
  INTO v_result
  FROM rows_json r
  CROSS JOIN status_counts sc;

  RETURN COALESCE(
    v_result,
    jsonb_build_object(
      'rows', '[]'::jsonb,
      'total_count', 0,
      'page_size', COALESCE(v_page_size, -1),
      'offset', v_offset,
      'counts', jsonb_build_object(
        'total', 0,
        'borrador', 0,
        'surtido', 0,
        'asignado', 0,
        'cargado', 0,
        'en_ruta', 0,
        'listo', 0,
        'hecho', 0,
        'no_entregado', 0,
        'cancelado', 0
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_logistica_entregas_workspace_v2(
  uuid, text, uuid, text, text, text, date, date, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_logistica_entregas_workspace_v2(
  uuid, text, uuid, text, text, text, date, date, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_entregas_workspace_v2(
  uuid, text, uuid, text, text, text, date, date, integer, integer
) IS 'Entregas paginadas: filtro centralizado por fecha programada, real, creación o levantamiento; búsqueda server-side y aislamiento tenant fail-closed.';
