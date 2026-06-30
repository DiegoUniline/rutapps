import { offlineDb, type SyncQueueItem, getOfflineTable } from './offlineDb';
import { supabase } from './supabase';
import { markAsSynced } from './syncVerify';
import { isDataSaverEnabled } from './dataSaver';
import { backupSyncQueueToStorage, clearStorageBackup } from './offlineBackup';
import { hasRealConnection } from './connectivity';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
let activeProcessPromise: Promise<{ success: number; failed: number }> | null = null;

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
  operation: 'insert' | 'update' | 'delete',
  data: any,
  keyField: string = 'id',
) {
  const keyValue = data[keyField];

  // 1. Update local IndexedDB immediately
  const localTable = getOfflineTable(table);
  if (localTable) {
    if (operation === 'delete') {
      await localTable.delete(keyValue);
    } else {
      await localTable.put(data);
    }
  }

  // 2. Deduplicate: if same table+key+operation pending, replace data
  const existing = await offlineDb.syncQueue
    .where('table').equals(table)
    .filter(item => item.keyValue === keyValue && item.operation === operation)
    .first();

  if (existing && existing.id) {
    await offlineDb.syncQueue.update(existing.id, { data, createdAt: Date.now(), retries: 0 });
  } else {
    await offlineDb.syncQueue.add({
      table,
      operation,
      data,
      keyField,
      keyValue,
      createdAt: Date.now(),
      retries: 0,
    });
  }

  // 3. Try to sync immediately if online AND auto-sync is enabled AND data saver is off
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

  activeProcessPromise = processSyncQueueInternal().finally(() => {
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
  devolucion_lineas: 25, cobro_aplicaciones: 25,
  // Inventory side-effects last
  stock_almacen: 30, movimientos_inventario: 30,
};

function priorityOf(table: string): number {
  return TABLE_PRIORITY[table] ?? 50;
}

async function processSyncQueueInternal(): Promise<{ success: number; failed: number }> {
  // Backup before processing as safety net
  await backupSyncQueueToStorage();

  let items = await offlineDb.syncQueue.orderBy('createdAt').toArray();
  // Topological order: parents before children, createdAt as tiebreaker.
  items.sort((a, b) => {
    const pa = priorityOf(a.table);
    const pb = priorityOf(b.table);
    if (pa !== pb) return pa - pb;
    return a.createdAt - b.createdAt;
  });

  let success = 0;
  let failed = 0;
  // Tables for which a parent insert just succeeded in THIS pass — children
  // deferred earlier in the pass should be retried at the end.
  const parentSyncedThisPass = new Set<string>();
  const deferredIds: number[] = [];

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
      parentSyncedThisPass.add(item.table);
      success++;
      return { handled: true };
    } catch (err: any) {
      console.error(`Sync failed for ${item.table}/${item.operation}:`, err);

      const isConflict = err?.code === '23505';
      const isFkMissing = err?.code === '23503';
      const isNotFound = err?.code === '42P01' || err?.code === 'PGRST116';
      const CHILD_TABLES_RLS_DEFER = ['devoluciones', 'devolucion_lineas', 'venta_lineas', 'entrega_lineas', 'cobro_aplicaciones', 'compra_lineas', 'cotizacion_lineas', 'merma_lineas', 'traspaso_lineas', 'carga_lineas', 'descarga_ruta_lineas', 'cfdi_lineas', 'movimientos_inventario'];
      const isRlsViolation = err?.code === '42501' && CHILD_TABLES_RLS_DEFER.includes(item.table);
      const isDevolucionEnumIssue = (err?.code === '22P02' || err?.code === '23514') && (item.table === 'devoluciones' || item.table === 'devolucion_lineas');

      const newRetries = (item.retries ?? 0) + 1;
      const errorMsg = (err?.message || err?.error_description || String(err)).slice(0, 300);

      if (isConflict && item.operation === 'insert') {
        console.warn(`Conflict on insert ${item.table}/${item.keyValue}, will retry as upsert`);
      }

      if (isFkMissing || isRlsViolation || isDevolucionEnumIssue) {
        await offlineDb.syncQueue.update(item.id!, {
          retries: newRetries,
          createdAt: Date.now() + 1000,
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
        if (item.id) deferredIds.push(item.id);
      } else if (isNotFound || newRetries >= MAX_RETRIES) {
        console.error(`Max retries or not found for item ${item.id}, marking as dead letter`);
        await offlineDb.syncQueue.update(item.id!, {
          retries: MAX_RETRIES + 1,
          createdAt: Date.now(),
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
      } else {
        await offlineDb.syncQueue.update(item.id!, {
          retries: newRetries,
          createdAt: Date.now(),
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
      }
      failed++;
      return { handled: true };
    }
  };

  for (const item of items) {
    await runItem(item);
  }

  // Same-pass second sweep: any item deferred because its parent wasn't synced
  // yet gets one more chance now that parents may have come through.
  if (deferredIds.length > 0 && parentSyncedThisPass.size > 0) {
    const fresh = await offlineDb.syncQueue
      .where('id').anyOf(deferredIds).toArray();
    fresh.sort((a, b) => priorityOf(a.table) - priorityOf(b.table) || a.createdAt - b.createdAt);
    for (const item of fresh) {
      // Bypass backoff for this immediate second attempt.
      await runItem({ ...item, retries: 0 } as SyncQueueItem).catch(() => {});
    }
  }

  // Clear backup if everything succeeded
  if (failed === 0 && success > 0) {
    clearStorageBackup();
  }

  return { success, failed };
}


async function processItem(item: SyncQueueItem) {
  const { table, operation, data, keyField, keyValue } = item;

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

