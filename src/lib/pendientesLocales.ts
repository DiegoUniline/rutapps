// Lo que la cola offline todavía NO sube, visto por tabla local.
//
// Una descarga completa («Descargar todo», cambio de versión de datos, reconciliación) borra
// el alcance local de una tabla y lo reemplaza con lo del servidor. Antes eso borraba del
// teléfono las ventas, cobros y cambios hechos sin señal que aún no subían (la cola sí los
// conservaba, pero el vendedor dejaba de verlos y los saldos locales quedaban mal).
// Ahora, después de escribir lo descargado, se vuelve a poner encima lo pendiente.
//
// Las funciones puras (copiasLocalesDeRpc, pendientesDeTabla, superponerPendientes) se
// prueban sin IndexedDB; reaplicarPendientesEnTabla hace la parte de Dexie.
import type { Table } from 'dexie';
import { offlineDb, type SyncQueueItem } from './offlineDb';

export type Fila = Record<string, unknown>;

export const COLA_REGISTRAR_VENTA_RUTA = 'rpc:fn_ruta_registrar_venta';
const COLA_REGISTRAR_DEVOLUCION = 'rpc:registrar_devolucion';

function esObjeto(v: unknown): v is Fila {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}
function lista(v: unknown): Fila[] {
  return Array.isArray(v) ? v.filter(esObjeto) : [];
}
function idDe(f: Fila | undefined): string | null {
  const id = f?.id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Filas que una operación RPC encolada deja en la copia local (lo que el teléfono muestra
 * mientras sube). Tablas sin copia local se ignoran al escribir.
 */
export function copiasLocalesDeRpc(tabla: string, data: unknown): Array<{ tabla: string; filas: Fila[] }> {
  if (!esObjeto(data)) return [];
  if (tabla === COLA_REGISTRAR_VENTA_RUTA) {
    const p = data.p_venta;
    if (!esObjeto(p) || !esObjeto(p.venta)) return [];
    const venta = p.venta;
    const ventaId = idDe(venta);
    if (!ventaId) return [];
    const cobros = lista(p.cobros);
    return [
      { tabla: 'ventas', filas: [{ ...venta, _offline: true }] },
      { tabla: 'venta_lineas', filas: lista(p.lineas).map(l => ({ ...l, venta_id: ventaId })) },
      { tabla: 'venta_linea_lotes', filas: lista(p.lineas_lotes).map(l => ({ ...l, venta_id: ventaId })) },
      { tabla: 'promocion_aplicada', filas: lista(p.promociones).map(l => ({ ...l, venta_id: ventaId })) },
      {
        tabla: 'cobros',
        filas: cobros.map(c => {
          const { aplicaciones: _apl, ...cobro } = c;
          return { ...cobro, empresa_id: venta.empresa_id, _offline: true };
        }),
      },
      {
        tabla: 'cobro_aplicaciones',
        filas: cobros.flatMap(c => lista(c.aplicaciones).map(a => ({ ...a, cobro_id: c.id }))),
      },
    ];
  }
  if (tabla === COLA_REGISTRAR_DEVOLUCION) {
    const dev = data.p_devolucion;
    const devId = esObjeto(dev) ? idDe(dev) : null;
    if (!esObjeto(dev) || !devId) return [];
    return [
      { tabla: 'devoluciones', filas: [{ ...dev, _offline: true }] },
      { tabla: 'devolucion_lineas', filas: lista(data.p_lineas).map(l => ({ ...l, devolucion_id: devId, _offline: true })) },
    ];
  }
  return [];
}

export interface PendientesTabla {
  /** Filas creadas en el teléfono que aún no suben (por id). */
  altas: Map<string, Fila>;
  /** Cambios parciales pendientes (por id), ya combinados en orden. */
  cambios: Map<string, Fila>;
  /** Bajas pendientes (por id). */
  bajas: Set<string>;
}

/** Lo pendiente de UNA tabla local, recorriendo la cola en el orden en que se encoló. */
export function pendientesDeTabla(items: SyncQueueItem[], tabla: string): PendientesTabla {
  const altas = new Map<string, Fila>();
  const cambios = new Map<string, Fila>();
  const bajas = new Set<string>();
  const ordenados = [...items].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  for (const it of ordenados) {
    if (it.operation === 'rpc') {
      for (const copia of copiasLocalesDeRpc(it.table, it.data)) {
        if (copia.tabla !== tabla) continue;
        for (const f of copia.filas) {
          const id = idDe(f);
          if (id) altas.set(id, f);
        }
      }
      continue;
    }
    if (it.table !== tabla) continue;
    const clave = it.keyValue != null ? String(it.keyValue) : null;
    if (it.operation === 'insert-many') {
      for (const f of lista(it.data)) {
        const id = idDe(f);
        if (id) { altas.set(id, f); bajas.delete(id); }
      }
    } else if (it.operation === 'insert') {
      if (!clave || !esObjeto(it.data)) continue;
      altas.set(clave, it.data);
      bajas.delete(clave);
    } else if (it.operation === 'update') {
      if (!clave || !esObjeto(it.data)) continue;
      cambios.set(clave, { ...(cambios.get(clave) ?? {}), ...it.data });
    } else if (it.operation === 'delete') {
      if (!clave) continue;
      bajas.add(clave);
      altas.delete(clave);
      cambios.delete(clave);
    }
  }
  return { altas, cambios, bajas };
}

/**
 * Qué escribir sobre la copia local para que lo pendiente siga visible.
 * - Alta pendiente sin fila local (la borró la descarga): se repone.
 * - Alta que el servidor ya tiene (subió pero la respuesta se perdió): manda el servidor.
 * - Cambio parcial pendiente: se combina sobre la fila actual.
 * - Baja pendiente: se quita.
 */
export function superponerPendientes(
  actuales: Map<string, Fila | undefined>,
  p: PendientesTabla,
): { poner: Fila[]; quitar: string[] } {
  const poner = new Map<string, Fila>();
  for (const [id, alta] of p.altas) {
    const actual = actuales.get(id);
    const base = actual ?? alta;
    const cambio = p.cambios.get(id);
    if (!actual || cambio) poner.set(id, cambio ? { ...base, ...cambio } : base);
  }
  for (const [id, cambio] of p.cambios) {
    if (poner.has(id)) continue;
    const actual = actuales.get(id);
    if (actual) poner.set(id, { ...actual, ...cambio });
  }
  return { poner: [...poner.values()], quitar: [...p.bajas] };
}

/**
 * Vuelve a poner en `localTable` lo pendiente de subir de `tabla`. Llamar DENTRO de una
 * transacción Dexie 'rw' que incluya `localTable` y `offlineDb.syncQueue`.
 */
export async function reaplicarPendientesEnTabla(localTable: Table, tabla: string): Promise<number> {
  const items = await offlineDb.syncQueue.toArray();
  if (items.length === 0) return 0;
  const p = pendientesDeTabla(items, tabla);
  const ids = [...new Set([...p.altas.keys(), ...p.cambios.keys()])];
  if (ids.length === 0 && p.bajas.size === 0) return 0;
  const filas = ids.length > 0 ? await localTable.bulkGet(ids) : [];
  const actuales = new Map<string, Fila | undefined>();
  ids.forEach((id, i) => actuales.set(id, (filas[i] ?? undefined) as Fila | undefined));
  const { poner, quitar } = superponerPendientes(actuales, p);
  if (poner.length > 0) await localTable.bulkPut(poner);
  if (quitar.length > 0) await localTable.bulkDelete(quitar);
  return poner.length + quitar.length;
}
