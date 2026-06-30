/**
 * Saldo a favor (crédito por nota de crédito de devoluciones).
 *
 * Modelo SIN tablas nuevas: el saldo a favor de un cliente se calcula como
 *   disponible = emitido − usado
 * donde
 *   emitido = Σ devolucion_lineas.monto_credito con accion = 'nota_credito'
 *   usado   = Σ pagos/cobros con metodo_pago = SALDO_FAVOR_METODO
 *
 * Estas funciones son la ÚNICA fuente de verdad del cálculo; las usan tanto
 * la venta nueva (StepPago) como la pantalla de Cobrar.
 */

/** Valor de metodo_pago que identifica un pago hecho con saldo a favor. */
export const SALDO_FAVOR_METODO = 'saldo_favor';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Saldo a favor disponible de un cliente.
 * Nunca negativo (si por datos sucios el usado supera lo emitido, devuelve 0).
 */
export function saldoFavorDisponible(emitido: number, usado: number): number {
  return Math.max(0, r2(r2(emitido) - r2(usado)));
}

/**
 * Cuánto saldo a favor se puede aplicar realmente a una venta/cobro.
 * Se topa al mínimo entre: lo disponible, lo que falta por cubrir, y lo que
 * el usuario pidió usar (si no especifica, se asume "todo lo posible").
 *
 * @returns aplicado (lo que se usa ahora) y restante (disponible después).
 */
export function aplicarSaldoFavor(
  disponible: number,
  montoACubrir: number,
  solicitado?: number,
): { aplicado: number; restante: number } {
  const disp = Math.max(0, r2(disponible));
  const cubrir = Math.max(0, r2(montoACubrir));
  const pedido = solicitado == null ? disp : Math.max(0, r2(solicitado));
  const aplicado = r2(Math.min(disp, cubrir, pedido));
  return { aplicado, restante: r2(disp - aplicado) };
}

/** ¿El cliente tiene saldo a favor para ofrecer el método de pago? */
export function tieneSaldoFavor(emitido: number, usado: number): boolean {
  return saldoFavorDisponible(emitido, usado) > 0;
}
