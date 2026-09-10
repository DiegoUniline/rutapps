-- Reconciliar ventas directas históricas marcadas como liquidadas sin pagos aplicados suficientes.
-- IMPORTANTE: se limita a venta_directa. No toca pedidos porque pueden usar políticas de cobro
-- donde saldo_pendiente=0 no demuestra que hayan sido pagados.
-- El método original no puede inferirse si el cobro no existe, por eso se registra como "historico"
-- y el origen queda explícitamente auditado como regularizacion_historica.

CREATE TEMP TABLE tmp_legacy_direct_sale_payment_repair ON COMMIT DROP AS
WITH paid AS (
  SELECT
    ca.venta_id,
    SUM(COALESCE(ca.monto_aplicado, 0))::numeric AS pagado
  FROM public.cobro_aplicaciones ca
  INNER JOIN public.cobros c
    ON c.id = ca.cobro_id
   AND c.status = 'activo'
  GROUP BY ca.venta_id
),
base AS (
  SELECT
    v.id AS venta_id,
    v.empresa_id,
    v.cliente_id,
    COALESCE(pc.user_id, pv.user_id) AS user_id,
    v.fecha,
    v.created_at,
    v.folio,
    CASE
      WHEN v.cerrado_at IS NOT NULL
        THEN COALESCE(v.total_efectivo, v.total, 0)
      ELSE COALESCE(v.total, 0)
    END::numeric AS total_real,
    COALESCE(p.pagado, 0)::numeric AS pagado
  FROM public.ventas v
  LEFT JOIN public.profiles pc ON pc.id = v.creado_por
  LEFT JOIN public.profiles pv ON pv.id = v.vendedor_id
  LEFT JOIN paid p ON p.venta_id = v.id
  WHERE v.tipo = 'venta_directa'
    AND v.status::text <> 'cancelado'
    AND COALESCE(v.es_saldo_inicial, false) = false
    AND v.cliente_id IS NOT NULL
    -- Sólo reparar registros que el sistema histórico ya trataba como liquidados.
    AND COALESCE(v.saldo_pendiente, 0) <= 0.009
),
candidates AS (
  SELECT
    b.*,
    GREATEST(0::numeric, b.total_real - b.pagado)::numeric AS faltante,
    md5(b.venta_id::text || ':legacy-liquidated-payment')::uuid AS cobro_id,
    md5(b.venta_id::text || ':legacy-liquidated-payment-application')::uuid AS aplicacion_id
  FROM base b
)
SELECT *
FROM candidates
WHERE total_real > 0.009
  AND faltante > 0.009
  -- No inventar un usuario: si no podemos resolver al creador/vendedor, se omite.
  AND user_id IS NOT NULL;

INSERT INTO public.cobros (
  id,
  empresa_id,
  cliente_id,
  user_id,
  monto,
  metodo_pago,
  referencia,
  fecha,
  created_at,
  status,
  origen,
  notas
)
SELECT
  r.cobro_id,
  r.empresa_id,
  r.cliente_id,
  r.user_id,
  r.faltante,
  'historico',
  'REG-' || COALESCE(r.folio, LEFT(r.venta_id::text, 8)),
  r.fecha,
  COALESCE(r.created_at, now()),
  'activo',
  'regularizacion_historica',
  'Pago reconstruido para venta directa histórica que figuraba liquidada sin aplicaciones suficientes. Método original no disponible.'
FROM tmp_legacy_direct_sale_payment_repair r
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cobro_aplicaciones (
  id,
  cobro_id,
  venta_id,
  monto_aplicado,
  created_at
)
SELECT
  r.aplicacion_id,
  r.cobro_id,
  r.venta_id,
  r.faltante,
  COALESCE(r.created_at, now())
FROM tmp_legacy_direct_sale_payment_repair r
ON CONFLICT (id) DO NOTHING;

-- El trigger existente de cobro_aplicaciones recalcula saldo_pendiente desde pagos reales.
