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

async function processSyncQueueInternal(): Promise<{ success: number; failed: number }> {
  // Backup before processing as safety net
  await backupSyncQueueToStorage();
  
  const items = await offlineDb.syncQueue.orderBy('createdAt').toArray();
  let success = 0;
  let failed = 0;

  for (const item of items) {
    // Skip items that have exceeded max retries recently (backoff)
    if (item.retries > 0) {
      const delay = getRetryDelay(item.retries);
      const elapsed = Date.now() - item.createdAt;
      if (elapsed < delay) continue; // Not enough time passed for retry
    }

    try {
      await processItem(item);
      await offlineDb.syncQueue.delete(item.id!);
      // Mark for verification
      if (item.keyValue) {
        markAsSynced(item.table, item.keyValue);
      }
      success++;
    } catch (err: any) {
      console.error(`Sync failed for ${item.table}/${item.operation}:`, err);

      // Handle specific conflict errors
      const isConflict = err?.code === '23505'; // unique_violation
      const isFkMissing = err?.code === '23503'; // foreign_key_violation — parent not synced yet
      const isNotFound = err?.code === '42P01' || err?.code === 'PGRST116';
      // RLS violation: usually the parent row isn't visible yet (its insert is still pending
      // or failed earlier in this pass). Treat as deferrable so the child waits, instead of
      // burning retries and getting stuck as "pending por sincronizar".
      const CHILD_TABLES_RLS_DEFER = ['devoluciones', 'devolucion_lineas', 'venta_lineas', 'entrega_lineas', 'cobro_aplicaciones', 'compra_lineas', 'cotizacion_lineas', 'merma_lineas', 'traspaso_lineas', 'carga_lineas', 'descarga_ruta_lineas', 'cfdi_lineas', 'movimientos_inventario'];
      const isRlsViolation = err?.code === '42501' && CHILD_TABLES_RLS_DEFER.includes(item.table);
      // Enum/check-constraint failures on devoluciones are sanitized on each retry — defer instead of dead-lettering
      const isDevolucionEnumIssue = (err?.code === '22P02' || err?.code === '23514') && (item.table === 'devoluciones' || item.table === 'devolucion_lineas');

      const newRetries = (item.retries ?? 0) + 1;
      const errorMsg = (err?.message || err?.error_description || String(err)).slice(0, 300);

      if (isConflict && item.operation === 'insert') {
        console.warn(`Conflict on insert ${item.table}/${item.keyValue}, will retry as upsert`);
      }

      if (isFkMissing || isRlsViolation) {
        // Parent record hasn't been synced yet in this pass — push to end of queue

        // by resetting createdAt so it processes after siblings.
        await offlineDb.syncQueue.update(item.id!, {
          retries: newRetries,
          createdAt: Date.now() + 1000, // bump forward so it's last
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
      } else if (isNotFound || newRetries >= MAX_RETRIES) {
        // Dead letter: keep in queue but mark with high retries
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
          createdAt: Date.now(), // Reset timestamp for backoff calculation
          lastError: errorMsg,
          lastAttemptAt: Date.now(),
        });
      }
      failed++;
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

