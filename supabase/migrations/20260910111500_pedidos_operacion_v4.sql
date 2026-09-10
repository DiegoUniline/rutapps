-- Pedidos > Operación V4
-- Arquitectura: resumen persistente por pedido + RPC de página + RPC de contadores + detalle lazy.
-- Evita recalcular venta_lineas/entrega_lineas históricas en cada apertura de la pantalla.

CREATE TABLE IF NOT EXISTS public.logistica_pedido_resumen (
  pedido_id uuid PRIMARY KEY REFERENCES public.ventas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  total_demanda numeric NOT NULL DEFAULT 0,
  total_generada numeric NOT NULL DEFAULT 0,
  total_surtido numeric NOT NULL DEFAULT 0,
  total_entregado numeric NOT NULL DEFAULT 0,
  total_pendiente numeric NOT NULL DEFAULT 0,
  total_valor_pendiente numeric NOT NULL DEFAULT 0,
  lineas_pendientes bigint NOT NULL DEFAULT 0,
  fully_generada boolean NOT NULL DEFAULT false,
  fully_surtido boolean NOT NULL DEFAULT false,
  fully_delivered boolean NOT NULL DEFAULT false,
  en_ruta boolean NOT NULL DEFAULT false,
  estado_odoo text,
  bucket text,
  fecha_programada date,
  fecha_entrega_real date,
  vendedor_ruta_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logistica_pedido_resumen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.logistica_pedido_resumen FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_bucket
  ON public.logistica_pedido_resumen (empresa_id, bucket, pedido_id);

CREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_programada
  ON public.logistica_pedido_resumen (empresa_id, fecha_programada DESC, pedido_id);

CREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_bucket_programada
  ON public.logistica_pedido_resumen (empresa_id, bucket, fecha_programada DESC, pedido_id);

CREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_repartidor
  ON public.logistica_pedido_resumen (empresa_id, vendedor_ruta_id, pedido_id)
  WHERE vendedor_ruta_id IS NOT NULL;

COMMENT ON TABLE public.logistica_pedido_resumen IS
'Cache operacional 1:1 por pedido. Se actualiza por triggers y permite listar/contar pedidos sin recorrer partidas históricas.';


CREATE OR REPLACE FUNCTION public.fn_refresh_logistica_pedido_resumen(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.ventas v
    WHERE v.id = p_pedido_id
      AND v.tipo = 'pedido'
  ) THEN
    DELETE FROM public.logistica_pedido_resumen WHERE pedido_id = p_pedido_id;
    RETURN;
  END IF;

  WITH venta_base AS MATERIALIZED (
    SELECT
      v.id,
      v.empresa_id,
      v.status::text AS status,
      v.cerrado_at,
      v.fecha_entrega AS fecha_entrega_original
    FROM public.ventas v
    WHERE v.id = p_pedido_id
      AND v.tipo = 'pedido'
  ),
  venta_producto AS MATERIALIZED (
    SELECT
      vl.producto_id,
      SUM(COALESCE(vl.cantidad, 0))::numeric AS cantidad,
      SUM(COALESCE(vl.cantidad, 0) * COALESCE(vl.precio_unitario, 0))::numeric AS valor
    FROM public.venta_lineas vl
    WHERE vl.venta_id = p_pedido_id
    GROUP BY vl.producto_id
  ),
  entrega_producto AS MATERIALIZED (
    SELECT
      el.producto_id,
      SUM(CASE WHEN e.status::text = 'borrador' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS generada,
      SUM(CASE WHEN e.status::text IN ('surtido','asignado','cargado','en_ruta','hecho') THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS surtida,
      SUM(CASE WHEN e.status::text = 'hecho' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS entregada
    FROM public.entregas e
    INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.pedido_id = p_pedido_id
      AND e.status::text <> 'cancelado'
    GROUP BY el.producto_id
  ),
  line_calc AS MATERIALIZED (
    SELECT
      vp.producto_id,
      vp.cantidad,
      vp.valor,
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
      ON ep.producto_id IS NOT DISTINCT FROM vp.producto_id
  ),
  metrics AS (
    SELECT
      COALESCE(SUM(cantidad), 0)::numeric AS total_demanda,
      COALESCE(SUM(generada), 0)::numeric AS total_generada,
      COALESCE(SUM(surtida), 0)::numeric AS total_surtido,
      COALESCE(SUM(entregada), 0)::numeric AS total_entregado,
      COALESCE(SUM(pendiente), 0)::numeric AS total_pendiente,
      COALESCE(SUM(valor_pendiente), 0)::numeric AS total_valor_pendiente,
      COUNT(*) FILTER (WHERE pendiente > 0)::bigint AS lineas_pendientes
    FROM line_calc
  ),
  entrega_meta AS (
    SELECT
      MAX(e.fecha) FILTER (WHERE e.status::text <> 'cancelado') AS fecha_programada_actual,
      MAX(e.fecha_entrega) FILTER (WHERE e.status::text = 'hecho') AS fecha_entrega_real,
      COALESCE(BOOL_OR(e.status::text IN ('asignado','cargado','en_ruta')), false) AS tiene_en_ruta,
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
    WHERE e.pedido_id = p_pedido_id
  ),
  derived_1 AS (
    SELECT
      vb.*,
      m.*,
      COALESCE(em.fecha_programada_actual, vb.fecha_entrega_original) AS fecha_programada,
      em.fecha_entrega_real,
      em.tiene_en_ruta,
      em.vendedor_ruta_id,
      (m.total_demanda > 0 AND m.total_entregado >= m.total_demanda) AS fully_delivered,
      (m.total_demanda > 0 AND m.total_surtido >= m.total_demanda) AS fully_surtido
    FROM venta_base vb
    CROSS JOIN metrics m
    CROSS JOIN entrega_meta em
  ),
  derived_2 AS (
    SELECT
      d1.*,
      (
        NOT d1.fully_surtido
        AND d1.total_demanda > 0
        AND (d1.total_generada + d1.total_surtido) >= d1.total_demanda
      ) AS fully_generada,
      (NOT d1.fully_delivered AND d1.tiene_en_ruta) AS en_ruta
    FROM derived_1 d1
  ),
  final AS (
    SELECT
      d2.*,
      CASE
        WHEN d2.fully_delivered THEN 'entregado'
        WHEN d2.en_ruta THEN 'en_ruta'
        WHEN d2.fully_surtido THEN 'surtido_completo'
        WHEN d2.total_surtido > 0 THEN 'surtido_parcial'
        WHEN d2.total_generada > 0 AND d2.fully_generada THEN 'pendiente_surtir'
        WHEN d2.total_generada > 0 THEN 'en_surtido'
        ELSE NULL
      END AS estado_odoo,
      CASE
        WHEN d2.cerrado_at IS NOT NULL THEN 'cerrados'
        WHEN d2.status IN ('cancelado','facturado') THEN NULL
        WHEN d2.fully_delivered THEN 'entregados'
        WHEN d2.en_ruta THEN 'en_ruta'
        WHEN d2.fully_surtido THEN 'surtidos'
        WHEN d2.fully_generada THEN 'generadas'
        ELSE 'pendientes'
      END AS bucket
    FROM derived_2 d2
  )
  INSERT INTO public.logistica_pedido_resumen (
    pedido_id,
    empresa_id,
    total_demanda,
    total_generada,
    total_surtido,
    total_entregado,
    total_pendiente,
    total_valor_pendiente,
    lineas_pendientes,
    fully_generada,
    fully_surtido,
    fully_delivered,
    en_ruta,
    estado_odoo,
    bucket,
    fecha_programada,
    fecha_entrega_real,
    vendedor_ruta_id,
    updated_at
  )
  SELECT
    id,
    empresa_id,
    total_demanda,
    total_generada,
    total_surtido,
    total_entregado,
    total_pendiente,
    total_valor_pendiente,
    lineas_pendientes,
    fully_generada,
    fully_surtido,
    fully_delivered,
    en_ruta,
    estado_odoo,
    bucket,
    fecha_programada,
    fecha_entrega_real,
    vendedor_ruta_id,
    now()
  FROM final
  ON CONFLICT (pedido_id) DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    total_demanda = EXCLUDED.total_demanda,
    total_generada = EXCLUDED.total_generada,
    total_surtido = EXCLUDED.total_surtido,
    total_entregado = EXCLUDED.total_entregado,
    total_pendiente = EXCLUDED.total_pendiente,
    total_valor_pendiente = EXCLUDED.total_valor_pendiente,
    lineas_pendientes = EXCLUDED.lineas_pendientes,
    fully_generada = EXCLUDED.fully_generada,
    fully_surtido = EXCLUDED.fully_surtido,
    fully_delivered = EXCLUDED.fully_delivered,
    en_ruta = EXCLUDED.en_ruta,
    estado_odoo = EXCLUDED.estado_odoo,
    bucket = EXCLUDED.bucket,
    fecha_programada = EXCLUDED.fecha_programada,
    fecha_entrega_real = EXCLUDED.fecha_entrega_real,
    vendedor_ruta_id = EXCLUDED.vendedor_ruta_id,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_refresh_logistica_pedido_resumen(uuid) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.trg_refresh_logistica_pedido_from_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.fn_refresh_logistica_pedido_resumen(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_venta ON public.ventas;
CREATE TRIGGER trg_logistica_pedido_resumen_venta
AFTER INSERT OR UPDATE OF status, cerrado_at, tipo, empresa_id, fecha_entrega
ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_logistica_pedido_from_venta();


CREATE OR REPLACE FUNCTION public.trg_refresh_logistica_pedido_from_venta_linea()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_refresh_logistica_pedido_resumen(OLD.venta_id);
    RETURN OLD;
  END IF;

  PERFORM public.fn_refresh_logistica_pedido_resumen(NEW.venta_id);
  IF TG_OP = 'UPDATE' AND OLD.venta_id IS DISTINCT FROM NEW.venta_id THEN
    PERFORM public.fn_refresh_logistica_pedido_resumen(OLD.venta_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_venta_linea ON public.venta_lineas;
CREATE TRIGGER trg_logistica_pedido_resumen_venta_linea
AFTER INSERT OR UPDATE OR DELETE
ON public.venta_lineas
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_logistica_pedido_from_venta_linea();


CREATE OR REPLACE FUNCTION public.trg_refresh_logistica_pedido_from_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.pedido_id IS NOT NULL THEN
      PERFORM public.fn_refresh_logistica_pedido_resumen(OLD.pedido_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.pedido_id IS NOT NULL THEN
    PERFORM public.fn_refresh_logistica_pedido_resumen(NEW.pedido_id);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.pedido_id IS NOT NULL
     AND OLD.pedido_id IS DISTINCT FROM NEW.pedido_id THEN
    PERFORM public.fn_refresh_logistica_pedido_resumen(OLD.pedido_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_entrega ON public.entregas;
CREATE TRIGGER trg_logistica_pedido_resumen_entrega
AFTER INSERT OR UPDATE OR DELETE
ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_logistica_pedido_from_entrega();


CREATE OR REPLACE FUNCTION public.trg_refresh_logistica_pedido_from_entrega_linea()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_pedido_new uuid;
  v_pedido_old uuid;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT e.pedido_id INTO v_pedido_new
    FROM public.entregas e
    WHERE e.id = NEW.entrega_id;

    IF v_pedido_new IS NOT NULL THEN
      PERFORM public.fn_refresh_logistica_pedido_resumen(v_pedido_new);
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT e.pedido_id INTO v_pedido_old
    FROM public.entregas e
    WHERE e.id = OLD.entrega_id;

    IF v_pedido_old IS NOT NULL
       AND v_pedido_old IS DISTINCT FROM v_pedido_new THEN
      PERFORM public.fn_refresh_logistica_pedido_resumen(v_pedido_old);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_entrega_linea ON public.entrega_lineas;
CREATE TRIGGER trg_logistica_pedido_resumen_entrega_linea
AFTER INSERT OR UPDATE OR DELETE
ON public.entrega_lineas
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_logistica_pedido_from_entrega_linea();


-- Backfill set-based. Se ejecuta una sola vez durante la migración y evita miles de llamadas por pedido.
WITH pedidos AS MATERIALIZED (
  SELECT
    v.id,
    v.empresa_id,
    v.status::text AS status,
    v.cerrado_at,
    v.fecha_entrega AS fecha_entrega_original
  FROM public.ventas v
  WHERE v.tipo = 'pedido'
),
venta_producto AS MATERIALIZED (
  SELECT
    vl.venta_id AS pedido_id,
    vl.producto_id,
    SUM(COALESCE(vl.cantidad, 0))::numeric AS cantidad,
    SUM(COALESCE(vl.cantidad, 0) * COALESCE(vl.precio_unitario, 0))::numeric AS valor
  FROM public.venta_lineas vl
  INNER JOIN pedidos p ON p.id = vl.venta_id
  GROUP BY vl.venta_id, vl.producto_id
),
entrega_producto AS MATERIALIZED (
  SELECT
    e.pedido_id,
    el.producto_id,
    SUM(CASE WHEN e.status::text = 'borrador' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS generada,
    SUM(CASE WHEN e.status::text IN ('surtido','asignado','cargado','en_ruta','hecho') THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS surtida,
    SUM(CASE WHEN e.status::text = 'hecho' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS entregada
  FROM public.entregas e
  INNER JOIN pedidos p ON p.id = e.pedido_id
  INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
  WHERE e.status::text <> 'cancelado'
  GROUP BY e.pedido_id, el.producto_id
),
line_calc AS MATERIALIZED (
  SELECT
    vp.pedido_id,
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
    ON ep.pedido_id = vp.pedido_id
   AND ep.producto_id IS NOT DISTINCT FROM vp.producto_id
),
metrics AS MATERIALIZED (
  SELECT
    p.id AS pedido_id,
    COALESCE(SUM(lc.cantidad), 0)::numeric AS total_demanda,
    COALESCE(SUM(lc.generada), 0)::numeric AS total_generada,
    COALESCE(SUM(lc.surtida), 0)::numeric AS total_surtido,
    COALESCE(SUM(lc.entregada), 0)::numeric AS total_entregado,
    COALESCE(SUM(lc.pendiente), 0)::numeric AS total_pendiente,
    COALESCE(SUM(lc.valor_pendiente), 0)::numeric AS total_valor_pendiente,
    COUNT(*) FILTER (WHERE lc.pendiente > 0)::bigint AS lineas_pendientes
  FROM pedidos p
  LEFT JOIN line_calc lc ON lc.pedido_id = p.id
  GROUP BY p.id
),
entrega_meta AS MATERIALIZED (
  SELECT
    p.id AS pedido_id,
    MAX(e.fecha) FILTER (WHERE e.status::text <> 'cancelado') AS fecha_programada_actual,
    MAX(e.fecha_entrega) FILTER (WHERE e.status::text = 'hecho') AS fecha_entrega_real,
    COALESCE(BOOL_OR(e.status::text IN ('asignado','cargado','en_ruta')), false) AS tiene_en_ruta,
    (
      ARRAY_AGG(
        e.vendedor_ruta_id
        ORDER BY e.fecha DESC NULLS LAST, e.created_at DESC
      ) FILTER (
        WHERE e.status::text <> 'cancelado'
          AND e.vendedor_ruta_id IS NOT NULL
      )
    )[1] AS vendedor_ruta_id
  FROM pedidos p
  LEFT JOIN public.entregas e ON e.pedido_id = p.id
  GROUP BY p.id
),
derived_1 AS MATERIALIZED (
  SELECT
    p.*,
    m.*,
    COALESCE(em.fecha_programada_actual, p.fecha_entrega_original) AS fecha_programada,
    em.fecha_entrega_real,
    em.tiene_en_ruta,
    em.vendedor_ruta_id,
    (m.total_demanda > 0 AND m.total_entregado >= m.total_demanda) AS fully_delivered,
    (m.total_demanda > 0 AND m.total_surtido >= m.total_demanda) AS fully_surtido
  FROM pedidos p
  INNER JOIN metrics m ON m.pedido_id = p.id
  INNER JOIN entrega_meta em ON em.pedido_id = p.id
),
derived_2 AS MATERIALIZED (
  SELECT
    d1.*,
    (
      NOT d1.fully_surtido
      AND d1.total_demanda > 0
      AND (d1.total_generada + d1.total_surtido) >= d1.total_demanda
    ) AS fully_generada,
    (NOT d1.fully_delivered AND d1.tiene_en_ruta) AS en_ruta
  FROM derived_1 d1
),
final AS (
  SELECT
    d2.*,
    CASE
      WHEN d2.fully_delivered THEN 'entregado'
      WHEN d2.en_ruta THEN 'en_ruta'
      WHEN d2.fully_surtido THEN 'surtido_completo'
      WHEN d2.total_surtido > 0 THEN 'surtido_parcial'
      WHEN d2.total_generada > 0 AND d2.fully_generada THEN 'pendiente_surtir'
      WHEN d2.total_generada > 0 THEN 'en_surtido'
      ELSE NULL
    END AS estado_odoo,
    CASE
      WHEN d2.cerrado_at IS NOT NULL THEN 'cerrados'
      WHEN d2.status IN ('cancelado','facturado') THEN NULL
      WHEN d2.fully_delivered THEN 'entregados'
      WHEN d2.en_ruta THEN 'en_ruta'
      WHEN d2.fully_surtido THEN 'surtidos'
      WHEN d2.fully_generada THEN 'generadas'
      ELSE 'pendientes'
    END AS bucket
  FROM derived_2 d2
)
INSERT INTO public.logistica_pedido_resumen (
  pedido_id, empresa_id,
  total_demanda, total_generada, total_surtido, total_entregado,
  total_pendiente, total_valor_pendiente, lineas_pendientes,
  fully_generada, fully_surtido, fully_delivered, en_ruta,
  estado_odoo, bucket, fecha_programada, fecha_entrega_real, vendedor_ruta_id, updated_at
)
SELECT
  id, empresa_id,
  total_demanda, total_generada, total_surtido, total_entregado,
  total_pendiente, total_valor_pendiente, lineas_pendientes,
  fully_generada, fully_surtido, fully_delivered, en_ruta,
  estado_odoo, bucket, fecha_programada, fecha_entrega_real, vendedor_ruta_id, now()
FROM final
ON CONFLICT (pedido_id) DO UPDATE SET
  empresa_id = EXCLUDED.empresa_id,
  total_demanda = EXCLUDED.total_demanda,
  total_generada = EXCLUDED.total_generada,
  total_surtido = EXCLUDED.total_surtido,
  total_entregado = EXCLUDED.total_entregado,
  total_pendiente = EXCLUDED.total_pendiente,
  total_valor_pendiente = EXCLUDED.total_valor_pendiente,
  lineas_pendientes = EXCLUDED.lineas_pendientes,
  fully_generada = EXCLUDED.fully_generada,
  fully_surtido = EXCLUDED.fully_surtido,
  fully_delivered = EXCLUDED.fully_delivered,
  en_ruta = EXCLUDED.en_ruta,
  estado_odoo = EXCLUDED.estado_odoo,
  bucket = EXCLUDED.bucket,
  fecha_programada = EXCLUDED.fecha_programada,
  fecha_entrega_real = EXCLUDED.fecha_entrega_real,
  vendedor_ruta_id = EXCLUDED.vendedor_ruta_id,
  updated_at = now();


CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_counts_v4(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_fecha_tipo text DEFAULT 'levantamiento',
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_tab text DEFAULT 'pendientes'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
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

REVOKE ALL ON FUNCTION public.fn_logistica_pedidos_counts_v4(uuid,date,date,text,uuid[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_pedidos_counts_v4(uuid,date,date,text,uuid[],text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_page_v4(
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
  v_started_at timestamptz := clock_timestamp();
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
      v.created_at
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
    ORDER BY sort_date DESC NULLS LAST, v.created_at DESC, v.id DESC
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
      ) ORDER BY p.sort_date DESC NULLS LAST, p.created_at DESC, p.id DESC
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

REVOKE ALL ON FUNCTION public.fn_logistica_pedidos_page_v4(uuid,date,date,text,uuid[],text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_pedidos_page_v4(uuid,date,date,text,uuid[],text,text,integer,integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_logistica_pedido_detalle_v4(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_empresa_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT v.empresa_id
  INTO v_empresa_id
  FROM public.ventas v
  WHERE v.id = p_pedido_id
    AND v.tipo = 'pedido';

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'pedido not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND v_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH entrega_producto AS MATERIALIZED (
    SELECT
      el.producto_id,
      SUM(CASE WHEN e.status::text = 'borrador' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS generada,
      SUM(CASE WHEN e.status::text IN ('surtido','asignado','cargado','en_ruta','hecho') THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS surtida,
      SUM(CASE WHEN e.status::text = 'hecho' THEN COALESCE(el.cantidad_entregada, 0) ELSE 0 END)::numeric AS entregada
    FROM public.entregas e
    INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.pedido_id = p_pedido_id
      AND e.status::text <> 'cancelado'
    GROUP BY el.producto_id
  ),
  lineas AS MATERIALIZED (
    SELECT
      vl.id,
      vl.producto_id,
      vl.unidad_id,
      vl.lote_id,
      COALESCE(pr.codigo, '') AS codigo,
      COALESCE(pr.nombre, vl.descripcion, '') AS producto,
      u.abreviatura AS unidad,
      COALESCE(vl.cantidad, 0)::numeric AS cantidad,
      COALESCE(ep.generada, 0)::numeric AS generado,
      COALESCE(ep.surtida, 0)::numeric AS surtido,
      COALESCE(ep.entregada, 0)::numeric AS entregado,
      GREATEST(0::numeric, COALESCE(vl.cantidad, 0) - COALESCE(ep.surtida, 0) - COALESCE(ep.generada, 0))::numeric AS pendiente,
      COALESCE(vl.precio_unitario, 0)::numeric AS precio,
      (COALESCE(vl.cantidad, 0) * COALESCE(vl.precio_unitario, 0))::numeric AS subtotal,
      vl.created_at
    FROM public.venta_lineas vl
    LEFT JOIN public.productos pr ON pr.id = vl.producto_id
    LEFT JOIN public.unidades u ON u.id = vl.unidad_id
    LEFT JOIN entrega_producto ep ON ep.producto_id IS NOT DISTINCT FROM vl.producto_id
    WHERE vl.venta_id = p_pedido_id
  ),
  header AS (
    SELECT
      c.direccion AS cliente_direccion,
      c.telefono AS cliente_telefono,
      v.notas
    FROM public.ventas v
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    WHERE v.id = p_pedido_id
  ),
  rows_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'producto_id', l.producto_id,
      'unidad_id', l.unidad_id,
      'lote_id', l.lote_id,
      'codigo', l.codigo,
      'producto', l.producto,
      'unidad', l.unidad,
      'cantidad', l.cantidad,
      'generado', l.generado,
      'surtido', l.surtido,
      'entregado', l.entregado,
      'pendiente', l.pendiente,
      'precio', l.precio,
      'subtotal', l.subtotal
    ) ORDER BY l.created_at ASC, l.id), '[]'::jsonb) AS rows
    FROM lineas l
  )
  SELECT jsonb_build_object(
    'rows', r.rows,
    'cliente_direccion', h.cliente_direccion,
    'cliente_telefono', h.cliente_telefono,
    'notas', h.notas,
    'db_ms', ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::numeric, 2)
  )
  INTO v_result
  FROM rows_json r
  CROSS JOIN header h;

  RETURN COALESCE(v_result, jsonb_build_object('rows','[]'::jsonb,'cliente_direccion',NULL,'cliente_telefono',NULL,'notas',NULL,'db_ms',0));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_logistica_pedido_detalle_v4(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_pedido_detalle_v4(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_pedidos_counts_v4(uuid,date,date,text,uuid[],text,text)
IS 'Contadores/totales de Pedidos Operación sobre resumen persistente; no recorre partidas para progreso.';
COMMENT ON FUNCTION public.fn_logistica_pedidos_page_v4(uuid,date,date,text,uuid[],text,text,integer,integer)
IS 'Página ligera de Pedidos Operación. Filtra/busca en servidor y lee progreso desde logistica_pedido_resumen.';
COMMENT ON FUNCTION public.fn_logistica_pedido_detalle_v4(uuid)
IS 'Detalle lazy de un solo pedido. Consulta únicamente sus venta_lineas y entregas relacionadas.';
