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
// AHORRO DE DATOS: throttle de descargas del servidor por (tabla+filtros+select).
// Evita que cada montaje y cada evento 'sync-complete' vuelva a jalar la tabla
// COMPLETA. Cuando ya hay datos locales frescos (el sync maestro los mantiene al
// día), se reutiliza IndexedDB en vez de re-pegarle al servidor.
const SERVER_FETCH_TTL_MS = 30_000;
const lastServerFetchAt = new Map<string, number>();

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

  const loadData = useCallback(async (opts?: { localOnly?: boolean; force?: boolean }) => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const cacheKey = `${table}|${JSON.stringify(filters ?? {})}|${options?.select ?? ''}|${options?.orderBy ?? ''}|${options?.ascending ?? ''}`;

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

    // 2b. AHORRO DE DATOS (solo cuando YA hay datos locales frescos):
    //  - localOnly (evento sync-complete): el sync maestro ya actualizó
    //    IndexedDB, así que basta con la lectura local de arriba; no se
    //    re-descarga la tabla del servidor.
    //  - throttle: si esta misma consulta jaló del servidor hace <30s, se
    //    reutiliza lo local en vez de volver a bajar la tabla completa.
    //  Si NO hay datos locales (p. ej. escritorio sin caché), se ignora este
    //  atajo y se hace el fetch normal para no quedar sin datos.
    if (hasLocalData && !opts?.force) {
      const now = Date.now();
      const last = lastServerFetchAt.get(cacheKey) ?? 0;
      if (opts?.localOnly || (now - last < SERVER_FETCH_TTL_MS)) {
        setIsLoading(false);
        return;
      }
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

        // Marca cuándo se jaló del servidor esta consulta (para el throttle).
        lastServerFetchAt.set(cacheKey, Date.now());

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

  // Al terminar un sync, el sync maestro ya dejó IndexedDB fresco: se re-lee
  // local (localOnly) en vez de re-descargar la tabla del servidor.
  useEffect(() => {
    const handler = () => loadData({ localOnly: true });
    window.addEventListener('uniline:sync-complete', handler);
    return () => window.removeEventListener('uniline:sync-complete', handler);
  }, [loadData]);

  // refetch() explícito siempre fuerza descarga del servidor (ignora el throttle).
  const refetch = useCallback(() => loadData({ force: true }), [loadData]);
  return { data, isLoading, refetch };
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
