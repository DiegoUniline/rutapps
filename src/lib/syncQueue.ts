import { offlineDb, type SyncQueueItem, getOfflineTable } from './offlineDb';
import { supabase } from './supabase';
import { markAsSynced } from './syncVerify';
import { isDataSaverEnabled } from './dataSaver';
import { backupSyncQueueToStorage, clearStorageBackup } from './offlineBackup';
import { hasRealConnection } from './connectivity';
import { classifySyncError } from './syncErrorClassify';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
let activeProcessPromise: Promise<{ success: number; failed: number }> | null = null;

type QueuedOperation = {
  table: string;
  operation: 'insert' | 'update' | 'delete' | 'insert-many';
  data: any;
  keyField?: string;
};

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
  operation: 'insert' | 'update' | 'delete' | 'insert-many',
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
  }

  await offlineDb.transaction('rw', Array.from(txTables), async () => {
    for (const op of operations) {
      const keyField = op.keyField ?? 'id';
      const isMany = op.operation === 'insert-many';
      // Para lotes, la clave de dedupe es el grupo (p.ej. venta_id) tomado de la
      // primera fila; así re-guardar la misma venta reemplaza su lote de líneas.
      const keyValue = isMany ? (Array.isArray(op.data) && op.data.length ? op.data[0]?.[keyField] : undefined) : op.data[keyField];
      const localTable = getOfflineTable(op.table);

      if (localTable) {
        if (op.operation === 'delete') await localTable.delete(keyValue);
        else if (isMany) await localTable.bulkPut(op.data);
        else await localTable.put(op.data);
      }

      const existing = await offlineDb.syncQueue
        .where('table').equals(op.table)
        .filter(item => item.keyValue === keyValue && item.operation === op.operation)
        .first();
      if (existing && existing.id) {
        await offlineDb.syncQueue.update(existing.id, { data: op.data, createdAt: Date.now(), retries: 0 });
      } else {
        await offlineDb.syncQueue.add({
          table: op.table,
          operation: op.operation,
          data: op.data,
          keyField,
          keyValue,
          createdAt: Date.now(),
          retries: 0,
        });
      }
    }
  });

  // Try to sync immediately if online AND auto-sync is enabled AND data saver is off
  const autoSync = localStorage.getItem('uniline_auto_sync');
  const autoSyncEnabled = autoSync === null ? true : autoSync === 'true';
  if (autoSyncEnabled && !isDataSaverEnabled()) {
    hasRealConnection().then(online => {
      if (online) processSyncQueue().catch(console.warn);
    }).catch(console.warn);
  }
}

// Process all pending items in the sync queue
export async function processSyncQueue(): Promise<{ success: number; failed: number }> {
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
  });
  return activeProcessPromise;
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
  // Devoluciones depends on ventas → must come after
  devoluciones: 15,
  // Cobros depends on ventas (via aplicaciones)
  cobros: 15,
  entregas: 15,
  // Children / line tables
  venta_lineas: 20, carga_lineas: 20, compra_lineas: 20, cotizacion_lineas: 20,
  traspaso_lineas: 20, conteo_lineas: 20, auditoria_lineas: 20, merma_lineas: 20,
  descarga_ruta_lineas: 20, cfdi_lineas: 20, entrega_lineas: 20,
  devolucion_lineas: 25, cobro_aplicaciones: 25, promocion_aplicada: 25,
  // Lotes de línea: después de venta_lineas (FK a venta_linea_id)
  venta_linea_lotes: 25, merma_linea_lotes: 25,
  // Inventory side-effects last
  stock_almacen: 30, movimientos_inventario: 30,
};

function priorityOf(table: string): number {
  return TABLE_PRIORITY[table] ?? 50;
}

async function processSyncQueueInternal(): Promise<{ success: number; failed: number }> {
  // Backup before processing as safety net
  await backupSyncQueueToStorage();

  let success = 0;
  let failed = 0;

  const runItem = async (item: SyncQueueItem) => {
    // Skip items that have exceeded max retries recently (backoff)
    if (item.retries > 0) {
      const delay = getRetryDelay(item.retries);
      const elapsed = Date.now() - item.createdAt;
      if (elapsed < delay) return { handled: false };
    }

    try {
      await processItem(item);
      await offlineDb.syncQueue.delete(item.id!);
      if (item.keyValue) markAsSynced(item.table, item.keyValue);
      success++;
      return { handled: true };
    } catch (err: any) {
      console.error(`Sync failed for ${item.table}/${item.operation}:`, err);

      const isConflict = err?.code === '23505';
      const newRetries = (item.retries ?? 0) + 1;
      const errorMsg = (err?.message || err?.error_description || String(err)).slice(0, 300);

      if (isConflict && item.operation === 'insert') {
        console.warn(`Conflict on insert ${item.table}/${item.keyValue}, will retry as upsert`);
      }

      // Decisión centralizada en una función PURA (testeada en syncQueueClassify.test.ts).
      const action = classifySyncError({ err, table: item.table, newRetries, maxRetries: MAX_RETRIES });

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
        console.error(`Item ${item.table}/${item.id} → dead-letter: ${errorMsg}`);
        await offlineDb.syncQueue.update(item.id!, {
          retries: MAX_RETRIES + 1,
          createdAt: Date.now(),
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
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
  for (let round = 0; round < 25; round++) {
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
      const result = await runItem(item);
      if (result?.handled) handledThisRound++;
    }
    if (handledThisRound === 0) break;
  }

  // Limpiar el respaldo SOLO cuando la cola quedó completamente vacía (nada
  // pendiente ni diferido). Antes se limpiaba con failed===0 aunque quedaran
  // ítems diferidos → se perdía la red de seguridad con cosas aún sin subir.
  const remaining = await offlineDb.syncQueue.count();
  if (remaining === 0) {
    clearStorageBackup();
  }

  return { success, failed };
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


  switch (operation) {
    case 'insert': {
      const { data: returned, error } = await (supabase.from as any)(table).upsert(cleanData).select();
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
  const targets = items.filter(i => (i.retries ?? 0) > MAX_RETRIES && tables.includes(i.table));
  for (const it of targets) {
    await offlineDb.syncQueue.update(it.id!, { retries: 0, createdAt: Date.now() - 60_000 });
  }
  return targets.length;
}



// Clear entire sync queue (use with caution)
export async function clearSyncQueue() {
  await offlineDb.syncQueue.clear();
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

