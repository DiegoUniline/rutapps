import { offlineDb, type SyncQueueItem, getOfflineTable } from './offlineDb';
import { supabase } from './supabase';
import { markAsSynced } from './syncVerify';
import { isDataSaverEnabled } from './dataSaver';
import { backupSyncQueueToStorage, clearStorageBackup } from './offlineBackup';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

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

  // 3. Try to sync immediately if online AND data saver is off
  if (navigator.onLine && !isDataSaverEnabled()) {
    processSyncQueue().catch(console.warn);
  }
}

// Process all pending items in the sync queue
export async function processSyncQueue(): Promise<{ success: number; failed: number }> {
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
      const isNotFound = err?.code === '42P01' || err?.code === 'PGRST116';

      const newRetries = (item.retries ?? 0) + 1;

      if (isConflict && item.operation === 'insert') {
        // Conflict on insert: convert to upsert (already using upsert, so just retry)
        console.warn(`Conflict on insert ${item.table}/${item.keyValue}, will retry as upsert`);
      }

      if (isNotFound || newRetries >= MAX_RETRIES) {
        // Dead letter: keep in queue but mark with high retries
        console.error(`Max retries or not found for item ${item.id}, marking as dead letter`);
        await offlineDb.syncQueue.update(item.id!, {
          retries: MAX_RETRIES + 1,
          createdAt: Date.now(),
        });
      } else {
        await offlineDb.syncQueue.update(item.id!, {
          retries: newRetries,
          createdAt: Date.now(), // Reset timestamp for backoff calculation
        });
      }
      failed++;
    }
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

  switch (operation) {
    case 'insert': {
      const { error } = await (supabase.from as any)(table).upsert(cleanData);
      if (error) throw error;
      break;
    }
    case 'update': {
      const { [keyField]: _, ...updateData } = cleanData;
      const { error } = await (supabase.from as any)(table).update(updateData).eq(keyField, keyValue);
      if (error) throw error;
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
