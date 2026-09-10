from pathlib import Path

# Update screen
p = Path('src/pages/EstadoCuentaClientePage.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace("import { pagadoRealVenta } from '@/lib/ventaCerrada';", "import { pagadoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';", 1)

old_select = ".select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, cobro_aplicaciones(monto_aplicado, cobros!inner(status))')"
new_select = ".select('id, folio, fecha, total, total_efectivo, cerrado_at, cerrado_snapshot, saldo_pendiente, condicion_pago, status, cobro_aplicaciones(monto_aplicado, cobros!inner(status))')"
if old_select not in s:
    raise SystemExit('detail ventas select not found')
s = s.replace(old_select, new_select, 1)

old_totals = """    const totalVentas = detalle?.ventas.reduce((s, v) => s + (v.total ?? 0), 0) ?? 0;
    const totalSaldo = detalle?.ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0) ?? 0;
    const totalCobrado = detalle?.cobros.reduce((s, c) => s + (c.monto ?? 0), 0) ?? 0;"""
new_totals = """    // Los KPIs deben usar el mismo universo contable para que cuadren:
    // vendido real = liquidado + saldo pendiente.
    const totalVentas = detalle?.ventas.reduce((sum, v) => sum + totalEfectivoVenta(v), 0) ?? 0;
    const totalSaldo = detalle?.ventas.reduce((sum, v) => {
      const totalReal = totalEfectivoVenta(v);
      const saldo = Math.max(0, Number(v.saldo_pendiente ?? 0));
      return sum + Math.min(saldo, totalReal);
    }, 0) ?? 0;
    const totalLiquidado = Math.max(0, totalVentas - totalSaldo);
    const totalCobrosRegistrados = detalle?.cobros.reduce((s, c) => s + (c.monto ?? 0), 0) ?? 0;"""
if old_totals not in s:
    raise SystemExit('screen totals block not found')
s = s.replace(old_totals, new_totals, 1)

old_card = """            <div>
              <p className=\"text-[10px] text-muted-foreground uppercase\">Total cobrado</p>
              <p className=\"text-lg font-bold text-success\">{fmt(totalCobrado)}</p>
            </div>"""
new_card = """            <div>
              <p className=\"text-[10px] text-muted-foreground uppercase\">Total liquidado</p>
              <p className=\"text-lg font-bold text-success\">{fmt(totalLiquidado)}</p>
              <p className=\"text-[10px] text-muted-foreground mt-0.5\">Cobros registrados: {fmt(totalCobrosRegistrados)}</p>
            </div>"""
if old_card not in s:
    raise SystemExit('screen total cobrado card not found')
s = s.replace(old_card, new_card, 1)

# PDF mapping should carry effective total where available
old_pdf_map = """      ventas: detalle.ventas.map(v => ({
        folio: v.folio ?? v.id.slice(0, 8),
        fecha: v.fecha,
        total: v.total ?? 0,
        saldo_pendiente: v.saldo_pendiente ?? 0,
        status: v.status,
        condicion_pago: v.condicion_pago ?? '',
      })),"""
new_pdf_map = """      ventas: detalle.ventas.map(v => {
        const totalReal = totalEfectivoVenta(v);
        return {
          folio: v.folio ?? v.id.slice(0, 8),
          fecha: v.fecha,
          total: totalReal,
          saldo_pendiente: Math.min(Math.max(0, Number(v.saldo_pendiente ?? 0)), totalReal),
          status: v.status,
          condicion_pago: v.condicion_pago ?? '',
        };
      }),"""
if old_pdf_map not in s:
    raise SystemExit('pdf mapping block not found')
s = s.replace(old_pdf_map, new_pdf_map, 1)

p.write_text(s, encoding='utf-8')

# Update PDF KPI semantics
p2 = Path('src/lib/estadoCuentaPdf.ts')
s2 = p2.read_text(encoding='utf-8')
old_pdf_totals = """  const totalVendido = ventasValidas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventasValidas.reduce((s, v) => s + v.saldo_pendiente, 0);
  const totalCobrado = cobros.reduce((s, c) => s + c.monto, 0);"""
new_pdf_totals = """  const totalVendido = ventasValidas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventasValidas.reduce((s, v) => s + Math.min(Math.max(0, v.saldo_pendiente), v.total), 0);
  // KPI conciliado: vendido = liquidado + pendiente. Los cobros se muestran aparte
  // en el historial de pagos como movimientos efectivamente registrados.
  const totalLiquidado = Math.max(0, totalVendido - totalPendiente);"""
if old_pdf_totals not in s2:
    raise SystemExit('pdf totals block not found')
s2 = s2.replace(old_pdf_totals, new_pdf_totals, 1)

old_pdf_card = """    {
      label: 'TOTAL COBRADO',
      render: (cx, cy) => {
        doc.setTextColor(...TEXT);
        drawMoneyMixed(doc, totalCobrado, cx + 3, cy + 15, sym, 16, 9);
      },
    },"""
new_pdf_card = """    {
      label: 'TOTAL LIQUIDADO',
      render: (cx, cy) => {
        doc.setTextColor(...TEXT);
        drawMoneyMixed(doc, totalLiquidado, cx + 3, cy + 15, sym, 16, 9);
      },
    },"""
if old_pdf_card not in s2:
    raise SystemExit('pdf total cobrado card not found')
s2 = s2.replace(old_pdf_card, new_pdf_card, 1)

p2.write_text(s2, encoding='utf-8')
print('Estado de cuenta totals reconciled')
