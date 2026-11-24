import { offlineDb, type SyncQueueItem, getOfflineTable } from './offlineDb';
import { supabase } from './supabase';
import { markAsSynced } from './syncVerify';
import { isDataSaverEnabled } from './dataSaver';
import { backupSyncQueueToStorage } from './offlineBackup';
import { hasRealConnection } from './connectivity';
import { classifySyncError } from './syncErrorClassify';
import { mergeLocalRow } from './localRowMerge';
import { EVENTO_DATOS_LOCALES } from './refresco/eventos';
import { esCantidadDevolucionValida, sanearDevolucionLinea } from './devolucionGuardado';
import { asegurarSesionParaSubir, type EstadoSesion } from './syncSesion';
import { copiasLocalesDeRpc, COLA_REGISTRAR_VENTA_RUTA } from './pendientesLocales';
import { captureAppError } from './observability';
import { programarSaludDispositivo, telemetriaHabilitada } from './telemetriaRuntime';
import type { EstadoSaludDispositivo } from './saludDispositivo';

const MAX_RETRIES = 5;
/** Un fallido (dead-letter) se reintenta solo cada 30 min (o con «Reintentar»). */
export const DEAD_LETTER_RETRY_MS = 30 * 60_000;
const BASE_DELAY_MS = 1000;
let activeProcessPromise: Promise<SyncPassResult> | null = null;

export interface SyncPassResult {
  success: number;
  failed: number;
  /** La sesión venció y no se pudo renovar: no se subió nada y la cola quedó intacta. */
  authRequired?: boolean;
}

/**
 * Evento de ventana con el estado visible de la sincronización (para el vendedor, no solo
 * la consola). `detail`: { tipo: 'sesion_vencida' | 'fallido' | 'error', mensaje, tabla? }.
 */
export const EVENTO_SYNC_ESTADO = 'uniline:sync-estado';
export type DetalleSyncEstado = {
  tipo: 'sesion_vencida' | 'fallido' | 'error';
  mensaje: string;
  tabla?: string;
};

function avisarEstado(detalle: DetalleSyncEstado) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DetalleSyncEstado>(EVENTO_SYNC_ESTADO, { detail: detalle }));
}

/** Error de una subida automática (en segundo plano): se avisa y se reporta, nunca se calla. */
function reportarErrorDeFondo(err: unknown) {
  captureAppError(err, { origen: 'syncQueue.autoSync' });
  avisarEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo sincronizar' });
}

/** Deja el respaldo de localStorage igual que la cola (sin lo ya subido ni lo descartado). */
async function respaldarCola() {
  try {
    await backupSyncQueueToStorage();
  } catch (err) {
    captureAppError(err, { origen: 'syncQueue.respaldarCola' });
  }
}

type QueuedOperation = {
  /** Para 'rpc', `table` es `rpc:<función>` y `data` sus argumentos. */
  table: string;
  operation: 'insert' | 'update' | 'delete' | 'insert-many' | 'rpc';
  data: any;
  keyField?: string;
};

/**
 * Valor de la clave de una operación. Admite ruta con punto para RPC cuyos argumentos
 * anidan el id (p. ej. `p_devolucion.id` en `rpc:registrar_devolucion`).
 */
export function valorClave(data: any, keyField: string): any {
  if (!keyField.includes('.')) return data?.[keyField];
  return keyField.split('.').reduce((v, k) => (v == null ? undefined : v[k]), data);
}

// Exponential backoff delay
function getRetryDelay(retries: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retries), 30000); // max 30s
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Add an operation to the sync queue and update local DB
export async function queueOperation(
  table: string,
  operation: 'insert' | 'update' | 'delete' | 'insert-many' | 'rpc',
  data: any,
  keyField: string = 'id',
) {
  await queueOperations([{ table, operation, data, keyField }]);
}

/**
 * Encola un lote de filas para subir en UNA sola petición (upsert masivo).
 * Ideal para las líneas de una venta grande: 50 líneas = 1 subida, no 50.
 * @param groupKey columna que agrupa el lote (p.ej. 'venta_id') para dedupe.
 */
export async function queueInsertMany(table: string, rows: any[], groupKey = 'id') {
  if (!rows || rows.length === 0) return;
  await queueOperations([{ table, operation: 'insert-many', data: rows, keyField: groupKey }]);
}

// Encola varias operaciones como una sola unidad local. Se usa para documentos
// que no pueden separarse (ej. cobro + aplicaciones al folio): si falla una
// escritura IndexedDB, no queda el padre sin sus hijos en la cola.
export async function queueOperations(operations: QueuedOperation[]) {
  if (operations.length === 0) return;

  const txTables = new Set<any>([offlineDb.syncQueue]);
  for (const op of operations) {
    const localTable = getOfflineTable(op.table);
    if (localTable) txTables.add(localTable);
    // Una RPC (p. ej. la venta de ruta completa) deja su copia local en varias tablas, en la
    // MISMA transacción que la cola: o queda todo (cola + copia) o nada.
    if (op.operation === 'rpc') {
      for (const copia of copiasLocalesDeRpc(op.table, op.data)) {
        const t = getOfflineTable(copia.tabla);
        if (t) txTables.add(t);
      }
    }
  }

  await offlineDb.transaction('rw', Array.from(txTables), async () => {
    for (const op of operations) {
      const keyField = op.keyField ?? 'id';
      const isMany = op.operation === 'insert-many';
      // Para lotes, la clave de dedupe es el grupo (p.ej. venta_id) tomado de la
      // primera fila; así re-guardar la misma venta reemplaza su lote de líneas.
      const keyValue = isMany ? (Array.isArray(op.data) && op.data.length ? op.data[0]?.[keyField] : undefined) : valorClave(op.data, keyField);
      const localTable = getOfflineTable(op.table);

      if (op.operation === 'rpc') {
        for (const copia of copiasLocalesDeRpc(op.table, op.data)) {
          const t = getOfflineTable(copia.tabla);
          if (t && copia.filas.length > 0) await t.bulkPut(copia.filas);
        }
      }

      if (localTable) {
        if (op.operation === 'delete') await localTable.delete(keyValue);
        else if (isMany) await localTable.bulkPut(op.data);
        else if (op.operation === 'update') {
          // Un update parcial no debe reemplazar la fila completa en IndexedDB.
          // Eso borraba localmente total, folio, saldo y demás campos hasta la
          // siguiente descarga. Se refleja como merge igual que en PostgreSQL.
          const current = await localTable.get(keyValue);
          await localTable.put(mergeLocalRow(current, op.data));
        } else await localTable.put(op.data);
      }

      const existing = await offlineDb.syncQueue
        .where('table').equals(op.table)
        .filter(item => item.keyValue === keyValue && item.operation === op.operation)
        .first();
      if (existing && existing.id) {
        // Dos cambios parciales a la misma fila se COMBINAN (antes el segundo borraba al
        // primero: p. ej. {cliente_id} y luego {status}). Altas/RPC/lotes: manda lo último.
        const data = op.operation === 'update'
          ? { ...(existing.data ?? {}), ...(op.data ?? {}) }
          : op.data;
        await offlineDb.syncQueue.update(existing.id, {
          data,
          createdAt: Date.now(),
          retries: 0,
          rev: (existing.rev ?? 0) + 1,
        });
      } else {
        await offlineDb.syncQueue.add({
          table: op.table,
          operation: op.operation,
          data: op.data,
          keyField,
          keyValue,
          createdAt: Date.now(),
          retries: 0,
          rev: 0,
        });
      }
    }
  });

  // El respaldo de localStorage refleja la cola al momento (no cada 30 s).
  await respaldarCola();

  // Las pantallas que leen estas tablas de IndexedDB (useOfflineQuery) re-leen la copia local
  // al instante: lo recién guardado se ve sin esperar a sincronizar (útil sin señal).
  if (typeof window !== 'undefined') {
    const tablas = operations.flatMap(o => [o.table, ...(o.operation === 'rpc' ? copiasLocalesDeRpc(o.table, o.data).map(c => c.tabla) : [])]);
    window.dispatchEvent(new CustomEvent(EVENTO_DATOS_LOCALES, { detail: { tablas: [...new Set(tablas)] } }));
  }

  // Try to sync immediately if online AND auto-sync is enabled AND data saver is off
  const autoSync = localStorage.getItem('uniline_auto_sync');
  const autoSyncEnabled = autoSync === null ? true : autoSync === 'true';
  if (autoSyncEnabled && !isDataSaverEnabled()) {
    hasRealConnection().then(online => {
      if (online) processSyncQueue().catch(reportarErrorDeFondo);
    }).catch(reportarErrorDeFondo);
  }
}

// Process all pending items in the sync queue
export async function processSyncQueue(): Promise<SyncPassResult> {
  if (activeProcessPromise) return activeProcessPromise;

  // Candado ENTRE PESTAÑAS: si el vendedor tiene 2 pestañas/instancias abiertas,
  // solo una procesa la cola a la vez (evita trabajo doble y carreras). Los datos
  // no se duplicarían igual (upsert idempotente), pero esto lo hace limpio.
  const run = () => processSyncQueueInternal();
  activeProcessPromise = (async () => {
    const locks = (navigator as any)?.locks;
    if (locks?.request) {
      return await locks.request('uniline-sync-queue', { mode: 'exclusive' }, run);
    }
    return await run();
  })().finally(() => {
    activeProcessPromise = null;
    // D-064: estado de la cola al servidor (freno 1/min; nunca lanza).
    void reportarSaludDispositivo();
  });
  return activeProcessPromise;
}

// ── D-064 · Salud del dispositivo ────────────────────────────────────────────────────
export const LS_ULTIMO_SYNC_OK = 'uniline_ultimo_sync_ok';

/** La cola quedó vacía tras una pasada (o ya lo estaba): última sincronización correcta. */
async function marcarSyncOkSiColaVacia() {
  try {
    if ((await offlineDb.syncQueue.count()) === 0) localStorage.setItem(LS_ULTIMO_SYNC_OK, String(Date.now()));
  } catch (err) {
    console.warn('[salud] no se pudo guardar la última sincronización correcta', err);
  }
}

/** Pendientes, fallidas (dead-letter), último error y última sincronización correcta. */
export async function estadoSaludCola(): Promise<EstadoSaludDispositivo> {
  const items = await offlineDb.syncQueue.toArray();
  let pendientes = 0;
  let fallidas = 0;
  let ultimo: SyncQueueItem | null = null;
  for (const it of items) {
    if ((it.retries ?? 0) > MAX_RETRIES) fallidas++;
    else pendientes++;
    if (it.lastError && (!ultimo || (it.lastAttemptAt ?? 0) > (ultimo.lastAttemptAt ?? 0))) ultimo = it;
  }
  let ultimoSyncOk: number | null = null;
  try {
    const v = Number(localStorage.getItem(LS_ULTIMO_SYNC_OK));
    ultimoSyncOk = Number.isFinite(v) && v > 0 ? v : null;
  } catch (err) {
    console.warn('[salud] no se pudo leer la última sincronización correcta', err);
  }
  return {
    pendientes,
    fallidas,
    ultimoError: ultimo ? `${ultimo.table}: ${ultimo.lastError}` : null,
    ultimoSyncOk,
  };
}

/** Reporta la salud de la cola de este dispositivo (solo producción). Nunca lanza. */
export async function reportarSaludDispositivo(forzar = false): Promise<void> {
  if (!telemetriaHabilitada()) return;
  try {
    await programarSaludDispositivo(await estadoSaludCola(), forzar);
  } catch (err) {
    console.warn('[salud] no se pudo reportar la salud del dispositivo', err);
  }
}

// Parent tables go before their children — guarantees FK/RLS-safe order
// regardless of original enqueue order. Lower number = processed earlier.
const TABLE_PRIORITY: Record<string, number> = {
  // Independent / parent entities
  empresas: 0, profiles: 0, almacenes: 0, clientes: 0, proveedores: 0,
  productos: 5, unidades: 5, marcas: 5, listas: 5, tarifas: 5, lista_precios: 5, zonas: 5,
  // Top-level transactions (parents)
  cargas: 10, ventas: 10, compras: 10, traspasos: 10, cotizaciones: 10,
  conteos_fisicos: 10, auditorias: 10, mermas: 10, descarga_ruta: 10, cfdis: 10,
  solicitudes_traspaso: 10,
  // Devoluciones depends on ventas → must come after
  devoluciones: 15,
  // Cobros depends on ventas (via aplicaciones)
  cobros: 15,
  entregas: 15,
  // Children / line tables
  venta_lineas: 20, carga_lineas: 20, compra_lineas: 20, cotizacion_lineas: 20,
  traspaso_lineas: 20, conteo_lineas: 20, auditoria_lineas: 20, merma_lineas: 20,
  descarga_ruta_lineas: 20, cfdi_lineas: 20, entrega_lineas: 20,
  solicitud_traspaso_lineas: 20,
  devolucion_lineas: 25, cobro_aplicaciones: 25, promocion_aplicada: 25,
  // Lotes de línea: después de venta_lineas (FK a venta_linea_id)
  venta_linea_lotes: 25, merma_linea_lotes: 25,
  // Inventory side-effects last
  stock_almacen: 30, movimientos_inventario: 30,
  // Edición completa de una venta ya en el servidor: después de cobros, antes de aplicaciones.
  'rpc:editar_venta': 22,
  // Devolución completa (D-049): después de la venta, sus renglones, cobros y aplicaciones
  // (la nota aplicada a la venta se topa al saldo que deja el pago de contado).
  'rpc:registrar_devolucion': 26,
  // Venta de ruta completa (bandera ruta_venta_rpc): después de clientes/cargas creados sin
  // señal (padres), antes de la devolución de esa venta y de su visita.
  [COLA_REGISTRAR_VENTA_RUTA]: 12,
};

function priorityOf(table: string): number {
  return TABLE_PRIORITY[table] ?? 50;
}

async function processSyncQueueInternal(): Promise<SyncPassResult> {
  // Backup before processing as safety net
  await respaldarCola();

  // Sesión vencida tras horas sin red: renovarla ANTES de subir. Si no se puede, no se
  // toca la cola (no se gastan intentos) y se pide iniciar sesión.
  if ((await offlineDb.syncQueue.count()) === 0) {
    await marcarSyncOkSiColaVacia();
    return { success: 0, failed: 0 };
  }
  const sesion = await asegurarSesion();
  if (sesion === 'vencida') return { success: 0, failed: 0, authRequired: true };
  if (sesion === 'sin_red') return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;
  let detenerPasada = false;
  let authRequired = false;

  const runItem = async (item: SyncQueueItem, reintentoTrasSesion = false): Promise<{ handled: boolean }> => {
    // Skip items that have exceeded max retries recently (backoff)
    if (item.retries > 0) {
      // Fallido (dead-letter): ya no se reintenta en cada pasada (cada ~30 s golpeaba al
      // servidor con el mismo error); se reintenta solo cada 30 min o con «Reintentar».
      const delay = item.retries > MAX_RETRIES ? DEAD_LETTER_RETRY_MS : getRetryDelay(item.retries);
      const elapsed = Date.now() - item.createdAt;
      if (elapsed < delay) return { handled: false };
    }

    try {
      await processItem(item);
      // Si mientras subía se volvió a encolar la misma fila (rev distinta), NO se borra:
      // queda para la siguiente vuelta con el cambio combinado.
      const borrado = await offlineDb.transaction('rw', offlineDb.syncQueue, async () => {
        const actual = await offlineDb.syncQueue.get(item.id!);
        if (actual && (actual.rev ?? 0) !== (item.rev ?? 0)) return false;
        await offlineDb.syncQueue.delete(item.id!);
        return true;
      });
      if (borrado) await respaldarCola();
      if (item.keyValue) markAsSynced(item.table, item.keyValue);
      success++;
      return { handled: true };
    } catch (err: any) {
      const newRetries = (item.retries ?? 0) + 1;
      const errorMsg = (err?.message || err?.error_description || String(err)).slice(0, 300);

      // Decisión centralizada en una función PURA (testeada en syncQueueClassify.test.ts).
      const action = classifySyncError({ err, table: item.table, newRetries, maxRetries: MAX_RETRIES });

      if (action === 'auth') {
        // El token venció a la mitad: renovar y reintentar UNA vez este elemento. Si no se
        // puede, se detiene la pasada SIN gastar intentos (la cola queda intacta).
        if (!reintentoTrasSesion) {
          const estado = await asegurarSesion(true);
          if (estado === 'ok') return runItem(item, true);
          if (estado === 'vencida') authRequired = true;
        } else {
          authRequired = true;
          avisarSesionVencida();
        }
        await offlineDb.syncQueue.update(item.id!, { lastError: errorMsg, lastAttemptAt: Date.now() });
        detenerPasada = true;
        return { handled: false };
      }

      if (action === 'transient') {
        // Falla de RED: reintentar con backoff acotado, SIN gastar el presupuesto
        // de dead-letter. No cuenta como "failed": una venta/cobro nunca se pierde
        // por mala señal.
        await offlineDb.syncQueue.update(item.id!, {
          retries: Math.min(newRetries, MAX_RETRIES),
          createdAt: Date.now(),
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
        return { handled: true };
      }

      if (action === 'defer') {
        // El padre aún no sincroniza: reintentar en el segundo barrido de la pasada.
        await offlineDb.syncQueue.update(item.id!, {
          retries: newRetries,
          createdAt: Date.now() + 1000,
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
        return { handled: true }; // aún no cuenta como "failed"
      }

      if (action === 'dead-letter') {
        await offlineDb.syncQueue.update(item.id!, {
          retries: MAX_RETRIES + 1,
          createdAt: Date.now(),
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
        // Visible para el vendedor (aviso + Pendientes) y reportado a monitoreo.
        captureAppError(err, { origen: 'syncQueue.deadLetter', tabla: item.table, operacion: item.operation });
        avisarEstado({ tipo: 'fallido', mensaje: errorMsg, tabla: item.table });
        failed++;
        return { handled: true };
      }

      // 'retry': error de dato desconocido, aún con reintentos disponibles.
      await offlineDb.syncQueue.update(item.id!, {
        retries: newRetries,
        createdAt: Date.now(),
        lastError: errorMsg,
        lastAttemptAt: Date.now(),
      });
      failed++;
      return { handled: true };
    }
  };

  // Drain in fresh rounds. A mobile sale enqueues venta → líneas → cobro →
  // aplicaciones sequentially, and each enqueue can wake auto-sync. If we keep a
  // single initial snapshot, a cobro may upload before its application exists in
  // that snapshot, leaving a temporary orphan until another sync event runs. Fresh
  // rounds pick up items added during this pass and keep parent→child ordering.
  for (let round = 0; round < 25 && !detenerPasada; round++) {
    const items = await offlineDb.syncQueue.orderBy('createdAt').toArray();
    if (items.length === 0) break;

    items.sort((a, b) => {
      const pa = priorityOf(a.table);
      const pb = priorityOf(b.table);
      if (pa !== pb) return pa - pb;
      return a.createdAt - b.createdAt;
    });

    let handledThisRound = 0;
    for (const item of items) {
      if (detenerPasada) break;
      const result = await runItem(item);
      if (result?.handled) handledThisRound++;
    }
    if (handledThisRound === 0) break;
  }

  // El respaldo queda igual que la cola: vacío si ya no hay nada pendiente.
  await respaldarCola();
  if (!authRequired) await marcarSyncOkSiColaVacia();

  return authRequired ? { success, failed, authRequired } : { success, failed };
}

let ultimoAvisoSesion = 0;
function avisarSesionVencida() {
  // Un aviso por minuto como máximo (cada pasada automática lo detectaría de nuevo).
  if (Date.now() - ultimoAvisoSesion < 60_000) return;
  ultimoAvisoSesion = Date.now();
  avisarEstado({
    tipo: 'sesion_vencida',
    mensaje: 'Tu sesión venció. Inicia sesión para subir lo pendiente; no se perdió nada.',
  });
}

async function asegurarSesion(forzar = false): Promise<EstadoSesion> {
  let estado: EstadoSesion;
  try {
    estado = await asegurarSesionParaSubir(supabase.auth, { forzar });
  } catch (err) {
    // Falla inesperada al leer/renovar la sesión: no se sube nada en esta pasada.
    captureAppError(err, { origen: 'syncQueue.asegurarSesion' });
    return 'sin_red';
  }
  if (estado === 'vencida') avisarSesionVencida();
  return estado;
}


// Limpia una fila antes de subir: quita campos locales y objetos join anidados.
function sanitizeRow(table: string, row: any): any {
  const clean = { ...row };
  delete clean._offline;
  delete clean._localId;
  const KNOWN_JOINS = ['clientes', 'vendedores', 'productos', 'unidades', 'tasas_iva', 'tasas_ieps', 'zonas', 'cobradores', 'tarifas', 'listas', 'almacenes', 'marcas'];
  for (const key of KNOWN_JOINS) {
    if (clean[key] && typeof clean[key] === 'object' && !Array.isArray(clean[key])) delete clean[key];
  }
  if (table === 'devoluciones') {
    const validTipos = ['almacen', 'tienda'];
    if (!validTipos.includes(clean.tipo)) clean.tipo = clean.cliente_id ? 'tienda' : 'almacen';
  }
  if (table === 'devolucion_lineas') return sanearDevolucionLinea(clean);
  return clean;
}

async function processItem(item: SyncQueueItem) {
  const { table, operation, data, keyField, keyValue } = item;

  // Lote: sube TODAS las filas en una sola petición (upsert masivo).
  if (operation === 'insert-many') {
    const rows = (Array.isArray(data) ? data : []).map(r => sanitizeRow(table, r));
    if (rows.length === 0) return;
    const { data: returned, error } = await (supabase.from as any)(table).upsert(rows).select();
    if (error) throw error;
    const localTable = getOfflineTable(table);
    if (localTable && returned && returned.length > 0) await localTable.bulkPut(returned);
    return;
  }

  // Operación de servidor completa (una sola transacción en la BD).
  if (operation === 'rpc') {
    const fn = table.replace(/^rpc:/, '');
    const { data: resultado, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(fn, data);
    if (error) throw error;
    // Venta de ruta completa: un abono a OTRA nota cuyo saldo cambió en el servidor no se
    // aplica (la venta sí se guarda). Se avisa al vendedor y se reporta.
    const rechazadas = (resultado as { aplicaciones_rechazadas?: unknown[] } | null)?.aplicaciones_rechazadas;
    if (Array.isArray(rechazadas) && rechazadas.length > 0) {
      captureAppError(new Error('Abonos no aplicados al registrar venta de ruta'), { origen: 'syncQueue.rpc', fn, rechazadas });
      avisarEstado({
        tipo: 'error',
        mensaje: `${rechazadas.length} abono${rechazadas.length === 1 ? '' : 's'} a otras notas no se aplicó: su saldo cambió en el servidor. La venta sí se guardó; revisa la cobranza del cliente.`,
        tabla: table,
      });
    }
    return;
  }

  // Strip any local-only fields
  const cleanData = { ...data };
  delete cleanData._offline;
  delete cleanData._localId;
  // Strip joined/nested objects that aren't real columns
  const KNOWN_JOINS = ['clientes', 'vendedores', 'productos', 'unidades', 'tasas_iva', 'tasas_ieps', 'zonas', 'cobradores', 'tarifas', 'listas', 'almacenes', 'marcas'];
  for (const key of KNOWN_JOINS) {
    if (cleanData[key] && typeof cleanData[key] === 'object' && !Array.isArray(cleanData[key])) {
      delete cleanData[key];
    }
  }

  // Sanitize legacy/garbage enum values that can lock items in the queue forever.
  // (e.g. older PWA builds queued devoluciones with tipo: "—" which fails enum check
  // and then orphans the child devolucion_lineas via RLS until the parent exists.)
  if (table === 'devoluciones') {
    const validTipos = ['almacen', 'tienda'];
    if (!validTipos.includes(cleanData.tipo)) {
      cleanData.tipo = cleanData.cliente_id ? 'tienda' : 'almacen';
    }
  }
  // H1: versiones anteriores encolaban renglones con accion = null (NOT NULL en la BD)
  // → nunca subían. Se reparan al reintentar con el default sin efecto en dinero.
  if (table === 'devolucion_lineas' && operation === 'insert') {
    Object.assign(cleanData, sanearDevolucionLinea(cleanData));
  }


  switch (operation) {
    case 'insert': {
      // Alta IDEMPOTENTE por id: si ya existe (reenvío tras respuesta perdida, respaldo
      // restaurado), NO se pisa lo que el servidor cambió después (p. ej. una cancelación).
      const { data: returned, error } = await (supabase.from as any)(table)
        .upsert(cleanData, { onConflict: keyField || 'id', ignoreDuplicates: true })
        .select();
      if (error) throw error;
      // Update local cache with server-generated fields (folio, codigo, etc.)
      if (returned && returned.length > 0) {
        const localTable = getOfflineTable(table);
        if (localTable) {
          await localTable.put(returned[0]);
        }
      }
      break;
    }
    case 'update': {
      const { [keyField]: _, ...updateData } = cleanData;
      const { data: returned, error } = await (supabase.from as any)(table).update(updateData).eq(keyField, keyValue).select();
      if (error) throw error;
      if (returned && returned.length > 0) {
        const localTable = getOfflineTable(table);
        if (localTable) {
          await localTable.put(returned[0]);
        }
      } else {
        // 0 filas afectadas: el registro aún NO existe en el servidor (su INSERT
        // todavía no se sincronizó). NO dar el update por bueno — antes se borraba
        // como "éxito" y el cambio se perdía. Caso real: el saldo_pendiente = (total
        // − cobrado) de una venta quedaba sin aplicar, así que una venta YA PAGADA
        // aparecía debiendo el total. Se difiere y se reintenta tras su INSERT.
        const e: any = new Error(`Update sin fila destino en ${table} (${keyValue}); se reintenta tras su insert`);
        e.code = 'ROW_NOT_YET';
        throw e;
      }
      break;
    }
    case 'delete': {
      const { error } = await (supabase.from as any)(table).delete().eq(keyField, keyValue);
      if (error) throw error;
      break;
    }
  }
}

// Get count of pending sync items (exclude dead letters)
export async function getPendingCount(): Promise<number> {
  const items = await offlineDb.syncQueue.toArray();
  return items.filter(i => (i.retries ?? 0) <= MAX_RETRIES).length;
}

// Get dead letter count
export async function getDeadLetterCount(): Promise<number> {
  const items = await offlineDb.syncQueue.toArray();
  return items.filter(i => (i.retries ?? 0) > MAX_RETRIES).length;
}

// Retry dead letters (reset retries)
export async function retryDeadLetters(): Promise<number> {
  const items = await offlineDb.syncQueue.toArray();
  const deadLetters = items.filter(i => (i.retries ?? 0) > MAX_RETRIES);
  for (const dl of deadLetters) {
    await offlineDb.syncQueue.update(dl.id!, { retries: 0, createdAt: Date.now() });
  }
  return deadLetters.length;
}

// Resurrect dead letters for specific tables (used to recover items orphaned by
// older builds whose root cause has since been patched, e.g. devoluciones with
// invalid enum values that we now sanitize on each retry).
export async function resurrectDeadLetters(tables: string[]): Promise<number> {
  const items = await offlineDb.syncQueue.toArray();
  // Un renglón de devolución con cantidad <= 0 nunca va a subir (CHECK en la BD):
  // no se resucita para no reintentarlo para siempre en cada reconexión.
  const targets = items.filter(i => (i.retries ?? 0) > MAX_RETRIES && tables.includes(i.table)
    && !(i.table === 'devolucion_lineas' && !esCantidadDevolucionValida(i.data?.cantidad)));
  for (const it of targets) {
    await offlineDb.syncQueue.update(it.id!, { retries: 0, createdAt: Date.now() - 60_000 });
  }
  return targets.length;
}



// Clear entire sync queue (use with caution)
export async function clearSyncQueue() {
  await offlineDb.syncQueue.clear();
  await respaldarCola();
}

// ============================================================
// Pending queue inspection / management (Fase 1: Visibilidad)
// ============================================================

export type QueueItemStatus = 'pending' | 'retrying' | 'failed';

export interface PendingQueueItem extends SyncQueueItem {
  status: QueueItemStatus;
}

export const SYNC_QUEUE_MAX_RETRIES = MAX_RETRIES;

function computeStatus(item: SyncQueueItem): QueueItemStatus {
  const r = item.retries ?? 0;
  if (r > MAX_RETRIES) return 'failed';
  if (r > 0) return 'retrying';
  return 'pending';
}

// List all queued items (pending + retrying + failed) for UI
export async function listQueueItems(): Promise<PendingQueueItem[]> {
  const items = await offlineDb.syncQueue.orderBy('createdAt').toArray();
  return items.map(i => ({ ...i, status: computeStatus(i) }));
}

// Retry a single item (reset retries so the next sync processes it immediately)
export async function retryQueueItem(id: number): Promise<void> {
  await offlineDb.syncQueue.update(id, {
    retries: 0,
    createdAt: Date.now() - 60_000, // backdate so it runs at the top of the queue
    lastError: undefined,
  });
}

// Discard a single item from the queue WITHOUT touching the local cache
export async function discardQueueItem(id: number): Promise<void> {
  await offlineDb.syncQueue.delete(id);
  // Sin esto el respaldo de localStorage lo hacía reaparecer en el siguiente arranque.
  await respaldarCola();
}

export interface ContextoDescarte {
  motivo: string;
  empresaId: string;
  userId: string;
  dispositivo?: string | null;
}

/**
 * Descarta una operación pendiente DEJANDO REGISTRO en el servidor (tabla sync_descartes):
 * quién, cuándo, qué y por qué. El registro se encola (sube cuando haya red) en la misma
 * transacción local en que se quita la operación. El permiso se valida en la pantalla.
 */
export async function descartarConRegistro(id: number, ctx: ContextoDescarte): Promise<void> {
  const motivo = ctx.motivo.trim();
  if (motivo.length < 3) throw new Error('Escribe el motivo del descarte');
  if (!ctx.empresaId || !ctx.userId) throw new Error('Sin sesión: no se puede registrar el descarte');
  const registroId = crypto.randomUUID();
  await offlineDb.transaction('rw', offlineDb.syncQueue, async () => {
    const item = await offlineDb.syncQueue.get(id);
    if (!item) throw new Error('La operación ya no está pendiente');
    await offlineDb.syncQueue.delete(id);
    await offlineDb.syncQueue.add({
      table: 'sync_descartes',
      operation: 'insert',
      data: {
        id: registroId,
        empresa_id: ctx.empresaId,
        user_id: ctx.userId,
        tabla: item.table,
        operacion: item.operation,
        clave: item.keyValue != null ? String(item.keyValue) : null,
        datos: item.data ?? null,
        motivo,
        ultimo_error: item.lastError ?? null,
        reintentos: item.retries ?? 0,
        encolado_at: new Date(item.createdAt).toISOString(),
        descartado_at: new Date().toISOString(),
        dispositivo: ctx.dispositivo ?? null,
      },
      keyField: 'id',
      keyValue: registroId,
      createdAt: Date.now(),
      retries: 0,
      rev: 0,
    });
  });
  await respaldarCola();
}

// Retry every item (pending, retrying and failed) and trigger a sync pass
export async function retryAllQueueItems(): Promise<number> {
  const items = await offlineDb.syncQueue.toArray();
  for (const it of items) {
    await offlineDb.syncQueue.update(it.id!, {
      retries: 0,
      createdAt: Date.now() - 60_000,
      lastError: undefined,
    });
  }
  return items.length;
}
