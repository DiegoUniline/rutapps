import { roundMoney } from '@/lib/utils';

type PagoAplicado = {
  monto_aplicado?: number | null;
  cobros?: { status?: string | null } | null;
};

/** Saldo posterior a una edición, basado solo en cobros realmente aplicados. */
export function saldoVentaTrasEditar(totalNuevo: number, pagos: PagoAplicado[]): number {
  const pagadoActivo = pagos.reduce((sum, pago) => {
    if ((pago.cobros?.status ?? 'activo') === 'cancelado') return sum;
    return sum + (Number(pago.monto_aplicado) || 0);
  }, 0);
  return roundMoney(Math.max(0, totalNuevo - pagadoActivo));
}
