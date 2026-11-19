/**
 * Excedente de pago (D-025): cuando una corrección deja el total de una venta abajo de lo
 * ya pagado, la BD responde con un error `EXCEDENTE|<monto>|<mensaje>` y el front pregunta
 * qué hacer con la diferencia. Luego reintenta mandando el destino elegido.
 */
export type DestinoExcedente = 'saldo_favor' | 'reembolso' | 'nada';

export interface ExcedenteInfo {
  monto: number;
  mensaje: string;
}

/** Lee el aviso de excedente de un mensaje de error de la BD; null si no lo es. */
export function parseExcedente(message: string | null | undefined): ExcedenteInfo | null {
  if (!message) return null;
  const i = message.indexOf('EXCEDENTE|');
  if (i < 0) return null;
  const [, monto, ...resto] = message.slice(i).split('|');
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { monto: n, mensaje: resto.join('|').trim() };
}

export const ETIQUETA_DESTINO: Record<DestinoExcedente, string> = {
  saldo_favor: 'Dejar como saldo a favor del cliente',
  reembolso: 'Se le devolvió el dinero',
  nada: 'No hacer nada',
};

/**
 * Llama a la BD; si responde con excedente, pregunta el destino y reintenta con él.
 * `cancelado` = el usuario cerró la pregunta sin elegir (no se guardó nada).
 */
export async function ejecutarConExcedente<E extends { message: string }>(
  llamar: (destino?: DestinoExcedente) => Promise<{ error: E | null }>,
  pedirDestino: (info: ExcedenteInfo) => Promise<DestinoExcedente | null>,
): Promise<{ error: E | null; cancelado: boolean }> {
  const r = await llamar();
  const info = parseExcedente(r.error?.message);
  if (!info) return { error: r.error, cancelado: false };
  const destino = await pedirDestino(info);
  if (!destino) return { error: null, cancelado: true };
  const r2 = await llamar(destino);
  return { error: r2.error, cancelado: false };
}

/** Firma mínima de supabase.rpc (evita inferir los tipos generados completos). */
export type RpcSinTipos = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
