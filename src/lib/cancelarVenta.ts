/**
 * Cancelar venta (D-020): una sola operación en la BD (`cancelar_venta`). Si la venta tiene
 * pagos, la BD responde `PAGADA|<monto>|<mensaje>` y el front pregunta qué hacer con el dinero.
 */
import { supabase } from '@/lib/supabase';
import type { RpcSinTipos } from '@/lib/excedente';

export type DestinoPagoCancelacion = 'cancelar_pago' | 'saldo_favor' | 'reembolso';

export interface PagadaInfo {
  monto: number;
  mensaje: string;
}

export const ETIQUETA_DESTINO_PAGO: Record<DestinoPagoCancelacion, string> = {
  cancelar_pago: 'Cancelar también el pago',
  saldo_favor: 'Dejarlo como saldo a favor del cliente',
  reembolso: 'Se le devolvió el dinero',
};

/** Lee el aviso de venta pagada de un error de la BD; null si no lo es. */
export function parsePagada(message: string | null | undefined): PagadaInfo | null {
  if (!message) return null;
  const i = message.indexOf('PAGADA|');
  if (i < 0) return null;
  const [, monto, ...resto] = message.slice(i).split('|');
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { monto: n, mensaje: resto.join('|').trim() };
}

export type PedirDestinoPago = (info: PagadaInfo) => Promise<DestinoPagoCancelacion | null>;

/**
 * Cancela la venta; si tiene pagos pregunta el destino (o usa `destinoFijo`) y reintenta.
 * `cancelado` = el usuario cerró la pregunta: no se guardó nada.
 */
export async function cancelarVenta(
  ventaId: string,
  pedirDestino: PedirDestinoPago,
  opciones: { motivo?: string | null; destinoFijo?: DestinoPagoCancelacion | null } = {},
): Promise<{ error: { message: string } | null; cancelado: boolean; destino: DestinoPagoCancelacion | null }> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcSinTipos;
  const llamar = (destino: DestinoPagoCancelacion | null) =>
    rpc('cancelar_venta', { p_venta_id: ventaId, p_destino_pago: destino, p_motivo: opciones.motivo ?? null });

  const r = await llamar(opciones.destinoFijo ?? null);
  const info = parsePagada(r.error?.message);
  if (!info) return { error: r.error, cancelado: false, destino: opciones.destinoFijo ?? null };
  const destino = await pedirDestino(info);
  if (!destino) return { error: null, cancelado: true, destino: null };
  const r2 = await llamar(destino);
  return { error: r2.error, cancelado: false, destino };
}
