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

/* ───────────────────────── F1 / F2 (D-049) ───────────────────────── */

/** Destino del producto devuelto: se queda vendible en el camión, o va a la merma del camión (D-036). */
export type DestinoDevolucion = 'vendible' | 'merma';

export const DESTINO_DEVOLUCION_LABELS: Record<DestinoDevolucion, string> = {
  vendible: 'Vendible en camión',
  merma: 'Merma en camión',
};

/** Etiqueta corta (ticket, listas). En escritorio «merma» va al almacén Mermas. */
export const DESTINO_DEVOLUCION_CORTO: Record<string, string> = { vendible: 'Vendible', merma: 'Merma' };

/** Motivos que por omisión sugieren merma (mismos defaults que «Configurar mermas»). */
const MOTIVOS_MERMA_DEFAULT = new Set(['danado', 'vencido', 'caducado']);

/**
 * El motivo solo PRE-SELECCIONA el destino (el vendedor lo puede cambiar). Usa la
 * configuración de la empresa (`devolucion_motivo_config.a_mermas`) si existe.
 */
export function destinoSugerido(motivo: string | null | undefined, config?: Record<string, boolean> | null): DestinoDevolucion {
  const m = motivo ?? '';
  if (config && typeof config[m] === 'boolean') return config[m] ? 'merma' : 'vendible';
  return MOTIVOS_MERMA_DEFAULT.has(m) ? 'merma' : 'vendible';
}

/**
 * Acción elegida en pantalla. «aplicar_venta» = nota de crédito aplicada a la venta en ese
 * momento (sustituye a «Descuento en venta», que ya no existe).
 */
export type AccionDevolucionUI = 'reposicion' | 'nota_credito' | 'devolucion_dinero' | 'aplicar_venta';

export function accionUIaBd(accion: AccionDevolucionUI): { accion: Exclude<AccionDevolucionDb, 'descuento_venta'>; aplica_venta: boolean } {
  if (accion === 'aplicar_venta') return { accion: 'nota_credito', aplica_venta: true };
  if (accion === 'nota_credito' || accion === 'devolucion_dinero') return { accion, aplica_venta: false };
  return { accion: 'reposicion', aplica_venta: false };
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Monto de un renglón: precio de la lista del cliente CON impuestos × cantidad. Espejo exacto
 * de `_devolucion_linea_monto` (la BD es la que lo guarda; aquí solo se muestra).
 */
export function montoDevolucionLinea(precioUnitario: number, cantidad: number, accion: AccionDevolucionUI): number {
  if (accion === 'reposicion') return 0;
  return r2(r2(precioUnitario) * (Number(cantidad) || 0));
}

export interface DevolucionLineaF1 {
  producto_id: string;
  cantidad: number;
  motivo: string;
  destino: DestinoDevolucion;
  accion: AccionDevolucionUI;
  /** Precio de la lista del cliente con impuestos (priceResolver). */
  precio_unitario: number;
  reemplazo_producto_id?: string | null;
  /** La reposición va como renglón «CAMBIO» de la venta (sale con la venta, no con la devolución). */
  reposicion_en_venta?: boolean;
  notas?: string | null;
}

/** Totales de la devolución para mostrar (crédito a favor, nota aplicada a la venta, dinero). */
export function resumenDevolucion(lineas: Pick<DevolucionLineaF1, 'cantidad' | 'accion' | 'precio_unitario'>[]) {
  let nota = 0; let notaAplicada = 0; let dinero = 0;
  for (const l of lineas) {
    const m = montoDevolucionLinea(l.precio_unitario, l.cantidad, l.accion);
    if (l.accion === 'nota_credito') nota += m;
    else if (l.accion === 'aplicar_venta') notaAplicada += m;
    else if (l.accion === 'devolucion_dinero') dinero += m;
  }
  return { nota: r2(nota), notaAplicada: r2(notaAplicada), dinero: r2(dinero) };
}

/** Renglones como los recibe `registrar_devolucion` (destino obligatorio = devolución F1). */
export function lineasParaRpc(lineas: DevolucionLineaF1[]): Array<Record<string, unknown>> {
  return lineas.map(l => {
    const { accion, aplica_venta } = accionUIaBd(l.accion);
    return {
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      motivo: l.motivo,
      notas: l.notas || null,
      accion,
      aplica_venta,
      destino: l.destino,
      precio_unitario: r2(l.precio_unitario),
      monto_credito: montoDevolucionLinea(l.precio_unitario, l.cantidad, l.accion),
      reemplazo_producto_id: l.reemplazo_producto_id || null,
      reposicion_en_venta: !!l.reposicion_en_venta,
    };
  });
}

/** Clave de la cola: la operación se identifica por el id de la devolución (idempotente). */
export const COLA_REGISTRAR_DEVOLUCION = 'rpc:registrar_devolucion';

/**
 * Sin conexión (o dentro de una venta encolada): UNA operación en la cola —la misma RPC
 * transaccional e idempotente por id—, no encabezado y renglones sueltos.
 * Además deja copia local (historial y saldo a favor sin señal).
 */
export async function encolarDevolucion(
  devolucion: Record<string, unknown> & { id: string; empresa_id: string },
  lineas: DevolucionLineaF1[],
): Promise<string> {
  const { queueOperations } = await import('./syncQueue');
  const { getOfflineTable } = await import('./offlineDb');
  const { deterministicUuid } = await import('./deterministicId');
  const pLineas = lineasParaRpc(lineas);
  await queueOperations([{
    table: COLA_REGISTRAR_DEVOLUCION,
    operation: 'rpc',
    data: { p_devolucion: devolucion, p_lineas: pLineas },
    keyField: 'p_devolucion.id',
  }]);
  try {
    const now = new Date().toISOString();
    await getOfflineTable('devoluciones')?.put({ ...devolucion, created_at: now, _offline: true });
    const tl = getOfflineTable('devolucion_lineas');
    if (tl) {
      for (let i = 0; i < pLineas.length; i++) {
        await tl.put({ ...pLineas[i], id: await deterministicUuid('devlinea', devolucion.id, i), devolucion_id: devolucion.id, created_at: now, _offline: true });
      }
    }
  } catch (e) {
    // Solo es la copia local para mostrar; la operación ya quedó en la cola.
    console.warn('No se pudo guardar la copia local de la devolución', e);
  }
  return devolucion.id;
}

/** F2: cancelar una devolución (revierte inventario, nota, cobro aplicado, caja y gasto). Requiere conexión. */
export async function cancelarDevolucionRpc(devolucionId: string, motivo: string): Promise<void> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcConDatos;
  const { error } = await rpc('cancelar_devolucion', { p_devolucion_id: devolucionId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}
