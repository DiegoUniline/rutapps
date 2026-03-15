import { offlineDb, type SyncQueueItem, getOfflineTable } from './offlineDb';
import { supabase } from './supabase';
import { markAsSynced } from './syncVerify';

const MAX_RETRIES = 5;

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

  // 2. Add to sync queue
  await offlineDb.syncQueue.add({
    table,
    operation,
    data,
    keyField,
    keyValue,
    createdAt: Date.now(),
    retries: 0,
  });

  // 3. Try to sync immediately if online
  if (navigator.onLine) {
    processSyncQueue().catch(console.warn);
  }
}

// Process all pending items in the sync queue
export async function processSyncQueue(): Promise<{ success: number; failed: number }> {
  const items = await offlineDb.syncQueue.orderBy('createdAt').toArray();
  let success = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await processItem(item);
      await offlineDb.syncQueue.delete(item.id!);
      success++;
    } catch (err) {
      console.error(`Sync failed for ${item.table}/${item.operation}:`, err);
      const newRetries = (item.retries ?? 0) + 1;
      if (newRetries >= MAX_RETRIES) {
        // Move to a dead-letter approach: keep but mark
        console.error(`Max retries reached for item ${item.id}, keeping in queue`);
      }
      await offlineDb.syncQueue.update(item.id!, { retries: newRetries });
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

// Get count of pending sync items
export async function getPendingCount(): Promise<number> {
  return offlineDb.syncQueue.count();
}

// Clear entire sync queue (use with caution)
export async function clearSyncQueue() {
  await offlineDb.syncQueue.clear();
}
