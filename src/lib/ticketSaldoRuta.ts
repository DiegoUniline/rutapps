/**
 * Saldos del ticket de una venta de ruta recién hecha (H10). Sigue la misma regla
 * con que useRutaVenta aplica los cobros:
 *  - Contado: los pagos cubren primero ESTA venta y el sobrante se abona a cuentas
 *    anteriores → pagado de esta venta = min(total, pagos − abonado a cuentas).
 *  - Crédito: nada se aplica a esta venta; todo el pago es abono a cuentas
 *    anteriores → pagado de esta venta = 0 y su saldo = total.
 * Antes, en crédito se restaba el pago dos veces (de esta venta y de las anteriores).
 */
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function saldosTicketRuta(p: {
  condicionPago: string;
  total: number;
  /** Suma de los pagos capturados en la venta (incluye lo abonado a cuentas anteriores). */
  pagos: number;
  /** Lo que de esos pagos se aplicó a cuentas anteriores. */
  aplicadoACuentas: number;
  /** Saldo de cuentas anteriores antes de esta venta. */
  saldoAnterior: number;
  /** Nota de crédito de una devolución aplicada a ESTA venta (D-049): también la paga. */
  notaAplicada?: number;
}): { pagadoEstaVenta: number; saldoRestanteEstaVenta: number; saldoAnteriorRestante: number; saldoNuevo: number } {
  const total = Math.max(r2(p.total), 0);
  const aplicado = Math.max(r2(p.aplicadoACuentas), 0);
  const pagadoDinero = p.condicionPago === 'credito'
    ? 0
    : Math.min(total, Math.max(0, r2(p.pagos - aplicado)));
  const pagadoEstaVenta = r2(pagadoDinero + Math.min(Math.max(r2(p.notaAplicada ?? 0), 0), r2(total - pagadoDinero)));
  const saldoRestanteEstaVenta = r2(Math.max(0, total - pagadoEstaVenta));
  const saldoAnteriorRestante = r2(Math.max(0, r2(p.saldoAnterior) - aplicado));
  return {
    pagadoEstaVenta: r2(pagadoEstaVenta),
    saldoRestanteEstaVenta,
    saldoAnteriorRestante,
    saldoNuevo: r2(saldoAnteriorRestante + saldoRestanteEstaVenta),
  };
}
