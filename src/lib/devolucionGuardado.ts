/**
 * Guardado de devoluciones (F0, H1). Reglas puras + llamada a la RPC transaccional.
 */
import { supabase } from '@/lib/supabase';

export const ACCIONES_DEVOLUCION = ['reposicion', 'nota_credito', 'devolucion_dinero', 'descuento_venta'] as const;
export type AccionDevolucionDb = typeof ACCIONES_DEVOLUCION[number];

/**
 * `devolucion_lineas.accion` es NOT NULL. Sin elección de dinero se usa 'reposicion',
 * el default de la columna: no genera nota de crédito ni devolución de dinero
 * (saldo a favor solo cuenta 'nota_credito'; la liquidación solo 'devolucion_dinero').
 */
export function accionDevolucionODefault(accion: string | null | undefined): AccionDevolucionDb {
  return (ACCIONES_DEVOLUCION as readonly string[]).includes(accion ?? '') ? (accion as AccionDevolucionDb) : 'reposicion';
}

/** Cantidad a devolver: número finito mayor a cero (la BD lo exige con un CHECK). */
export function esCantidadDevolucionValida(cantidad: unknown): boolean {
  const n = typeof cantidad === 'number' ? cantidad : Number(cantidad);
  return Number.isFinite(n) && n > 0;
}

/**
 * Repara un renglón de devolución ENCOLADO por versiones anteriores (accion null o
 * inválida) para que la cola offline lo pueda subir en vez de atorarse.
 */
export function sanearDevolucionLinea<T extends Record<string, unknown>>(row: T): T {
  return { ...row, accion: accionDevolucionODefault(typeof row.accion === 'string' ? row.accion : null) };
}

type RpcConDatos = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/** Encabezado + renglones + cantidad devuelta de la carga en UNA transacción (`registrar_devolucion`). */
export async function registrarDevolucionRpc(
  devolucion: Record<string, unknown>,
  lineas: Array<Record<string, unknown>>,
): Promise<string> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcConDatos;
  const { data, error } = await rpc('registrar_devolucion', { p_devolucion: devolucion, p_lineas: lineas });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('No se pudo registrar la devolución');
  return data;
}
