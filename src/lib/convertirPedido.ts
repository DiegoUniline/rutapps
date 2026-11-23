/**
 * D-062 · Convertir un pedido en venta directa (RPC `fn_convertir_pedido_a_venta`).
 * La BD valida todo y descuenta el inventario en una sola transacción; aquí solo están las
 * condiciones para mostrar el botón (espejo de la RPC) y la llamada.
 */
import { supabase } from '@/lib/supabase';

export interface PedidoConvertible {
  tipo?: string | null;
  status?: string | null;
  cerrado_at?: string | null;
  es_saldo_inicial?: boolean | null;
}

/** ¿Se ofrece «Convertir a venta directa»? Pedido en borrador/confirmado, sin cerrar, sin entregas activas y con permiso. */
export function puedeConvertirPedido(
  venta: PedidoConvertible | null | undefined,
  opts: { entregasActivas: number; tienePermiso: boolean },
): boolean {
  if (!venta || !opts.tienePermiso) return false;
  if (venta.tipo !== 'pedido' || venta.es_saldo_inicial) return false;
  if (venta.status !== 'borrador' && venta.status !== 'confirmado') return false;
  if (venta.cerrado_at) return false;
  return opts.entregasActivas === 0;
}

/** Almacén preseleccionado: el del pedido; si no tiene, el del vendedor; si ninguno está en la lista, el primero. */
export function almacenSalidaInicial(
  almacenPedido: string | null | undefined,
  almacenVendedor: string | null | undefined,
  disponibles: { id: string }[],
): string {
  const ids = new Set(disponibles.map(a => a.id));
  if (almacenPedido && ids.has(almacenPedido)) return almacenPedido;
  if (almacenVendedor && ids.has(almacenVendedor)) return almacenVendedor;
  return disponibles[0]?.id ?? '';
}

export interface ResultadoConversion {
  venta_id: string;
  folio: string | null;
  status: string;
  almacen_id: string;
  total: number;
  saldo_pendiente: number;
  ya_convertido: boolean;
}

type RpcConvertir = (fn: 'fn_convertir_pedido_a_venta', args: { p_venta_id: string; p_almacen_id: string })
  => Promise<{ data: unknown; error: { message: string } | null }>;

/** Convierte el pedido. Lanza Error con el mensaje de la BD si no se pudo (no queda nada a medias). */
export async function convertirPedidoAVentaDirecta(ventaId: string, almacenId: string): Promise<ResultadoConversion> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcConvertir;
  const { data, error } = await rpc('fn_convertir_pedido_a_venta', { p_venta_id: ventaId, p_almacen_id: almacenId });
  if (error) throw new Error(error.message || 'No se pudo convertir el pedido');
  const r = (data ?? {}) as Partial<ResultadoConversion>;
  return {
    venta_id: String(r.venta_id ?? ventaId),
    folio: r.folio ?? null,
    status: String(r.status ?? 'confirmado'),
    almacen_id: String(r.almacen_id ?? almacenId),
    total: Number(r.total ?? 0),
    saldo_pendiente: Number(r.saldo_pendiente ?? 0),
    ya_convertido: !!r.ya_convertido,
  };
}
