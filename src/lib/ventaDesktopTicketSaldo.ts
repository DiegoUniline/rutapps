import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { roundMoney } from '@/lib/utils';

/** Saldo de las otras ventas del cliente, leído al imprimir (no modifica cartera). */
export async function fetchVentaDesktopTicketSaldo(
  empresaId: string | undefined,
  clienteId: string | null | undefined,
  ventaId: string | null | undefined,
  saldoEstaVenta: number,
): Promise<{ saldoAnterior: number; saldoNuevo: number }> {
  if (!empresaId) throw new Error('No se pudo consultar el saldo anterior: falta la empresa.');
  if (!clienteId) return { saldoAnterior: 0, saldoNuevo: roundMoney(saldoEstaVenta) };

  const ventas = await fetchAllPages<{ saldo_pendiente: number | null }>((from, to) => {
    let query = supabase.from('ventas')
      .select('saldo_pendiente')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', clienteId)
      .gt('saldo_pendiente', 0)
      .in('status', ['borrador', 'confirmado', 'entregado', 'facturado'])
      .order('id');
    if (ventaId) query = query.neq('id', ventaId);
    return query.range(from, to);
  });

  const saldoAnterior = roundMoney(ventas.reduce((sum, venta) => sum + Number(venta.saldo_pendiente ?? 0), 0));
  return { saldoAnterior, saldoNuevo: roundMoney(saldoAnterior + saldoEstaVenta) };
}