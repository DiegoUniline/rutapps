from pathlib import Path

# 1) Estado de cuenta: fuente de verdad = pagos reales aplicados.
p = Path('src/pages/EstadoCuentaClientePage.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace(
    "import { pagadoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';",
    "import { pagadoRealVenta, saldoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';",
    1,
)

old = """  const ventasPendientes = detalle?.ventas.filter(v => (v.saldo_pendiente ?? 0) > 0.01) ?? [];
  const ventasPagadas = detalle?.ventas.filter(v => (v.saldo_pendiente ?? 0) <= 0.01) ?? [];"""
new = """  // Una venta sólo está liquidada si los cobros activos aplicados cubren su total real.
  // Nunca usamos saldo_pendiente=0 como prueba de pago porque datos históricos/pedidos
  // pueden tener ese campo en cero sin una aplicación de cobro real.
  const ventasPendientes = detalle?.ventas.filter(v => saldoRealVenta(v) > 0.01) ?? [];
  const ventasPagadas = detalle?.ventas.filter(v =>
    totalEfectivoVenta(v) > 0.01 && saldoRealVenta(v) <= 0.01
  ) ?? [];"""
if old not in s:
    raise SystemExit('classification block not found')
s = s.replace(old, new, 1)

old = "saldo_pendiente: Math.min(Math.max(0, Number(v.saldo_pendiente ?? 0)), totalReal),"
new = "saldo_pendiente: saldoRealVenta(v),"
if old not in s:
    raise SystemExit('pdf saldo mapping not found')
s = s.replace(old, new, 1)

old = """    const totalSaldo = detalle?.ventas.reduce((sum, v) => {
      const totalReal = totalEfectivoVenta(v);
      const saldo = Math.max(0, Number(v.saldo_pendiente ?? 0));
      return sum + Math.min(saldo, totalReal);
    }, 0) ?? 0;"""
new = """    const totalSaldo = detalle?.ventas.reduce((sum, v) => sum + saldoRealVenta(v), 0) ?? 0;"""
if old not in s:
    raise SystemExit('KPI saldo block not found')
s = s.replace(old, new, 1)

# Pending rows: use real total / real saldo.
s = s.replace(
    "<TableCell className=\"text-right text-[12px]\">{fmt(v.total ?? 0)}</TableCell>\n                    <TableCell className=\"text-right text-[12px] text-success\">{fmt(pagadoRealVenta(v))}</TableCell>\n                    <TableCell className=\"text-right font-bold text-success\">{fmt(v.saldo_pendiente ?? 0)}</TableCell>",
    "<TableCell className=\"text-right text-[12px]\">{fmt(totalEfectivoVenta(v))}</TableCell>\n                    <TableCell className=\"text-right text-[12px] text-success\">{fmt(pagadoRealVenta(v))}</TableCell>\n                    <TableCell className=\"text-right font-bold text-warning\">{fmt(saldoRealVenta(v))}</TableCell>",
    1,
)

old = """                const t = ventasPendientes.reduce((s, v) => s + (v.total ?? 0), 0);
                const p = ventasPendientes.reduce((s, v) => s + pagadoRealVenta(v), 0);
                const sp = ventasPendientes.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);"""
new = """                const t = ventasPendientes.reduce((s, v) => s + totalEfectivoVenta(v), 0);
                const p = ventasPendientes.reduce((s, v) => s + pagadoRealVenta(v), 0);
                const sp = ventasPendientes.reduce((s, v) => s + saldoRealVenta(v), 0);"""
if old not in s:
    raise SystemExit('pending footer block not found')
s = s.replace(old, new, 1)

# Liquidated section: prove payment explicitly.
old = """                  <TableRow>
                    <TableHead className=\"text-[11px]\">Folio</TableHead>
                    <TableHead className=\"text-[11px]\">Fecha</TableHead>
                    <TableHead className=\"text-[11px] text-right\">Total</TableHead>
                    <TableHead className=\"text-[11px]\">Estado</TableHead>
                  </TableRow>"""
new = """                  <TableRow>
                    <TableHead className=\"text-[11px]\">Folio</TableHead>
                    <TableHead className=\"text-[11px]\">Fecha</TableHead>
                    <TableHead className=\"text-[11px]\">Condición</TableHead>
                    <TableHead className=\"text-[11px] text-right\">Total</TableHead>
                    <TableHead className=\"text-[11px] text-right\">Pagado</TableHead>
                    <TableHead className=\"text-[11px]\">Estado</TableHead>
                  </TableRow>"""
if old not in s:
    raise SystemExit('liquidated header not found')
s = s.replace(old, new, 1)

old = """                      <TableCell className=\"font-mono text-[11px]\">{v.folio ?? v.id.slice(0, 8)}</TableCell>
                      <TableCell className=\"text-[12px]\">{fmtDate(v.fecha)}</TableCell>
                      <TableCell className=\"text-right text-[12px]\">{fmt(v.total ?? 0)}</TableCell>
                      <TableCell><Badge variant=\"secondary\" className=\"text-[10px]\">{v.status}</Badge></TableCell>"""
new = """                      <TableCell className=\"font-mono text-[11px]\">{v.folio ?? v.id.slice(0, 8)}</TableCell>
                      <TableCell className=\"text-[12px]\">{fmtDate(v.fecha)}</TableCell>
                      <TableCell><Badge variant=\"outline\" className=\"text-[10px]\">{v.condicion_pago}</Badge></TableCell>
                      <TableCell className=\"text-right text-[12px]\">{fmt(totalEfectivoVenta(v))}</TableCell>
                      <TableCell className=\"text-right font-bold text-success tabular-nums\">{fmt(pagadoRealVenta(v))}</TableCell>
                      <TableCell><Badge variant=\"secondary\" className=\"text-[10px]\">{v.status}</Badge></TableCell>"""
if old not in s:
    raise SystemExit('liquidated row not found')
s = s.replace(old, new, 1)

old = """                  const shown = ventasPagadas.slice(0, 30);
                  const t = shown.reduce((s, v) => s + (v.total ?? 0), 0);
                  return (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className=\"text-[11px] text-muted-foreground font-semibold\">Totales ({shown.length})</TableCell>
                        <TableCell className=\"text-right font-bold tabular-nums\">{fmt(t)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>"""
new = """                  const shown = ventasPagadas.slice(0, 30);
                  const t = shown.reduce((s, v) => s + totalEfectivoVenta(v), 0);
                  const p = shown.reduce((s, v) => s + pagadoRealVenta(v), 0);
                  return (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className=\"text-[11px] text-muted-foreground font-semibold\">Totales ({shown.length})</TableCell>
                        <TableCell className=\"text-right font-bold tabular-nums\">{fmt(t)}</TableCell>
                        <TableCell className=\"text-right font-bold text-success tabular-nums\">{fmt(p)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>"""
if old not in s:
    raise SystemExit('liquidated footer not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')

# 2) POS: una venta nunca nace pagada. El cobro real/trigger es quien lleva saldo a cero.
pos = Path('src/pages/PuntoVentaPage.tsx')
ps = pos.read_text(encoding='utf-8')
old = "saldo_pendiente: condicion === 'credito' ? totals.total : 0,"
new = "saldo_pendiente: totals.total, // nace con saldo; aplicar_cobro lo reduce sólo cuando existe pago real"
if old not in ps:
    raise SystemExit('POS saldo initialization not found')
ps = ps.replace(old, new, 1)
pos.write_text(ps, encoding='utf-8')

# 3) Migración histórica conservadora e idempotente.
migration = Path('supabase/migrations/20260910183000_reconcile_historical_direct_sale_payments.sql')
migration.write_text(r'''-- Reconciliar ventas directas históricas marcadas como liquidadas sin pagos aplicados suficientes.
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
''', encoding='utf-8')

print('Real payment history fix applied')
