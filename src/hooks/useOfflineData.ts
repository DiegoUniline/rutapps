import { useEffect, useState, useCallback } from 'react';
import { getOfflineTable } from '@/lib/offlineDb';
import { supabase } from '@/lib/supabase';
import { queueOperation } from '@/lib/syncQueue';
import { getSyncConfig } from '@/lib/dataSaver';
import { hasRealConnection } from '@/lib/connectivity';
import { fetchAllPages } from '@/lib/supabasePaginate';

/** UUID v4 with fallback for environments lacking crypto.randomUUID. */
function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  // RFC4122-ish v4 fallback using Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Hook that reads from IndexedDB first (instant), then from Supabase if online
 * AND cache is stale or data saver is off.
 */
export function useOfflineQuery<T = any>(
  table: string,
  filters?: Record<string, any>,
  options?: {
    select?: string;
    orderBy?: string;
    ascending?: boolean;
    enabled?: boolean;
  }
) {
  const enabled = options?.enabled !== false;
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);

  const loadData = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let hasLocalData = false;

    // 1. Read from IndexedDB immediately
    const localTable = getOfflineTable(table);
    if (localTable) {
      try {
        let localData = await localTable.toArray();

        // Apply filters locally
        if (filters) {
          localData = localData.filter(item => {
            return Object.entries(filters).every(([key, value]) => {
              if (value === undefined || value === null) return true;
              if (Array.isArray(value)) return value.includes(item[key]);
              return item[key] === value;
            });
          });
        }

        // Sort
        if (options?.orderBy) {
          const asc = options.ascending !== false;
          localData.sort((a, b) => {
            const va = a[options.orderBy!];
            const vb = b[options.orderBy!];
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
            return 0;
          });
        }

        if (localData.length > 0) {
          setData(localData as T[]);
          hasLocalData = true;
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('IndexedDB read failed:', err);
      }
    }

    // 2. If data saver is ON and we have local data, skip server fetch
    const config = getSyncConfig();
    if (config.enabled && hasLocalData) {
      setIsLoading(false);
      return;
    }

    // 3. If connected, fetch fresh data from server and update cache
    if (await hasRealConnection()) {
      try {
        const serverData = await fetchAllPages((from, to) => {
          let query = (supabase.from as any)(table).select(options?.select || '*');

          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value === undefined || value === null) return;
              if (Array.isArray(value)) {
                query = query.in(key, value);
              } else {
                query = query.eq(key, value);
              }
            });
          }

          if (options?.orderBy) {
            query = query.order(options.orderBy, { ascending: options.ascending !== false });
          }

          return query.range(from, to);
        });

        // Evita el "parpadeo a vacío" cuando ya hay datos locales (p. ej. un
        // registro recién insertado que aún no terminó de sincronizar al servidor).
        if (serverData.length > 0 || !hasLocalData) {
          setData(serverData as T[]);
        }

        // Update local cache
        if (localTable && serverData.length > 0) {
          await localTable.bulkPut(serverData);
        }
      } catch (err) {
        console.warn('Server fetch failed, using cached data:', err);
      }
    }

    setIsLoading(false);
  }, [table, JSON.stringify(filters), enabled, options?.select, options?.orderBy, options?.ascending]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-fetch when sync completes (server may have generated folios, etc.)
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('uniline:sync-complete', handler);
    return () => window.removeEventListener('uniline:sync-complete', handler);
  }, [loadData]);

  return { data, isLoading, refetch: loadData };
}

/**
 * Offline-safe mutation: writes to IndexedDB + queues for server sync
 */
export function useOfflineMutation() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async (
    table: string,
    operation: 'insert' | 'update' | 'delete',
    data: Record<string, unknown>,
    keyField: string = 'id',
  ) => {
    setIsPending(true);
    try {
      // Copy to avoid mutating caller's object; generate UUID with fallback
      // for environments where crypto.randomUUID is unavailable (iOS < 15.4,
      // old WebViews, insecure http:// contexts).
      const record: Record<string, unknown> = { ...data };
      if (operation === 'insert' && !record.id) {
        record.id = generateUUID();
      }

      await queueOperation(table, operation, record, keyField);
      return record;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutate, isPending };
}
