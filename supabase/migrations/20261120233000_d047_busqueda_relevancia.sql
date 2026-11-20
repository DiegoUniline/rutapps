-- D-047 · Búsqueda por relevancia antes que por fecha.
-- Con texto de búsqueda, las listas ordenan primero:
--   0) folio/código idéntico (sin importar mayúsculas) o mismo número de folio
--      («2000», «ent-2000» o «ENT-002000» encuentran ENT-2000),
--   1) folio/código o nombre que EMPIEZA con el texto,
--   2) el resto (contiene), y dentro de cada grupo el orden normal de la lista.
-- Solo agrega el orden (y que el folio exacto/número se encuentre aunque no «contenga» el texto);
-- firmas, seguridad, columnas devueltas, paginación y totales no cambian.
-- Espejo en el front: src/lib/busquedaRelevancia.ts (mantener en sincronía).

-- 1) Función común: 0 exacto · 1 empieza con · 2 contiene · 3 no coincide.
--    p_es_folio=false (nombres): nunca da 0 (idéntico cuenta como «empieza con»).
--    Una sola expresión SQL IMMUTABLE (sin SET ni FROM) para que el planificador la incruste.
CREATE OR REPLACE FUNCTION public.fn_busqueda_relevancia(p_valor text, p_busqueda text, p_es_folio boolean DEFAULT true)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_valor IS NULL OR btrim(COALESCE(p_busqueda, '')) = '' THEN 3
    WHEN p_es_folio AND (
      lower(btrim(p_valor)) = lower(btrim(p_busqueda))
      OR (
        -- Mismo número de folio: el texto buscado tiene forma de folio (letras opcionales,
        -- separador opcional y dígitos) y el número (sin ceros a la izquierda) coincide;
        -- si trae letras, el prefijo del folio también debe coincidir.
        btrim(p_busqueda) ~ '^[A-Za-z]*[^0-9A-Za-z]*0*[1-9][0-9]*$'
        -- Descarte barato primero (el folio debe contener esos dígitos) antes de las expresiones regulares.
        AND strpos(p_valor, ltrim(pg_catalog.substring(btrim(p_busqueda), '([0-9]+)$'), '0')) > 0
        AND btrim(p_valor) ~ '[0-9]$'
        AND ltrim(pg_catalog.substring(btrim(p_valor), '([0-9]+)$'), '0')
          = ltrim(pg_catalog.substring(btrim(p_busqueda), '([0-9]+)$'), '0')
        AND (
          btrim(p_busqueda) ~ '^[^A-Za-z]'
          OR lower(pg_catalog.regexp_replace(btrim(p_valor), '[^0-9A-Za-z]*[0-9]+$', ''))
            = lower(pg_catalog.substring(btrim(p_busqueda), '^([A-Za-z]*)'))
        )
      )
    ) THEN 0
    WHEN left(lower(p_valor), length(btrim(p_busqueda))) = lower(btrim(p_busqueda)) THEN 1
    WHEN strpos(lower(p_valor), lower(btrim(p_busqueda))) > 0 THEN 2
    ELSE 3
  END
$$;

COMMENT ON FUNCTION public.fn_busqueda_relevancia(text, text, boolean) IS
  'D-047: relevancia de búsqueda (0 folio/código exacto o mismo número de folio, 1 empieza con, 2 contiene, 3 no coincide). Espejo: src/lib/busquedaRelevancia.ts.';

REVOKE ALL ON FUNCTION public.fn_busqueda_relevancia(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_busqueda_relevancia(text, text, boolean) TO authenticated, service_role;

-- 2) Entregas
CREATE OR REPLACE FUNCTION public.fn_logistica_entregas_workspace_v2(p_empresa_id uuid, p_search text DEFAULT NULL::text, p_vendedor_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'todos'::text, p_ruta text DEFAULT 'todos'::text, p_fecha_tipo text DEFAULT 'programada'::text, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_page_size integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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
  -- D-047: número buscado si el texto tiene forma de folio («2000», «ENT-002000»); NULL si no.
  v_num text := CASE WHEN BTRIM(p_search) ~ '^[A-Za-z]*[^0-9A-Za-z]*0*[1-9][0-9]*$' THEN ltrim(substring(BTRIM(p_search), '([0-9]+)$'), '0') END;
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
      v.fecha AS pedido_fecha,
      -- D-047: relevancia de la búsqueda (0 folio exacto, 1 empieza con, 2 contiene, 3 otro).
      CASE WHEN v_search IS NULL THEN 0 ELSE (
        SELECT CASE WHEN x.r <= 1 THEN x.r ELSE LEAST(x.r, COALESCE((
          SELECT MIN(LEAST(public.fn_busqueda_relevancia(prs.codigo, v_search, false), public.fn_busqueda_relevancia(prs.nombre, v_search, false)))
          FROM public.entrega_lineas els
          INNER JOIN public.productos prs ON prs.id = els.producto_id
          WHERE els.entrega_id = e.id
        ), 3)) END
        FROM (SELECT LEAST(
          public.fn_busqueda_relevancia(e.folio, v_search),
          public.fn_busqueda_relevancia(v.folio, v_search),
          COALESCE((SELECT public.fn_busqueda_relevancia(cs.nombre, v_search, false) FROM public.clientes cs WHERE cs.id = e.cliente_id), 3),
          COALESCE((SELECT MIN(public.fn_busqueda_relevancia(ps.nombre, v_search, false)) FROM public.profiles ps WHERE ps.id IN (e.vendedor_id, e.vendedor_ruta_id)), 3)
        ) AS r) x
      ) END AS relevancia
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
        OR (v_num IS NOT NULL AND strpos(e.folio, v_num) > 0 AND public.fn_busqueda_relevancia(e.folio, v_search) = 0)
        OR (v_num IS NOT NULL AND strpos(v.folio, v_num) > 0 AND public.fn_busqueda_relevancia(v.folio, v_search) = 0)
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
    SELECT id, created_at, relevancia
    FROM status_filtered
    ORDER BY relevancia, created_at DESC, id DESC
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
        ORDER BY d.relevancia, d.created_at DESC, d.id DESC
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

-- 3) Pedidos (Operación): página y contadores con el mismo filtro
CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_page_v4(p_empresa_id uuid, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_fecha_tipo text DEFAULT 'levantamiento'::text, p_vendedor_ids uuid[] DEFAULT NULL::uuid[], p_search text DEFAULT NULL::text, p_tab text DEFAULT 'pendientes'::text, p_page_size integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  -- D-047: número buscado si el texto tiene forma de folio («2000», «PED-002000»); NULL si no.
  v_num text := CASE WHEN BTRIM(p_search) ~ '^[A-Za-z]*[^0-9A-Za-z]*0*[1-9][0-9]*$' THEN ltrim(substring(BTRIM(p_search), '([0-9]+)$'), '0') END;
  v_page_size integer := CASE
    WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL
    ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500)
  END;
  v_offset integer := CASE
    WHEN COALESCE(p_page_size, 50) <= 0 THEN 0
    ELSE GREATEST(COALESCE(p_offset, 0), 0)
  END;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH page_rows AS MATERIALIZED (
    SELECT
      v.id,
      v.folio,
      v.cliente_id,
      c.nombre AS cliente_nombre,
      v.vendedor_id,
      vend.nombre AS vendedor_nombre,
      v.status::text AS status,
      v.fecha AS fecha,
      COALESCE(v.total, 0)::numeric AS total,
      v.cerrado_at,
      r.total_demanda,
      r.total_generada,
      r.total_surtido,
      r.total_entregado,
      r.total_pendiente,
      r.total_valor_pendiente,
      r.lineas_pendientes,
      r.fully_generada,
      r.fully_surtido,
      r.fully_delivered,
      r.en_ruta,
      r.estado_odoo,
      r.bucket,
      r.fecha_programada,
      r.fecha_entrega_real,
      r.vendedor_ruta_id,
      rep.nombre AS vendedor_ruta_nombre,
      CASE
        WHEN COALESCE(p_fecha_tipo, 'levantamiento') = 'programada'
          THEN COALESCE(r.fecha_programada, v.fecha_entrega, v.fecha)
        ELSE v.fecha
      END AS sort_date,
      v.created_at,
      -- D-047: relevancia de la búsqueda (0 folio exacto, 1 empieza con, 2 contiene, 3 otro).
      CASE WHEN NULLIF(BTRIM(p_search), '') IS NULL THEN 0 ELSE (
        SELECT CASE WHEN x.r <= 1 THEN x.r ELSE LEAST(x.r, COALESCE((
          SELECT MIN(LEAST(public.fn_busqueda_relevancia(pr.codigo, p_search, false), public.fn_busqueda_relevancia(pr.nombre, p_search, false)))
          FROM public.venta_lineas vl
          INNER JOIN public.productos pr ON pr.id = vl.producto_id
          WHERE vl.venta_id = v.id
        ), 3)) END
        FROM (SELECT LEAST(
          public.fn_busqueda_relevancia(v.folio, p_search),
          public.fn_busqueda_relevancia(c.nombre, p_search, false),
          public.fn_busqueda_relevancia(vend.nombre, p_search, false),
          public.fn_busqueda_relevancia(rep.nombre, p_search, false)
        ) AS r) x
      ) END AS relevancia
    FROM public.ventas v
    INNER JOIN public.logistica_pedido_resumen r ON r.pedido_id = v.id
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.profiles vend ON vend.id = v.vendedor_id
    LEFT JOIN public.profiles rep ON rep.id = r.vendedor_ruta_id
    WHERE v.empresa_id = p_empresa_id
      AND v.tipo = 'pedido'
      AND (
        COALESCE(p_tab, 'pendientes') = 'todos'
        OR r.bucket = COALESCE(p_tab, 'pendientes')
      )
      AND (
        p_vendedor_ids IS NULL
        OR cardinality(p_vendedor_ids) = 0
        OR v.vendedor_id = ANY(p_vendedor_ids)
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
        OR (
          (p_fecha_desde IS NULL OR r.fecha_programada >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR r.fecha_programada <= p_fecha_hasta)
        )
      )
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR COALESCE(v.folio, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR (v_num IS NOT NULL AND strpos(v.folio, v_num) > 0 AND public.fn_busqueda_relevancia(v.folio, p_search) = 0)
        OR COALESCE(c.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(vend.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(rep.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR EXISTS (
          SELECT 1
          FROM public.venta_lineas vl
          INNER JOIN public.productos pr ON pr.id = vl.producto_id
          WHERE vl.venta_id = v.id
            AND (
              COALESCE(pr.codigo, '') ILIKE '%' || BTRIM(p_search) || '%'
              OR COALESCE(pr.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
            )
        )
      )
    ORDER BY relevancia, sort_date DESC NULLS LAST, v.created_at DESC, v.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ),
  rows_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'folio', p.folio,
        'cliente_id', p.cliente_id,
        'cliente_nombre', p.cliente_nombre,
        'vendedor_id', p.vendedor_id,
        'vendedor_nombre', p.vendedor_nombre,
        'status', p.status,
        'fecha', p.fecha,
        'total', p.total,
        'cerrado_at', p.cerrado_at,
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
        'fecha_programada', p.fecha_programada,
        'fecha_entrega_real', p.fecha_entrega_real,
        'vendedor_ruta_id', p.vendedor_ruta_id,
        'vendedor_ruta_nombre', p.vendedor_ruta_nombre,
        'pct_generada', CASE WHEN p.total_demanda > 0 THEN ROUND((p.total_generada / p.total_demanda) * 100)::int ELSE 0 END,
        'pct_surtido', CASE WHEN p.total_demanda > 0 THEN ROUND((p.total_surtido / p.total_demanda) * 100)::int ELSE 0 END,
        'pct_entregado', CASE WHEN p.total_demanda > 0 THEN ROUND((p.total_entregado / p.total_demanda) * 100)::int ELSE 0 END
      ) ORDER BY p.relevancia, p.sort_date DESC NULLS LAST, p.created_at DESC, p.id DESC
    ), '[]'::jsonb) AS rows
    FROM page_rows p
  )
  SELECT jsonb_build_object(
    'rows', rows,
    'row_count', jsonb_array_length(rows),
    'page_size', COALESCE(v_page_size, -1),
    'offset', v_offset,
    'db_ms', ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::numeric, 2)
  )
  INTO v_result
  FROM rows_json;

  RETURN COALESCE(v_result, jsonb_build_object('rows','[]'::jsonb,'row_count',0,'page_size',COALESCE(v_page_size,-1),'offset',v_offset,'db_ms',0));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_counts_v4(p_empresa_id uuid, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_fecha_tipo text DEFAULT 'levantamiento'::text, p_vendedor_ids uuid[] DEFAULT NULL::uuid[], p_search text DEFAULT NULL::text, p_tab text DEFAULT 'pendientes'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  -- D-047: número buscado si el texto tiene forma de folio («2000», «PED-002000»); NULL si no.
  v_num text := CASE WHEN BTRIM(p_search) ~ '^[A-Za-z]*[^0-9A-Za-z]*0*[1-9][0-9]*$' THEN ltrim(substring(BTRIM(p_search), '([0-9]+)$'), '0') END;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT
      v.id,
      r.bucket,
      r.total_pendiente,
      r.total_valor_pendiente
    FROM public.ventas v
    INNER JOIN public.logistica_pedido_resumen r ON r.pedido_id = v.id
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.profiles vend ON vend.id = v.vendedor_id
    LEFT JOIN public.profiles rep ON rep.id = r.vendedor_ruta_id
    WHERE v.empresa_id = p_empresa_id
      AND v.tipo = 'pedido'
      AND (
        p_vendedor_ids IS NULL
        OR cardinality(p_vendedor_ids) = 0
        OR v.vendedor_id = ANY(p_vendedor_ids)
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
        OR (
          (p_fecha_desde IS NULL OR r.fecha_programada >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR r.fecha_programada <= p_fecha_hasta)
        )
      )
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR COALESCE(v.folio, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR (v_num IS NOT NULL AND strpos(v.folio, v_num) > 0 AND public.fn_busqueda_relevancia(v.folio, p_search) = 0)
        OR COALESCE(c.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(vend.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(rep.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR EXISTS (
          SELECT 1
          FROM public.venta_lineas vl
          INNER JOIN public.productos pr ON pr.id = vl.producto_id
          WHERE vl.venta_id = v.id
            AND (
              COALESCE(pr.codigo, '') ILIKE '%' || BTRIM(p_search) || '%'
              OR COALESCE(pr.nombre, '') ILIKE '%' || BTRIM(p_search) || '%'
            )
        )
      )
  ),
  stats AS (
    SELECT
      COUNT(*) FILTER (WHERE bucket = 'pendientes')::bigint AS pendientes,
      COUNT(*) FILTER (WHERE bucket = 'generadas')::bigint AS generadas,
      COUNT(*) FILTER (WHERE bucket = 'surtidos')::bigint AS surtidos,
      COUNT(*) FILTER (WHERE bucket = 'en_ruta')::bigint AS en_ruta,
      COUNT(*) FILTER (WHERE bucket = 'entregados')::bigint AS entregados,
      COUNT(*) FILTER (WHERE bucket = 'cerrados')::bigint AS cerrados,
      COUNT(*)::bigint AS todos,
      COUNT(*) FILTER (
        WHERE COALESCE(p_tab, 'pendientes') = 'todos'
           OR bucket = COALESCE(p_tab, 'pendientes')
      )::bigint AS selected_count,
      COALESCE(SUM(total_pendiente) FILTER (
        WHERE COALESCE(p_tab, 'pendientes') = 'todos'
           OR bucket = COALESCE(p_tab, 'pendientes')
      ), 0)::numeric AS selected_total_pendiente,
      COALESCE(SUM(total_valor_pendiente) FILTER (
        WHERE COALESCE(p_tab, 'pendientes') = 'todos'
           OR bucket = COALESCE(p_tab, 'pendientes')
      ), 0)::numeric AS selected_total_valor_pendiente
    FROM filtered
  )
  SELECT jsonb_build_object(
    'counts', jsonb_build_object(
      'pendientes', pendientes,
      'generadas', generadas,
      'surtidos', surtidos,
      'en_ruta', en_ruta,
      'entregados', entregados,
      'cerrados', cerrados,
      'todos', todos
    ),
    'selected_count', selected_count,
    'selected_total_pendiente', selected_total_pendiente,
    'selected_total_valor_pendiente', selected_total_valor_pendiente,
    'db_ms', ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::numeric, 2)
  )
  INTO v_result
  FROM stats;

  RETURN COALESCE(v_result, jsonb_build_object(
    'counts', jsonb_build_object('pendientes',0,'generadas',0,'surtidos',0,'en_ruta',0,'entregados',0,'cerrados',0,'todos',0),
    'selected_count',0,'selected_total_pendiente',0,'selected_total_valor_pendiente',0,'db_ms',0
  ));
END;
$$;

-- 4) Buscador general (⌘K): solo el orden (el filtro sigue usando los índices de trigramas).
CREATE OR REPLACE FUNCTION public.buscar_global(p_q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_emp  uuid := public.get_my_empresa_id();
  v_term text;
  v_q    text := btrim(COALESCE(p_q, ''));
  v_cli  uuid[];
  v_prov uuid[];
BEGIN
  IF v_emp IS NULL OR length(btrim(COALESCE(p_q, ''))) < 2 THEN
    RETURN '{}'::jsonb;
  END IF;
  v_term := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  SELECT array_agg(id) INTO v_cli FROM (
    SELECT id FROM public.clientes WHERE empresa_id = v_emp AND (nombre ILIKE v_term OR codigo ILIKE v_term)
    ORDER BY LEAST(public.fn_busqueda_relevancia(codigo, v_q), public.fn_busqueda_relevancia(nombre, v_q, false)), nombre LIMIT 50) c;
  SELECT array_agg(id) INTO v_prov FROM (
    SELECT id FROM public.proveedores WHERE empresa_id = v_emp AND nombre ILIKE v_term
    ORDER BY public.fn_busqueda_relevancia(nombre, v_q, false), nombre LIMIT 50) p;

  RETURN jsonb_build_object(
    'ventas', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT v.id, v.folio, v.total, v.fecha, v.tipo,
               jsonb_build_object('nombre', cl.nombre) AS clientes,
               jsonb_build_object('nombre', pf.nombre) AS vendedores
          FROM public.ventas v
          LEFT JOIN public.clientes cl ON cl.id = v.cliente_id
          LEFT JOIN public.profiles pf ON pf.id = v.vendedor_id
         WHERE v.empresa_id = v_emp
           AND (v.folio ILIKE v_term OR v.cliente_id = ANY(COALESCE(v_cli, '{}')))
         ORDER BY LEAST(public.fn_busqueda_relevancia(v.folio, v_q), public.fn_busqueda_relevancia(cl.nombre, v_q, false)), v.created_at DESC
         LIMIT 10) x), '[]'::jsonb),
    'clientes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, codigo, telefono, rfc FROM public.clientes
         WHERE id = ANY(COALESCE(v_cli, '{}')) ORDER BY LEAST(public.fn_busqueda_relevancia(codigo, v_q), public.fn_busqueda_relevancia(nombre, v_q, false)), nombre LIMIT 5) x), '[]'::jsonb),
    'productos', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, codigo, clave_alterna, precio_principal FROM public.productos
         WHERE empresa_id = v_emp AND (nombre ILIKE v_term OR codigo ILIKE v_term)
         ORDER BY LEAST(public.fn_busqueda_relevancia(codigo, v_q), public.fn_busqueda_relevancia(clave_alterna, v_q), public.fn_busqueda_relevancia(nombre, v_q, false)), nombre LIMIT 5) x), '[]'::jsonb),
    'proveedores', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, rfc, telefono FROM public.proveedores
         WHERE id = ANY(COALESCE(v_prov, '{}')) ORDER BY public.fn_busqueda_relevancia(nombre, v_q, false), nombre LIMIT 5) x), '[]'::jsonb),
    'compras', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT c.id, c.folio, c.total, c.fecha, jsonb_build_object('nombre', pr.nombre) AS proveedores
          FROM public.compras c LEFT JOIN public.proveedores pr ON pr.id = c.proveedor_id
         WHERE c.empresa_id = v_emp AND (c.folio ILIKE v_term OR c.proveedor_id = ANY(COALESCE(v_prov, '{}')))
         ORDER BY LEAST(public.fn_busqueda_relevancia(c.folio, v_q), public.fn_busqueda_relevancia(pr.nombre, v_q, false)), c.fecha DESC LIMIT 5) x), '[]'::jsonb),
    'traspasos', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, folio, fecha, status FROM public.traspasos
         WHERE empresa_id = v_emp AND (folio ILIKE v_term) ORDER BY public.fn_busqueda_relevancia(folio, v_q), created_at DESC LIMIT 5) x), '[]'::jsonb),
    'gastos', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, concepto, monto, fecha FROM public.gastos
         WHERE empresa_id = v_emp AND cancelado_at IS NULL AND concepto ILIKE v_term
         ORDER BY public.fn_busqueda_relevancia(concepto, v_q, false), fecha DESC LIMIT 5) x), '[]'::jsonb),
    'cobros', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT co.id, co.metodo_pago, co.monto, co.fecha, co.referencia, jsonb_build_object('nombre', cl.nombre) AS clientes
          FROM public.cobros co LEFT JOIN public.clientes cl ON cl.id = co.cliente_id
         WHERE co.empresa_id = v_emp AND co.cliente_id = ANY(COALESCE(v_cli, '{}'))
         ORDER BY public.fn_busqueda_relevancia(cl.nombre, v_q, false), co.fecha DESC LIMIT 5) x), '[]'::jsonb),
    'cfdis', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, folio, folio_fiscal, total, fecha_timbrado, receiver_name FROM public.cfdis
         WHERE empresa_id = v_emp AND (folio ILIKE v_term OR receiver_name ILIKE v_term)
         ORDER BY LEAST(public.fn_busqueda_relevancia(folio, v_q), public.fn_busqueda_relevancia(receiver_name, v_q, false)), created_at DESC LIMIT 5) x), '[]'::jsonb),
    'almacenes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, tipo FROM public.almacenes
         WHERE empresa_id = v_emp AND nombre ILIKE v_term ORDER BY public.fn_busqueda_relevancia(nombre, v_q, false), nombre LIMIT 5) x), '[]'::jsonb),
    'tarifas', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, tipo FROM public.tarifas
         WHERE empresa_id = v_emp AND nombre ILIKE v_term ORDER BY public.fn_busqueda_relevancia(nombre, v_q, false), nombre LIMIT 5) x), '[]'::jsonb),
    'empleados', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, telefono FROM public.profiles
         WHERE empresa_id = v_emp AND nombre ILIKE v_term ORDER BY public.fn_busqueda_relevancia(nombre, v_q, false), nombre LIMIT 5) x), '[]'::jsonb),
    'entregas', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT e.id, e.folio, e.fecha, e.status, jsonb_build_object('nombre', cl.nombre) AS clientes
          FROM public.entregas e LEFT JOIN public.clientes cl ON cl.id = e.cliente_id
         WHERE e.empresa_id = v_emp AND (e.folio ILIKE v_term OR e.cliente_id = ANY(COALESCE(v_cli, '{}')))
         ORDER BY LEAST(public.fn_busqueda_relevancia(e.folio, v_q), public.fn_busqueda_relevancia(cl.nombre, v_q, false)), e.created_at DESC LIMIT 5) x), '[]'::jsonb),
    'ajustes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT a.id, a.fecha, a.motivo, jsonb_build_object('nombre', p.nombre, 'codigo', p.codigo) AS productos
          FROM public.ajustes_inventario a JOIN public.productos p ON p.id = a.producto_id
         WHERE a.empresa_id = v_emp AND (p.nombre ILIKE v_term OR p.codigo ILIKE v_term)
         ORDER BY LEAST(public.fn_busqueda_relevancia(p.codigo, v_q), public.fn_busqueda_relevancia(p.nombre, v_q, false)), a.fecha DESC LIMIT 5) x), '[]'::jsonb)
  );
END;
$function$;
