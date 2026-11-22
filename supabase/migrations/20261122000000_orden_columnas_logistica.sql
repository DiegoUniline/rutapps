-- Orden por columna («A a la Z») en las 3 listas de logística paginadas en la BD por RPC.
-- Solo agrega funciones NUEVAS; las anteriores quedan intactas para clientes viejos y para
-- no crear sobrecargas ambiguas en PostgREST:
--   fn_logistica_entregas_workspace_v2  → fn_logistica_entregas_workspace_v3
--   fn_logistica_pedidos_page_v4        → fn_logistica_pedidos_page_v5
--   fn_logistica_concentrado_pedidos_v3 → fn_logistica_concentrado_pedidos_v4
-- Cuerpo copiado del vigente (pg_get_functiondef en la BD de prueba, 2026-11-22) + dos
-- parámetros al final:
--   p_orden text DEFAULT NULL  clave de columna de una LISTA BLANCA fija; otra clave → error 22023.
--                              Nunca se concatena en SQL: cada clave se resuelve con CASE.
--   p_dir   text DEFAULT 'asc' 'asc' | 'desc'; otro valor → error 22023.
-- Con orden: valor de la columna (vacíos al final, NULLS LAST) y desempate por id.
-- Sin orden (p_orden NULL): EXACTAMENTE el orden de la versión anterior.
-- Mismo SECURITY DEFINER, search_path, validación de empresa y GRANTs (authenticated, service_role).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Entregas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_logistica_entregas_workspace_v3(
  p_empresa_id uuid,
  p_search text DEFAULT NULL::text,
  p_vendedor_id uuid DEFAULT NULL::uuid,
  p_status text DEFAULT 'todos'::text,
  p_ruta text DEFAULT 'todos'::text,
  p_fecha_tipo text DEFAULT 'programada'::text,
  p_fecha_desde date DEFAULT NULL::date,
  p_fecha_hasta date DEFAULT NULL::date,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_orden text DEFAULT NULL::text,
  p_dir text DEFAULT 'asc'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  -- Orden por columna (lista blanca).
  v_orden text := NULLIF(lower(BTRIM(p_orden)), '');
  v_dir text := lower(COALESCE(NULLIF(BTRIM(p_dir), ''), 'asc'));
  v_asc boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  IF v_orden IS NOT NULL AND NOT (v_orden = ANY (ARRAY[
    'folio', 'pedido', 'cliente', 'vendedor', 'origen', 'destino', 'ruta',
    'fecha_pedido', 'fecha', 'fecha_entrega', 'created_at', 'status'
  ])) THEN
    RAISE EXCEPTION 'orden no permitido: %', p_orden USING ERRCODE = '22023';
  END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'dirección de orden no permitida: %', p_dir USING ERRCODE = '22023';
  END IF;
  v_asc := v_dir = 'asc';

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
    SELECT s.id, s.created_at, s.relevancia, s.o_n, s.o_t, s.o_ts
    FROM (
      SELECT
        sf.id,
        sf.created_at,
        sf.relevancia,
        -- Valor de orden según la clave (solo se calcula la rama elegida).
        (CASE v_orden
          WHEN 'folio' THEN public.folio_orden(sf.folio)
          WHEN 'pedido' THEN public.folio_orden(sf.pedido_folio)
        END)::numeric AS o_n,
        NULLIF(CASE v_orden
          WHEN 'folio' THEN sf.folio
          WHEN 'pedido' THEN sf.pedido_folio
          WHEN 'cliente' THEN (SELECT c.nombre FROM public.clientes c WHERE c.id = sf.cliente_id)
          WHEN 'vendedor' THEN (SELECT pr.nombre FROM public.profiles pr WHERE pr.id = sf.vendedor_id)
          WHEN 'origen' THEN (SELECT a.nombre FROM public.almacenes a WHERE a.id = sf.almacen_id)
          WHEN 'destino' THEN COALESCE(
            (SELECT a.nombre FROM public.profiles pr INNER JOIN public.almacenes a ON a.id = pr.almacen_id WHERE pr.id = sf.vendedor_ruta_id),
            (SELECT a.nombre FROM public.profiles pr INNER JOIN public.almacenes a ON a.id = pr.almacen_id WHERE pr.id = sf.vendedor_id)
          )
          WHEN 'ruta' THEN (SELECT pr.nombre FROM public.profiles pr WHERE pr.id = sf.vendedor_ruta_id)
          WHEN 'status' THEN sf.status
        END, '') AS o_t,
        CASE v_orden
          WHEN 'fecha' THEN sf.fecha::timestamptz
          WHEN 'fecha_entrega' THEN sf.fecha_entrega
          WHEN 'fecha_pedido' THEN sf.pedido_fecha::timestamptz
          WHEN 'created_at' THEN sf.created_at
        END AS o_ts
      FROM status_filtered sf
    ) s
    ORDER BY
      CASE WHEN v_asc THEN s.o_n END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN s.o_n END DESC NULLS LAST,
      CASE WHEN v_asc THEN s.o_t END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN s.o_t END DESC NULLS LAST,
      CASE WHEN v_asc THEN s.o_ts END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN s.o_ts END DESC NULLS LAST,
      -- Sin orden elegido: el de la v2 (relevancia, created_at DESC, id DESC).
      CASE WHEN v_orden IS NULL THEN s.relevancia END,
      CASE WHEN v_orden IS NULL THEN s.created_at END DESC,
      s.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ),
  details AS MATERIALIZED (
    SELECT
      b.*,
      p.o_n,
      p.o_t,
      p.o_ts,
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
        ORDER BY
          CASE WHEN v_asc THEN d.o_n END ASC NULLS LAST,
          CASE WHEN NOT v_asc THEN d.o_n END DESC NULLS LAST,
          CASE WHEN v_asc THEN d.o_t END ASC NULLS LAST,
          CASE WHEN NOT v_asc THEN d.o_t END DESC NULLS LAST,
          CASE WHEN v_asc THEN d.o_ts END ASC NULLS LAST,
          CASE WHEN NOT v_asc THEN d.o_ts END DESC NULLS LAST,
          CASE WHEN v_orden IS NULL THEN d.relevancia END,
          CASE WHEN v_orden IS NULL THEN d.created_at END DESC,
          d.id DESC
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
$function$;

REVOKE ALL ON FUNCTION public.fn_logistica_entregas_workspace_v3(uuid, text, uuid, text, text, text, date, date, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_logistica_entregas_workspace_v3(uuid, text, uuid, text, text, text, date, date, integer, integer, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_logistica_entregas_workspace_v3(uuid, text, uuid, text, text, text, date, date, integer, integer, text, text) IS
  'Lista de entregas paginada (v2 + orden por columna). p_orden: folio, pedido, cliente, vendedor, origen, destino, ruta, fecha_pedido, fecha, fecha_entrega, created_at, status. p_dir: asc|desc. Sin p_orden = orden de la v2.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Demanda (pedidos de logística)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_page_v5(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL::date,
  p_fecha_hasta date DEFAULT NULL::date,
  p_fecha_tipo text DEFAULT 'levantamiento'::text,
  p_vendedor_ids uuid[] DEFAULT NULL::uuid[],
  p_search text DEFAULT NULL::text,
  p_tab text DEFAULT 'pendientes'::text,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_orden text DEFAULT NULL::text,
  p_dir text DEFAULT 'asc'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  -- Orden por columna (lista blanca).
  v_orden text := NULLIF(lower(BTRIM(p_orden)), '');
  v_dir text := lower(COALESCE(NULLIF(BTRIM(p_dir), ''), 'asc'));
  v_asc boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  IF v_orden IS NOT NULL AND NOT (v_orden = ANY (ARRAY[
    'folio', 'cliente', 'vendedor', 'fecha', 'repartidor', 'fecha_programada', 'fecha_entrega',
    'total', 'surtido', 'entregado', 'pendiente', 'estado'
  ])) THEN
    RAISE EXCEPTION 'orden no permitido: %', p_orden USING ERRCODE = '22023';
  END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'dirección de orden no permitida: %', p_dir USING ERRCODE = '22023';
  END IF;
  v_asc := v_dir = 'asc';

  WITH page_rows AS MATERIALIZED (
    SELECT q.*
    FROM (
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
        ) END AS relevancia,
        -- Valor de orden según la clave (solo se calcula la rama elegida).
        (CASE v_orden
          WHEN 'folio' THEN public.folio_orden(v.folio)::numeric
          WHEN 'total' THEN COALESCE(v.total, 0)::numeric
          WHEN 'surtido' THEN CASE WHEN r.total_demanda > 0 THEN ROUND((r.total_surtido / r.total_demanda) * 100) ELSE 0 END
          WHEN 'entregado' THEN CASE WHEN r.total_demanda > 0 THEN ROUND((r.total_entregado / r.total_demanda) * 100) ELSE 0 END
          WHEN 'pendiente' THEN r.total_pendiente
        END)::numeric AS o_n,
        NULLIF(CASE v_orden
          WHEN 'folio' THEN v.folio
          WHEN 'cliente' THEN c.nombre
          WHEN 'vendedor' THEN vend.nombre
          WHEN 'repartidor' THEN rep.nombre
          -- Misma etiqueta que muestra la columna «Estado» de Demanda.
          WHEN 'estado' THEN CASE
            WHEN v.status::text = 'cancelado' THEN 'Cancelado'
            WHEN v.status::text = 'facturado' THEN 'Facturado'
            WHEN r.estado_odoo = 'entregado' THEN 'Entregado'
            WHEN r.estado_odoo = 'en_ruta' THEN 'En ruta'
            WHEN r.estado_odoo = 'surtido_completo' THEN 'Surtido completo'
            WHEN r.estado_odoo = 'surtido_parcial' THEN 'Surtido parcial'
            WHEN r.estado_odoo = 'pendiente_surtir' THEN 'Pendiente de surtir'
            WHEN r.estado_odoo = 'en_surtido' THEN 'En surtido'
            WHEN v.status::text = 'borrador' THEN 'Borrador'
            ELSE 'Confirmado'
          END
        END, '') AS o_t,
        CASE v_orden
          WHEN 'fecha' THEN v.fecha::timestamptz
          WHEN 'fecha_programada' THEN r.fecha_programada::timestamptz
          WHEN 'fecha_entrega' THEN r.fecha_entrega_real::timestamptz
        END AS o_ts
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
    ) q
    ORDER BY
      CASE WHEN v_asc THEN q.o_n END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN q.o_n END DESC NULLS LAST,
      CASE WHEN v_asc THEN q.o_t END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN q.o_t END DESC NULLS LAST,
      CASE WHEN v_asc THEN q.o_ts END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN q.o_ts END DESC NULLS LAST,
      -- Sin orden elegido: el de la v4 (relevancia, sort_date DESC NULLS LAST, created_at DESC, id DESC).
      CASE WHEN v_orden IS NULL THEN q.relevancia END,
      CASE WHEN v_orden IS NULL THEN q.sort_date END DESC NULLS LAST,
      CASE WHEN v_orden IS NULL THEN q.created_at END DESC,
      q.id DESC
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
      ) ORDER BY
        CASE WHEN v_asc THEN p.o_n END ASC NULLS LAST,
        CASE WHEN NOT v_asc THEN p.o_n END DESC NULLS LAST,
        CASE WHEN v_asc THEN p.o_t END ASC NULLS LAST,
        CASE WHEN NOT v_asc THEN p.o_t END DESC NULLS LAST,
        CASE WHEN v_asc THEN p.o_ts END ASC NULLS LAST,
        CASE WHEN NOT v_asc THEN p.o_ts END DESC NULLS LAST,
        CASE WHEN v_orden IS NULL THEN p.relevancia END,
        CASE WHEN v_orden IS NULL THEN p.sort_date END DESC NULLS LAST,
        CASE WHEN v_orden IS NULL THEN p.created_at END DESC,
        p.id DESC
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
$function$;

REVOKE ALL ON FUNCTION public.fn_logistica_pedidos_page_v5(uuid, date, date, text, uuid[], text, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_logistica_pedidos_page_v5(uuid, date, date, text, uuid[], text, text, integer, integer, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_logistica_pedidos_page_v5(uuid, date, date, text, uuid[], text, text, integer, integer, text, text) IS
  'Página de Demanda (v4 + orden por columna). p_orden: folio, cliente, vendedor, fecha, repartidor, fecha_programada, fecha_entrega, total, surtido, entregado, pendiente, estado. p_dir: asc|desc. Sin p_orden = orden de la v4.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Concentrado de surtido, vista «Pedidos»
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_logistica_concentrado_pedidos_v4(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL::date,
  p_fecha_hasta date DEFAULT NULL::date,
  p_fecha_field text DEFAULT 'fecha'::text,
  p_statuses text[] DEFAULT NULL::text[],
  p_tipo text DEFAULT 'pedido'::text,
  p_vendedor_ids uuid[] DEFAULT NULL::uuid[],
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_orden text DEFAULT NULL::text,
  p_dir text DEFAULT 'asc'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500) END;
  v_offset integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN 0 ELSE GREATEST(COALESCE(p_offset, 0), 0) END;
  v_result jsonb;
  -- Orden por columna (lista blanca).
  v_orden text := NULLIF(lower(BTRIM(p_orden)), '');
  v_dir text := lower(COALESCE(NULLIF(BTRIM(p_dir), ''), 'asc'));
  v_asc boolean;
  -- true solo si se ordena por una columna calculada (requerido/surtido/pendiente/estado de surtido):
  -- entonces se calcula para todos los pedidos filtrados; si no, solo para la página (como la v3).
  v_agg boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  IF v_orden IS NOT NULL AND NOT (v_orden = ANY (ARRAY[
    'fecha_entrega', 'folio', 'cliente', 'vendedor', 'tipo', 'status',
    'requerido', 'entregado', 'pendiente', 'surtido_status'
  ])) THEN
    RAISE EXCEPTION 'orden no permitido: %', p_orden USING ERRCODE = '22023';
  END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'dirección de orden no permitida: %', p_dir USING ERRCODE = '22023';
  END IF;
  v_asc := v_dir = 'asc';
  v_agg := COALESCE(v_orden IN ('requerido', 'entregado', 'pendiente', 'surtido_status'), false);

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
    SELECT s.*
    FROM (
      SELECT
        k.*,
        (CASE v_orden
          WHEN 'folio' THEN public.folio_orden(k.folio)::numeric
          WHEN 'requerido' THEN k.a_req
          WHEN 'entregado' THEN k.a_surt
          WHEN 'pendiente' THEN k.a_pend
        END)::numeric AS o_n,
        NULLIF(CASE v_orden
          WHEN 'folio' THEN k.folio
          WHEN 'cliente' THEN k.cliente_nombre
          WHEN 'vendedor' THEN k.vendedor_nombre
          -- Misma etiqueta que muestra la columna «Tipo».
          WHEN 'tipo' THEN CASE WHEN k.tipo = 'venta_directa' THEN 'Venta directa' ELSE COALESCE(k.tipo, 'pedido') END
          WHEN 'status' THEN k.status
          -- Misma etiqueta que muestra la columna «Estado surtido».
          WHEN 'surtido_status' THEN CASE
            WHEN k.a_req = 0 THEN 'Sin líneas'
            WHEN k.a_surt <= 0 THEN 'Sin surtir'
            WHEN k.a_pend <= 0 THEN 'Surtido completo'
            ELSE 'Surtido parcial'
          END
        END, '') AS o_t,
        CASE v_orden
          WHEN 'fecha_entrega' THEN k.fecha_entrega::timestamptz
        END AS o_ts
      FROM (
        SELECT fv.*, ag.a_req, ag.a_surt, ag.a_pend
        FROM filtered_ventas fv
        LEFT JOIN LATERAL (
          -- Mismo cálculo que pedido_agg, por pedido; solo corre si v_agg.
          SELECT
            COALESCE(SUM(vp.requerido), 0)::numeric AS a_req,
            COALESCE(SUM(COALESCE(ep.surtido, 0)), 0)::numeric AS a_surt,
            COALESCE(SUM(GREATEST(0::numeric, vp.requerido - COALESCE(ep.surtido, 0))), 0)::numeric AS a_pend
          FROM (
            SELECT vl.producto_id, SUM(COALESCE(vl.cantidad, 0))::numeric AS requerido
            FROM public.venta_lineas vl
            WHERE v_agg AND vl.venta_id = fv.id
            GROUP BY vl.producto_id
          ) vp
          LEFT JOIN (
            SELECT el.producto_id, SUM(COALESCE(el.cantidad_entregada, 0))::numeric AS surtido
            FROM public.entregas e
            INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
            WHERE v_agg AND e.pedido_id = fv.id
              AND e.status::text IN ('surtido', 'cargado', 'hecho')
            GROUP BY el.producto_id
          ) ep ON ep.producto_id IS NOT DISTINCT FROM vp.producto_id
          WHERE v_agg
        ) ag ON v_agg
      ) k
    ) s
    ORDER BY
      CASE WHEN v_asc THEN s.o_n END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN s.o_n END DESC NULLS LAST,
      CASE WHEN v_asc THEN s.o_t END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN s.o_t END DESC NULLS LAST,
      CASE WHEN v_asc THEN s.o_ts END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN s.o_ts END DESC NULLS LAST,
      -- Sin orden elegido: el de la v3 (fecha_entrega, folio numérico, folio, id).
      CASE WHEN v_orden IS NULL THEN s.fecha_entrega END ASC NULLS LAST,
      CASE WHEN v_orden IS NULL THEN public.folio_orden(s.folio) END ASC NULLS LAST,
      CASE WHEN v_orden IS NULL THEN s.folio END ASC NULLS LAST,
      s.id
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
    ) ORDER BY
      CASE WHEN v_asc THEN pv.o_n END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN pv.o_n END DESC NULLS LAST,
      CASE WHEN v_asc THEN pv.o_t END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN pv.o_t END DESC NULLS LAST,
      CASE WHEN v_asc THEN pv.o_ts END ASC NULLS LAST,
      CASE WHEN NOT v_asc THEN pv.o_ts END DESC NULLS LAST,
      CASE WHEN v_orden IS NULL THEN pv.fecha_entrega END ASC NULLS LAST,
      CASE WHEN v_orden IS NULL THEN public.folio_orden(pv.folio) END ASC NULLS LAST,
      CASE WHEN v_orden IS NULL THEN pv.folio END ASC NULLS LAST,
      pv.id), '[]'::jsonb) AS rows
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
$function$;

REVOKE ALL ON FUNCTION public.fn_logistica_concentrado_pedidos_v4(uuid, date, date, text, text[], text, uuid[], integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_logistica_concentrado_pedidos_v4(uuid, date, date, text, text[], text, uuid[], integer, integer, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_logistica_concentrado_pedidos_v4(uuid, date, date, text, text[], text, uuid[], integer, integer, text, text) IS
  'Concentrado de surtido, vista Pedidos (v3 + orden por columna). p_orden: fecha_entrega, folio, cliente, vendedor, tipo, status, requerido, entregado, pendiente, surtido_status. p_dir: asc|desc. Sin p_orden = orden de la v3.';
