-- Workspace resumido para Logística > Pedidos.
-- Evita descargar venta_lineas + productos + entregas + entrega_lineas para cada fila.
-- La tabla inicial recibe una sola fila agregada por pedido; el detalle se carga bajo demanda.

CREATE INDEX IF NOT EXISTS idx_venta_lineas_logistica_venta_producto
  ON public.venta_lineas (venta_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_entrega_lineas_logistica_entrega_producto
  ON public.entrega_lineas (entrega_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_pedido_status_fecha
  ON public.entregas (pedido_id, status, fecha DESC)
  WHERE pedido_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_logistica_pedidos_workspace(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_fecha_tipo text DEFAULT 'levantamiento',
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  folio text,
  cliente_id uuid,
  cliente_nombre text,
  cliente_direccion text,
  cliente_telefono text,
  vendedor_id uuid,
  vendedor_nombre text,
  status text,
  fecha text,
  fecha_programada text,
  fecha_entrega_real text,
  total numeric,
  cerrado_at text,
  notas text,
  total_demanda numeric,
  total_generada numeric,
  total_surtido numeric,
  total_entregado numeric,
  total_pendiente numeric,
  total_valor_pendiente numeric,
  lineas_pendientes bigint,
  fully_generada boolean,
  fully_surtido boolean,
  fully_delivered boolean,
  en_ruta boolean,
  estado_odoo text,
  pct_generada integer,
  pct_surtido integer,
  pct_entregado integer,
  vendedor_ruta_id uuid,
  sort_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
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
    v.fecha::date AS fecha,
    v.fecha_entrega::date AS fecha_entrega_original,
    COALESCE(v.total, 0)::numeric AS total,
    v.cerrado_at,
    v.notas,
    v.created_at
  FROM public.ventas v
  LEFT JOIN public.clientes c ON c.id = v.cliente_id
  LEFT JOIN public.profiles vp ON vp.id = v.vendedor_id
  WHERE v.empresa_id = p_empresa_id
    AND v.tipo::text = 'pedido'
    AND v.status::text IN ('borrador', 'confirmado', 'entregado')
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
),
entrega_meta AS (
  SELECT
    e.pedido_id,
    MAX(e.fecha::date) FILTER (WHERE e.status::text <> 'cancelado') AS fecha_programada_actual,
    MAX(e.fecha_entrega::date) FILTER (WHERE e.status::text = 'hecho') AS fecha_entrega_real,
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
filtered AS (
  SELECT
    b.*,
    COALESCE(em.fecha_programada_actual, b.fecha_entrega_original) AS fecha_programada,
    em.fecha_entrega_real,
    COALESCE(em.tiene_en_ruta, false) AS tiene_en_ruta,
    em.vendedor_ruta_id
  FROM base b
  LEFT JOIN entrega_meta em ON em.pedido_id = b.id
  WHERE
    (
      p_fecha_tipo = 'programada'
      AND (p_fecha_desde IS NULL OR COALESCE(em.fecha_programada_actual, b.fecha_entrega_original) >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR COALESCE(em.fecha_programada_actual, b.fecha_entrega_original) <= p_fecha_hasta)
    )
    OR
    (
      COALESCE(p_fecha_tipo, 'levantamiento') <> 'programada'
      AND (p_fecha_desde IS NULL OR b.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR b.fecha <= p_fecha_hasta)
    )
),
venta_producto AS (
  SELECT
    vl.venta_id,
    vl.producto_id,
    SUM(COALESCE(vl.cantidad, 0))::numeric AS cantidad,
    SUM(COALESCE(vl.cantidad, 0) * COALESCE(vl.precio_unitario, 0))::numeric AS valor
  FROM public.venta_lineas vl
  INNER JOIN filtered f ON f.id = vl.venta_id
  GROUP BY vl.venta_id, vl.producto_id
),
entrega_producto AS (
  SELECT
    e.pedido_id,
    el.producto_id,
    SUM(
      CASE WHEN e.status::text = 'borrador'
        THEN COALESCE(el.cantidad_entregada, 0)
        ELSE 0 END
    )::numeric AS generada,
    SUM(
      CASE WHEN e.status::text IN ('surtido', 'asignado', 'cargado', 'en_ruta', 'hecho')
        THEN COALESCE(el.cantidad_entregada, 0)
        ELSE 0 END
    )::numeric AS surtida,
    SUM(
      CASE WHEN e.status::text = 'hecho'
        THEN COALESCE(el.cantidad_entregada, 0)
        ELSE 0 END
    )::numeric AS entregada
  FROM public.entregas e
  INNER JOIN filtered f ON f.id = e.pedido_id
  INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
  WHERE e.status::text <> 'cancelado'
  GROUP BY e.pedido_id, el.producto_id
),
line_calc AS (
  SELECT
    vp.venta_id,
    vp.producto_id,
    vp.cantidad,
    vp.valor,
    COALESCE(ep.generada, 0)::numeric AS generada,
    COALESCE(ep.surtida, 0)::numeric AS surtida,
    COALESCE(ep.entregada, 0)::numeric AS entregada,
    GREATEST(
      0::numeric,
      vp.cantidad - COALESCE(ep.surtida, 0) - COALESCE(ep.generada, 0)
    )::numeric AS pendiente,
    CASE
      WHEN vp.cantidad > 0 THEN
        GREATEST(
          0::numeric,
          vp.cantidad - COALESCE(ep.surtida, 0) - COALESCE(ep.generada, 0)
        ) * (vp.valor / vp.cantidad)
      ELSE 0::numeric
    END AS valor_pendiente
  FROM venta_producto vp
  LEFT JOIN entrega_producto ep
    ON ep.pedido_id = vp.venta_id
   AND ep.producto_id IS NOT DISTINCT FROM vp.producto_id
),
agg AS (
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
calc AS (
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
final_calc AS (
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
    END AS estado_odoo
  FROM calc c
)
SELECT
  f.id,
  f.folio,
  f.cliente_id,
  f.cliente_nombre,
  f.cliente_direccion,
  f.cliente_telefono,
  f.vendedor_id,
  f.vendedor_nombre,
  f.status,
  f.fecha::text AS fecha,
  f.fecha_programada::text AS fecha_programada,
  f.fecha_entrega_real::text AS fecha_entrega_real,
  f.total,
  f.cerrado_at::text AS cerrado_at,
  f.notas,
  f.total_demanda,
  f.total_generada,
  f.total_surtido,
  f.total_entregado,
  f.total_pendiente,
  f.total_valor_pendiente,
  f.lineas_pendientes,
  f.fully_generada,
  f.fully_surtido,
  f.fully_delivered,
  f.en_ruta,
  f.estado_odoo,
  CASE WHEN f.total_demanda > 0 THEN ROUND((f.total_generada / f.total_demanda) * 100)::int ELSE 0 END AS pct_generada,
  CASE WHEN f.total_demanda > 0 THEN ROUND((f.total_surtido / f.total_demanda) * 100)::int ELSE 0 END AS pct_surtido,
  CASE WHEN f.total_demanda > 0 THEN ROUND((f.total_entregado / f.total_demanda) * 100)::int ELSE 0 END AS pct_entregado,
  f.vendedor_ruta_id,
  CASE
    WHEN p_fecha_tipo = 'programada' THEN COALESCE(f.fecha_programada, f.fecha)
    ELSE f.fecha
  END AS sort_date
FROM final_calc f
ORDER BY sort_date DESC, f.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_logistica_pedidos_workspace(uuid, date, date, text, uuid[], text)
  TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_pedidos_workspace(uuid, date, date, text, uuid[], text)
IS 'Resumen operativo de pedidos para Logística. Evita enviar líneas y entregas completas en la carga inicial.';
