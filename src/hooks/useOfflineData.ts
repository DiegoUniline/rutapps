import { useEffect, useState, useCallback } from 'react';
import { getOfflineTable, offlineDb } from '@/lib/offlineDb';
import { supabase } from '@/lib/supabase';
import { queueOperation } from '@/lib/syncQueue';
import { getSyncConfig } from '@/lib/dataSaver';
import { hasRealConnection } from '@/lib/connectivity';
import { fetchAllPages } from '@/lib/supabasePaginate';
import {
  COLUMN_SELECTS,
  UPDATED_AT_DELTA_TABLES,
  UPDATED_AT_WINDOW_TABLES,
  TABLES_WITH_EMPRESA,
  LS_LAST_EMPRESA,
  WINDOW_DAYS,
} from '@/lib/offlineSync';

/** empresa_id activa (la misma que usa el sync maestro). */
function activeEmpresaId(): string | null {
  try { return localStorage.getItem(LS_LAST_EMPRESA); } catch { return null; }
}

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
 * Hook que lee de IndexedDB primero (instantáneo) y solo va al servidor cuando
 * hace falta de verdad.
 *
 * AHORRO DE DATOS (corrección del consumo de GB en móvil):
 *  - El throttle es POR TABLA (antes era por tabla+filtros+select, así que
 *    `ventas` se descargaba 4 veces al navegar entre pantallas de /Ruta).
 *  - El TTL sube de 30 s a 5 min, y si el sync maestro dejó la tabla fresca
 *    (menos de 5 min) NO se vuelve a pedir nada al servidor.
 *  - Cuando sí hay que ir al servidor, las tablas con `updated_at` se piden en
 *    DELTA (solo lo que cambió) y las transaccionales con ventana de 30 días,
 *    en vez de bajar el histórico completo con `select('*')`.
 *  - Se piden columnas explícitas cuando la tabla tiene lista definida.
 */
const SERVER_FETCH_TTL_MS = 5 * 60_000;
const MASTER_SYNC_FRESH_MS = 5 * 60_000;
const lastServerFetchAt = new Map<string, number>();

/** Tablas transaccionales acotadas a los últimos 30 días de actividad. */
const WINDOWED_TABLES: Record<string, string> = {
  ventas: 'fecha',
  cobros: 'fecha',
  gastos: 'fecha',
  devoluciones: 'fecha',
  entregas: 'fecha',
  visitas: 'fecha',
};

function windowStartISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

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

    // Throttle compartido POR TABLA: cambiar de pantalla no vuelve a descargar.
    const cacheKey = table;

    setIsLoading(true);

    const localTable = getOfflineTable(table);

    const readLocal = async (): Promise<T[] | null> => {
      if (!localTable) return null;
      try {
        let localData = await localTable.toArray();

        if (filters) {
          localData = localData.filter(item => {
            return Object.entries(filters).every(([key, value]) => {
              if (value === undefined || value === null) return true;
              if (Array.isArray(value)) return value.includes(item[key]);
              return item[key] === value;
            });
          });
        }

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
        return localData as T[];
      } catch (err) {
        console.warn('IndexedDB read failed:', err);
        return null;
      }
    };

    // 1. Lectura local inmediata
    let hasLocalData = false;
    const local = await readLocal();
    if (local && local.length > 0) {
      setData(local);
      hasLocalData = true;
      setIsLoading(false);
    }

    // 2. Modo ahorro de datos: con datos locales no se toca la red
    const config = getSyncConfig();
    if (config.enabled && hasLocalData) {
      setIsLoading(false);
      return;
    }

    // 3. Atajos de ahorro (solo si YA hay datos locales)
    if (hasLocalData && !opts?.force) {
      const now = Date.now();
      const last = lastServerFetchAt.get(cacheKey) ?? 0;
      if (opts?.localOnly || (now - last < SERVER_FETCH_TTL_MS)) {
        setIsLoading(false);
        return;
      }
      // El sync maestro ya dejó esta tabla fresca: no se re-descarga.
      try {
        const ts = await offlineDb.cacheTimestamps.get(table);
        const lastOk = ts?.lastSuccessAt ?? ts?.lastSync ?? 0;
        if (lastOk && now - lastOk < MASTER_SYNC_FRESH_MS) {
          lastServerFetchAt.set(cacheKey, now);
          setIsLoading(false);
          return;
        }
      } catch { /* sin metadatos: sigue al fetch normal */ }
    }

    // 4. Fetch al servidor: delta / ventana / columnas explícitas
    if (await hasRealConnection()) {
      // Delta incremental: solo lo que cambió desde el último cursor conocido.
      let deltaCursor: string | null = null;
      const supportsDelta = UPDATED_AT_DELTA_TABLES.has(table) || UPDATED_AT_WINDOW_TABLES.has(table);
      if (supportsDelta && hasLocalData && !opts?.force) {
        try {
          const ts = await offlineDb.cacheTimestamps.get(table);
          deltaCursor = ts?.cursor ?? null;
        } catch { /* ignore */ }
      }

      const windowColumn = !opts?.force ? WINDOWED_TABLES[table] : undefined;
      const selectCols = options?.select || COLUMN_SELECTS[table] || '*';

      try {
        const serverData = await fetchAllPages((from, to) => {
          let query = (supabase.from as any)(table).select(selectCols);

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

          if (deltaCursor) {
            query = query.gt('updated_at', deltaCursor);
          } else if (windowColumn) {
            query = query.gte(windowColumn, windowStartISO());
          }

          if (options?.orderBy) {
            query = query.order(options.orderBy, { ascending: options.ascending !== false });
          }

          return query.range(from, to);
        });

        lastServerFetchAt.set(cacheKey, Date.now());

        // Guardar en caché local (merge, nunca borrar histórico)
        if (localTable && serverData.length > 0) {
          await localTable.bulkPut(serverData);
        }

        // BLINDAJE DE SALDOS: además de la ventana de 30 días, siempre se
        // traen TODAS las ventas con saldo pendiente (sin importar su fecha),
        // para que el estado de cuenta y la cobranza nunca queden cortos.
        if (table === 'ventas' && (deltaCursor || windowColumn) && localTable) {
          const pendKey = 'ventas:pendientes';
          const lastPend = lastServerFetchAt.get(pendKey) ?? 0;
          if (Date.now() - lastPend > 10 * 60_000) {
            try {
              const pendientes = await fetchAllPages((from, to) => {
                let q = (supabase.from as any)('ventas')
                  .select(selectCols)
                  .gt('saldo_pendiente', 0)
                  .neq('status', 'cancelado');
                if (filters?.empresa_id) q = q.eq('empresa_id', filters.empresa_id);
                return q.range(from, to);
              });
              if (pendientes.length > 0) await localTable.bulkPut(pendientes);
              lastServerFetchAt.set(pendKey, Date.now());
            } catch { /* se reintenta luego; la ventana ya trajo lo reciente */ }
          }
        }

        if (deltaCursor || windowColumn) {
          // Descarga parcial: la verdad completa vive en IndexedDB.
          const merged = await readLocal();
          if (merged) setData(merged);
          else if (serverData.length > 0) setData(serverData as T[]);
        } else if (serverData.length > 0 || !hasLocalData) {
          // Descarga completa: reemplaza lo mostrado (evita parpadeo a vacío).
          setData(serverData as T[]);
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
