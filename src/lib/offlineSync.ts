/**
 * Master sync: downloads only CHANGED data from the server into IndexedDB.
 * Uses created_at timestamps for delta sync to minimize data usage.
 * Reports per-table progress via callback.
 */
import { offlineDb, getOfflineTable } from './offlineDb';
import { supabase } from './supabase';

const TABLES_TO_CACHE = [
  'clientes',
  'productos',
  'vendedores',
  'cargas',
  'carga_lineas',
  'ventas',
  'venta_lineas',
  'cobros',
  'cobro_aplicaciones',
  'gastos',
  'devoluciones',
  'devolucion_lineas',
  'profiles',
  'empresas',
  'cliente_pedido_sugerido',
  'unidades',
  'tasas_iva',
  'descarga_ruta',
  'descarga_ruta_lineas',
  'promociones',
  'entregas',
  'entrega_lineas',
  'visitas',
  'tarifas',
  'tarifa_lineas',
  'stock_almacen',
  'producto_presentaciones',
  'lista_precios',
  'zonas',
  'almacenes',
] as const;

type CacheTable = typeof TABLES_TO_CACHE[number];

export const MOBILE_QUICK_SYNC_TABLES: readonly CacheTable[] = [
  'empresas',
  'profiles',
  'clientes',
  'productos',
  'cargas',
  'carga_lineas',
  'stock_almacen',
  'ventas',
  'venta_lineas',
  'cobros',
  'cobro_aplicaciones',
  'promociones',
  'tarifas',
  'tarifa_lineas',
  'lista_precios',
  'producto_presentaciones',
  'entregas',
  'entrega_lineas',
  'descarga_ruta',
  'descarga_ruta_lineas',
  'visitas',
];

const PAGE_TIMEOUT_MS = 18000;
const CHILD_IN_CHUNK_SIZE = 80;


// Minimal column selects per table to reduce payload size
const COLUMN_SELECTS: Record<string, string> = {
  clientes: 'id,empresa_id,vendedor_id,cobrador_id,nombre,codigo,telefono,email,direccion,colonia,cp,gps_lat,gps_lng,status,credito,limite_credito,dias_credito,dia_visita,frecuencia,tarifa_id,lista_id,lista_precio_id,zona_id,orden,rfc,regimen_fiscal,uso_cfdi,contacto,notas,requiere_factura,foto_url,foto_fachada_url,created_at,fecha_alta,facturama_id,facturama_rfc,facturama_razon_social,facturama_regimen_fiscal,facturama_uso_cfdi,facturama_cp,facturama_correo_facturacion',
  productos: 'id,empresa_id,codigo,clave_alterna,nombre,precio_principal,costo,cantidad,min,max,status,unidad_venta_id,unidad_compra_id,marca_id,clasificacion_id,lista_id,codigo_sat,udem_sat_id,imagen_url,tiene_iva,iva_pct,tiene_ieps,ieps_pct,ieps_tipo,se_puede_vender,se_puede_comprar,se_puede_inventariar,vender_sin_stock,permitir_descuento,tiene_comision,tipo_comision,pct_comision,monto_maximo,es_combo,factor_conversion,costo_incluye_impuestos,almacenes,proveedor_preferido_id,created_at',
  venta_lineas: 'id,venta_id,producto_id,descripcion,cantidad,unidad_id,precio_unitario,descuento_pct,subtotal,iva_pct,ieps_pct,iva_monto,ieps_monto,total,notas,facturado,almacen_id,presentacion_id,presentacion_nombre,presentacion_factor,paquetes,lista_precio_id,precio_manual,created_at',
  carga_lineas: 'id,carga_id,producto_id,cantidad_cargada,cantidad_vendida,cantidad_devuelta,created_at',
  cobro_aplicaciones: 'id,cobro_id,venta_id,monto_aplicado,created_at',
  devolucion_lineas: 'id,devolucion_id,producto_id,cantidad,motivo,notas,created_at',
  descarga_ruta_lineas: 'id,descarga_id,producto_id,cantidad_esperada,cantidad_real,diferencia,motivo,notas,created_at',
  entrega_lineas: 'id,entrega_id,producto_id,cantidad_pedida,cantidad_entregada,hecho,almacen_origen_id,unidad_id,created_at',
  tarifa_lineas: 'id,tarifa_id,lista_precio_id,aplica_a,producto_ids,clasificacion_ids,tipo_calculo,precio,precio_minimo,margen_pct,descuento_pct,redondeo,base_precio,comision_pct,created_at',
  tarifas: 'id,empresa_id,nombre,tipo,activa,created_at',
  stock_almacen: 'id,empresa_id,almacen_id,producto_id,cantidad,updated_at',
  producto_presentaciones: 'id,empresa_id,producto_id,nombre,factor_base,precio_especial,codigo_barras,es_principal_stock,orden,activo,created_at',
  lista_precios: 'id,empresa_id,tarifa_id,nombre,es_principal,activa,share_token,share_activo,created_at',
  zonas: 'id,empresa_id,nombre,activo,created_at',
  almacenes: 'id,empresa_id,nombre,activo,es_merma,created_at',
};


// Friendly names for UI display
export const TABLE_LABELS: Record<string, string> = {
  clientes: 'Clientes',
  productos: 'Productos',
  vendedores: 'Vendedores',
  cargas: 'Cargas',
  carga_lineas: 'Líneas de carga',
  ventas: 'Ventas',
  venta_lineas: 'Líneas de venta',
  cobros: 'Cobros',
  cobro_aplicaciones: 'Aplicaciones de cobro',
  gastos: 'Gastos',
  devoluciones: 'Devoluciones',
  devolucion_lineas: 'Líneas de devolución',
  profiles: 'Perfiles',
  empresas: 'Empresa',
  cliente_pedido_sugerido: 'Pedidos sugeridos',
  unidades: 'Unidades',
  tasas_iva: 'Tasas IVA',
  descarga_ruta: 'Descargas de ruta',
  descarga_ruta_lineas: 'Líneas de descarga',
  promociones: 'Promociones',
  entregas: 'Entregas',
  entrega_lineas: 'Líneas de entrega',
  visitas: 'Visitas',
  tarifas: 'Tarifas',
  tarifa_lineas: 'Reglas de tarifa',
  stock_almacen: 'Stock por almacén',
  producto_presentaciones: 'Presentaciones de productos',
  lista_precios: 'Listas de precios',
  zonas: 'Zonas',
  almacenes: 'Almacenes',
};


// Tables that have empresa_id for filtering
const TABLES_WITH_EMPRESA = new Set([
  'clientes', 'productos', 'vendedores', 'cargas', 'ventas',
  'cobros', 'gastos', 'devoluciones', 'empresas', 'unidades',
  'tasas_iva', 'descarga_ruta', 'promociones', 'entregas', 'visitas',
  'tarifas',
  'stock_almacen',
  'producto_presentaciones',
  'lista_precios',
  'zonas',
  'almacenes',
]);


// Tables limited to recent data
const RECENT_TABLES = new Set([
  'ventas', 'venta_lineas', 'cobros', 'cobro_aplicaciones', 'gastos',
  'devoluciones', 'devolucion_lineas', 'entregas', 'entrega_lineas', 'visitas',
]);

// Tables where delta-by-created_at misses real changes (admin edits / UPDATE-in-place
// or DELETE+INSERT cycles that leave stale rows in IndexedDB). Always full-refresh
// these — they're small and critical for operational correctness on mobile.
const NO_DELTA_TABLES = new Set([
  'cargas',
  'carga_lineas',
  'entregas',
  'entrega_lineas',
  'descarga_ruta',
  'descarga_ruta_lineas',
  'stock_almacen',
  'producto_presentaciones',
  'tarifas',
  'tarifa_lineas',
  'lista_precios',
  'promociones',
]);

const CHILD_SCOPES: Partial<Record<CacheTable, { parentTable: CacheTable; foreignKey: string }>> = {
  carga_lineas: { parentTable: 'cargas', foreignKey: 'carga_id' },
  venta_lineas: { parentTable: 'ventas', foreignKey: 'venta_id' },
  cobro_aplicaciones: { parentTable: 'cobros', foreignKey: 'cobro_id' },
  devolucion_lineas: { parentTable: 'devoluciones', foreignKey: 'devolucion_id' },
  descarga_ruta_lineas: { parentTable: 'descarga_ruta', foreignKey: 'descarga_id' },
  entrega_lineas: { parentTable: 'entregas', foreignKey: 'entrega_id' },
  tarifa_lineas: { parentTable: 'tarifas', foreignKey: 'tarifa_id' },
  cliente_pedido_sugerido: { parentTable: 'clientes', foreignKey: 'cliente_id' },
};

const activeDownloads = new Map<string, Promise<DownloadResult>>();

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} tardó demasiado; se reintentará en la próxima sincronización`)), PAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getScopedParentIds(table: CacheTable, empresaId: string): Promise<string[] | null> {
  const scope = CHILD_SCOPES[table];
  if (!scope) return null;

  const localParentTable = getOfflineTable(scope.parentTable);
  const localRowsRaw = localParentTable ? await localParentTable.toArray().catch(() => []) : [];
  const localRows = localRowsRaw.filter((row: any) => {
    if (scope.parentTable === 'empresas') return row?.id === empresaId;
    if (TABLES_WITH_EMPRESA.has(scope.parentTable)) return row?.empresa_id === empresaId;
    return true;
  });
  const localIds = localRows.map((row: any) => row?.id).filter(Boolean) as string[];
  if (localIds.length > 0) return Array.from(new Set(localIds));

  let query = (supabase.from as any)(scope.parentTable).select('id');
  if (TABLES_WITH_EMPRESA.has(scope.parentTable)) {
    query = scope.parentTable === 'empresas'
      ? query.eq('id', empresaId)
      : query.eq('empresa_id', empresaId);
  }
  const { data, error } = await withTimeout<any>(query.range(0, 4999), `${scope.parentTable} ids`);
  if (error) throw error;
  return Array.from(new Set(((data || []) as any[]).map(row => row?.id).filter(Boolean)));
}

export interface SyncProgress {
  table: string;
  label: string;
  status: 'waiting' | 'downloading' | 'done' | 'error';
  rowCount: number;
  error?: string;
}

export interface DownloadResult {
  rowsDownloaded: number;
  tableResults: SyncProgress[];
}

interface DownloadOptions {
  tables?: readonly CacheTable[];
}

/**
 * Download all data with progress reporting.
 * forceFullSync = true ignores delta timestamps and re-downloads everything.
 */
export async function downloadAllData(
  empresaId: string,
  forceFullSync = false,
  onProgress?: (progress: SyncProgress[]) => void,
  options?: DownloadOptions,
): Promise<DownloadResult> {
  const tablesToCache = (options?.tables?.length ? options.tables : TABLES_TO_CACHE) as readonly CacheTable[];
  const lockKey = `${empresaId}:${forceFullSync ? 'full' : 'delta'}:${tablesToCache.join(',')}`;
  const active = activeDownloads.get(lockKey);
  if (active) return active;

  const task = downloadAllDataInternal(empresaId, forceFullSync, onProgress, tablesToCache)
    .finally(() => activeDownloads.delete(lockKey));
  activeDownloads.set(lockKey, task);
  return task;
}

async function downloadAllDataInternal(
  empresaId: string,
  forceFullSync: boolean,
  onProgress: ((progress: SyncProgress[]) => void) | undefined,
  tablesToCache: readonly CacheTable[],
): Promise<DownloadResult> {
  let totalRows = 0;

  // Initialize progress
  const progress: SyncProgress[] = tablesToCache.map(table => ({
    table,
    label: TABLE_LABELS[table] || table,
    status: 'waiting',
    rowCount: 0,
  }));

  const notify = () => onProgress?.([...progress]);
  notify();

  // Process tables sequentially for progress visibility (parallel within batches)
  const BATCH_SIZE = 4;
  for (let i = 0; i < tablesToCache.length; i += BATCH_SIZE) {
    const batch = tablesToCache.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (table) => {
      const idx = tablesToCache.indexOf(table);
      progress[idx].status = 'downloading';
      notify();

      try {
        const cacheEntry = await offlineDb.cacheTimestamps.get(table);
        const skipDelta = NO_DELTA_TABLES.has(table);
        const lastTableSync = (!forceFullSync && !skipDelta && cacheEntry?.lastSync) ? cacheEntry.lastSync : null;

        const selectStr = COLUMN_SELECTS[table] || '*';

        // Builder factory: rebuild the query each page so supabase-js doesn't
        // reuse a consumed PostgrestFilterBuilder (which causes only the first
        // 1000 rows to be returned).
        const parentIds = await getScopedParentIds(table, empresaId);
        const parentChunks = parentIds ? chunk(parentIds, CHILD_IN_CHUNK_SIZE) : [null];

        if (parentIds && parentIds.length === 0) {
          const localTable = getOfflineTable(table);
          if (localTable && !lastTableSync) await localTable.clear();
          await offlineDb.cacheTimestamps.put({
            table,
            lastSync: Date.now(),
            lastSuccessAt: Date.now(),
            lastError: undefined,
            lastErrorAt: undefined,
          });
          progress[idx].status = 'done';
          progress[idx].rowCount = 0;
          notify();
          return;
        }

        const buildQuery = (parentChunk: string[] | null) => {
          let q = (supabase.from as any)(table).select(selectStr);

          if (TABLES_WITH_EMPRESA.has(table)) {
            if (table === 'empresas') {
              q = q.eq('id', empresaId);
            } else {
              q = q.eq('empresa_id', empresaId);
            }
          }

          const childScope = CHILD_SCOPES[table];
          if (childScope && parentChunk && parentChunk.length > 0) {
            q = q.in(childScope.foreignKey, parentChunk);
          }

          if (RECENT_TABLES.has(table) && !lastTableSync) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            q = q.gte('created_at', thirtyDaysAgo.toISOString());
          }

          // Delta sync
          if (lastTableSync) {
            const sinceDate = new Date(lastTableSync - 5000).toISOString();
            q = q.gte('created_at', sinceDate);
          }

          return q;
        };

        // Paginate
        let allData: any[] = [];
        const pageSize = 1000;

        for (const parentChunk of parentChunks) {
          let from = 0;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await withTimeout<any>(
              buildQuery(parentChunk).range(from, from + pageSize - 1),
              `${table} ${from + 1}-${from + pageSize}`,
            );
            if (error) {
              console.error(`Error downloading ${table}:`, error);
              break;
            }
            if (data && data.length > 0) {
              allData = allData.concat(data);
              from += pageSize;
              hasMore = data.length === pageSize;
              progress[idx].rowCount = allData.length;
              notify();
            } else {
              hasMore = false;
            }
          }
        }

        // Write to IndexedDB
        const localTable = getOfflineTable(table);
        if (localTable && allData.length > 0) {
          if (!lastTableSync) {
            await localTable.clear();
          }
          await localTable.bulkPut(allData);
          totalRows += allData.length;
        }

        await offlineDb.cacheTimestamps.put({
          table,
          lastSync: Date.now(),
          lastSuccessAt: Date.now(),
          lastError: undefined,
          lastErrorAt: undefined,
        });

        progress[idx].status = 'done';
        progress[idx].rowCount = allData.length;
        notify();
      } catch (err: any) {
        console.error(`Failed to cache ${table}:`, err);
        // Persist failure metadata WITHOUT touching lastSync — so the next
        // sync still runs a full pull for this table and the UI can show
        // "pending" tables even after a reload.
        try {
          const prev = await offlineDb.cacheTimestamps.get(table);
          await offlineDb.cacheTimestamps.put({
            table,
            lastSync: prev?.lastSync ?? 0,
            lastSuccessAt: prev?.lastSuccessAt,
            lastError: err?.message || 'Error desconocido',
            lastErrorAt: Date.now(),
          });
        } catch { /* ignore */ }
        progress[idx].status = 'error';
        progress[idx].error = err?.message || 'Error desconocido';
        notify();
      }
    }));
  }

  return { rowsDownloaded: totalRows, tableResults: progress };
}

/**
 * Get a summary of what's stored locally in IndexedDB.
 */
export async function getLocalDataSummary(): Promise<{ table: string; label: string; count: number; lastSync: number | null }[]> {
  const results: { table: string; label: string; count: number; lastSync: number | null }[] = [];

  for (const table of TABLES_TO_CACHE) {
    const localTable = getOfflineTable(table);
    let count = 0;
    if (localTable) {
      try { count = await localTable.count(); } catch { /* ignore */ }
    }
    const ts = await offlineDb.cacheTimestamps.get(table);
    results.push({
      table,
      label: TABLE_LABELS[table] || table,
      count,
      lastSync: ts?.lastSync || null,
    });
  }

  return results;
}

export async function getLastSyncTime(): Promise<number | null> {
  const timestamps = await offlineDb.cacheTimestamps.toArray();
  if (timestamps.length === 0) return null;
  return Math.min(...timestamps.map(t => t.lastSync));
}

export async function isCacheStale(maxAgeMinutes: number = 30): Promise<boolean> {
  const lastSync = await getLastSyncTime();
  if (!lastSync) return true;
  return Date.now() - lastSync > maxAgeMinutes * 60 * 1000;
}

/**
 * Tables whose last sync attempt failed (persisted across reloads).
 * Used by the sync screen to show a "pending" banner and by the
 * reconnect hook to auto-retry only what's missing.
 */
export async function getFailedTables(): Promise<{ table: string; label: string; error: string; lastErrorAt: number }[]> {
  const all = await offlineDb.cacheTimestamps.toArray();
  return all
    .filter(t => t.lastError && t.lastErrorAt)
    .map(t => ({
      table: t.table,
      label: TABLE_LABELS[t.table] || t.table,
      error: t.lastError!,
      lastErrorAt: t.lastErrorAt!,
    }));
}

/**
 * Re-download ONLY tables whose previous attempt failed.
 * Safe to call repeatedly: no-op if nothing failed.
 */
export async function retryFailedTables(
  empresaId: string,
  onProgress?: (progress: SyncProgress[]) => void,
): Promise<DownloadResult> {
  const failed = await getFailedTables();
  if (failed.length === 0) {
    return { rowsDownloaded: 0, tableResults: [] };
  }
  const tables = failed
    .map(f => f.table)
    .filter((t): t is CacheTable => (TABLES_TO_CACHE as readonly string[]).includes(t));
  if (tables.length === 0) {
    return { rowsDownloaded: 0, tableResults: [] };
  }
  return downloadAllData(empresaId, false, onProgress, { tables });
}
