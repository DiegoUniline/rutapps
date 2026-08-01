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
  'stock_apartado',
  'producto_presentaciones',
  'lista_precios',
  'zonas',
  'almacenes',
  'lotes',
  'stock_lotes',
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
  'stock_apartado',
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
  'lotes',
  'stock_lotes',
];

const PAGE_TIMEOUT_MS = 18000;
const CHILD_IN_CHUNK_SIZE = 80;


// Minimal column selects per table to reduce payload size
export const COLUMN_SELECTS: Record<string, string> = {
  clientes: 'id,empresa_id,vendedor_id,cobrador_id,nombre,codigo,telefono,email,direccion,colonia,cp,gps_lat,gps_lng,status,credito,limite_credito,dias_credito,dia_visita,frecuencia,tarifa_id,lista_id,lista_precio_id,zona_id,orden,rfc,regimen_fiscal,uso_cfdi,contacto,notas,notas_fiscales,requiere_factura,foto_url,foto_fachada_url,created_at,updated_at,fecha_alta,facturama_id,facturama_rfc,facturama_razon_social,facturama_regimen_fiscal,facturama_uso_cfdi,facturama_cp,facturama_correo_facturacion',
  productos: 'id,empresa_id,codigo,clave_alterna,nombre,formula,nombre_compra,nombre_venta,nombre_ticket,precio_principal,costo,cantidad,min,max,status,unidad_venta_id,unidad_compra_id,marca_id,clasificacion_id,lista_id,codigo_sat,udem_sat_id,imagen_url,tiene_iva,iva_pct,tiene_ieps,ieps_pct,ieps_tipo,se_puede_vender,se_puede_comprar,se_puede_inventariar,vender_sin_stock,permitir_descuento,tiene_comision,tipo_comision,pct_comision,monto_maximo,es_combo,factor_conversion,costo_incluye_impuestos,usa_listas_precio,es_granel,unidad_granel,almacenes,proveedor_preferido_id,created_at,updated_at',
  venta_lineas: 'id,venta_id,producto_id,descripcion,cantidad,unidad_id,precio_unitario,descuento_pct,subtotal,iva_pct,ieps_pct,iva_monto,ieps_monto,total,notas,facturado,almacen_id,presentacion_id,presentacion_nombre,presentacion_factor,paquetes,lista_precio_id,precio_manual,created_at',
  carga_lineas: 'id,carga_id,producto_id,cantidad_cargada,cantidad_vendida,cantidad_devuelta,created_at',
  cobro_aplicaciones: 'id,cobro_id,venta_id,monto_aplicado,created_at',
  devolucion_lineas: 'id,devolucion_id,producto_id,cantidad,motivo,accion,monto_credito,reemplazo_producto_id,notas,created_at',
  descarga_ruta_lineas: 'id,descarga_id,producto_id,cantidad_esperada,cantidad_real,diferencia,motivo,notas,created_at',
  entrega_lineas: 'id,entrega_id,producto_id,cantidad_pedida,cantidad_entregada,hecho,almacen_origen_id,unidad_id,created_at',
  tarifa_lineas: 'id,tarifa_id,lista_precio_id,aplica_a,producto_ids,clasificacion_ids,tipo_calculo,precio,precio_minimo,margen_pct,descuento_pct,redondeo,base_precio,comision_pct,created_at',
  tarifas: 'id,empresa_id,nombre,tipo,activa,created_at',
  stock_almacen: 'id,empresa_id,almacen_id,producto_id,cantidad,updated_at',
  stock_apartado: 'id,empresa_id,venta_id,venta_linea_id,producto_id,almacen_id,cantidad,created_at,updated_at',
  producto_presentaciones: 'id,empresa_id,producto_id,nombre,factor_base,precio_especial,codigo_barras,es_principal_stock,orden,activo,created_at',
  lista_precios: 'id,empresa_id,tarifa_id,nombre,es_principal,activa,share_token,share_activo,created_at',
  zonas: 'id,empresa_id,nombre,activo,created_at',
  almacenes: 'id,empresa_id,nombre,activo,es_merma,created_at',
  lotes: 'id,empresa_id,producto_id,codigo,fecha_caducidad,activo,updated_at',
  stock_lotes: 'id,empresa_id,almacen_id,producto_id,lote_id,cantidad,updated_at',
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
  stock_apartado: 'Stock apartado',
  producto_presentaciones: 'Presentaciones de productos',
  lista_precios: 'Listas de precios',
  zonas: 'Zonas',
  almacenes: 'Almacenes',
  lotes: 'Lotes',
  stock_lotes: 'Stock por lote',
};


// Tables that have empresa_id for filtering
export const TABLES_WITH_EMPRESA = new Set([
  'clientes', 'productos', 'vendedores', 'cargas', 'ventas',
  'cobros', 'gastos', 'devoluciones', 'empresas', 'unidades',
  'tasas_iva', 'descarga_ruta', 'promociones', 'entregas', 'visitas',
  'tarifas',
  'profiles',
  'stock_almacen',
    'stock_apartado',
  'producto_presentaciones',
  'lista_precios',
  'zonas',
  'almacenes',
  'lotes',
  'stock_lotes',
]);


// Tables limited to recent data (ventana de 30 días por created_at).
// ventas y cobros NO van aquí: usan ventana por updated_at (ver
// UPDATED_AT_WINDOW_TABLES) para que sus ACTUALIZACIONES (saldo, status) bajen.
const RECENT_TABLES = new Set([
  'venta_lineas', 'cobro_aplicaciones', 'gastos',
  'devoluciones', 'devolucion_lineas', 'entregas', 'entrega_lineas', 'visitas',
]);

// Tables where delta-by-created_at misses real changes (admin edits / UPDATE-in-place
// or DELETE+INSERT cycles that leave stale rows in IndexedDB). Always full-refresh
// these — they're small and critical for operational correctness on mobile.
//
// IMPORTANTE: `productos`, `clientes` y `empresas` son datos maestros que el admin
// EDITA seguido (precio_principal, IVA, lista_precio_id del cliente, política de
// cobro de la empresa…). La tabla `productos` ni siquiera tiene `updated_at`, así
// que un delta por `created_at` NUNCA vuelve a bajar un producto editado: el móvil
// se queda con el precio viejo hasta un "Descargar todo" manual. Por eso van aquí:
// se refrescan completos en cada sync (incluida la sync rápida) y los cambios de
// precio/cliente/empresa siempre llegan.
const NO_DELTA_TABLES = new Set([
  'empresas',
  'cargas',
  'carga_lineas',
  'entregas',
  'entrega_lineas',
  'descarga_ruta',
  'descarga_ruta_lineas',
  'producto_presentaciones',
  'tarifas',
  'tarifa_lineas',
  'lista_precios',
  // Tablas chicas (que el vendedor NO crea offline, así que el clear+replace no
  // arriesga borrar algo sin sincronizar) cuyas EDICIONES/BORRADOS deben llegar
  // al móvil. Un delta por created_at nunca los propaga; el refresh completo sí.
  // cliente_pedido_sugerido: además evita duplicados (se borra+reinserta con IDs
  // nuevos en el servidor; el full replace limpia los viejos).
  'almacenes',
  'profiles',
  'cliente_pedido_sugerido',
  'promociones',
  'lotes',
  'stock_lotes',
]);

// Tablas grandes con delta REAL por `updated_at` (mantenido por trigger en BD,
// ver migración 20260727000000). En vez de re-bajarlas completas en cada sync,
// solo se descargan las filas cuyo updated_at es mayor al último cursor visto.
// Esto corta la mayor parte del consumo de datos móviles.
//
// Deben tener empresa_id y ser de primer nivel (no hijas), para poder validar
// borrados con un conteo barato. productos/clientes/stock_almacen/stock_apartado
// cumplen y reciben la columna updated_at + trigger en la migración.
export const UPDATED_AT_DELTA_TABLES = new Set([
  'productos',
  'clientes',
  'stock_almacen',
  'stock_apartado',
]);

// Tablas TRANSACCIONALES que se sincronizan por ventana de `updated_at` (últimos
// 30 días de actividad). A diferencia de created_at, esto SÍ baja las
// ACTUALIZACIONES: cuando se paga una venta, ventas.saldo_pendiente cambia (por
// trigger) y su updated_at sube, así el móvil deja de mostrar "adeudo fantasma".
// Igual con cancelaciones de cobros. Requieren updated_at + trigger (migración
// 20260727120000). No usan chequeo de conteo (están acotadas por ventana).
export const UPDATED_AT_WINDOW_TABLES = new Set([
  'ventas',
  'cobros',
]);
export const WINDOW_DAYS = 30;

// Las tablas "full" (NO_DELTA sin updated_at) no se re-descargan en cada sync de
// 30s: se refrescan como mucho cada esta ventana (un "Descargar todo" las fuerza).
const FULL_TABLE_REFRESH_MS = 5 * 60 * 1000; // 5 min

// Respaldo de reconciliación de borrados en tablas con delta por updated_at:
// aunque el chequeo por conteo ya los detecta, cada tanto forzamos una descarga
// completa por si un insert+delete simultáneo dejó el conteo igual.
const FULL_RECONCILE_MS = 12 * 60 * 60 * 1000; // 12 h

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

async function clearLocalScope(table: CacheTable, empresaId: string, parentIds: string[] | null): Promise<void> {
  const localTable = getOfflineTable(table);
  if (!localTable) return;
  const childScope = CHILD_SCOPES[table];
  if (childScope && parentIds && parentIds.length > 0) {
    await localTable.where(childScope.foreignKey).anyOf(parentIds).delete();
    return;
  }
  if (table === 'empresas') {
    await localTable.where('id').equals(empresaId).delete();
    return;
  }
  if (TABLES_WITH_EMPRESA.has(table)) {
    await localTable.where('empresa_id').equals(empresaId).delete();
    return;
  }
  await localTable.clear();
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

export const LS_LAST_EMPRESA = 'offline-empresa-id';

/**
 * AISLAMIENTO MULTI-EMPRESA EN EL DISPOSITIVO.
 *
 * IndexedDB es una sola base por navegador: si el usuario (típicamente un
 * super admin) entra a otra empresa, los registros de la empresa anterior se
 * quedaban guardados en el dispositivo. Eso inflaba los contadores ("2,052
 * clientes" cuando la empresa solo tiene 1), ocupaba espacio y era una fuga de
 * datos entre inquilinos.
 *
 * Aquí se borra TODO lo que no pertenezca a la empresa activa. Si el cambio de
 * empresa es detectado, también se limpian las tablas hijas (que no llevan
 * `empresa_id`) y los cursores de sincronización, para bajar todo limpio.
 */
export async function purgeForeignTenantData(empresaId: string): Promise<void> {
  if (!empresaId) return;
  let previous: string | null = null;
  try { previous = localStorage.getItem(LS_LAST_EMPRESA); } catch { /* ignore */ }
  const empresaChanged = previous !== null && previous !== empresaId;

  // 1) Tablas de primer nivel: fuera todo lo que no sea de la empresa activa.
  for (const table of TABLES_TO_CACHE) {
    const localTable = getOfflineTable(table);
    if (!localTable) continue;
    try {
      if (table === 'empresas') {
        await localTable.where('id').notEqual(empresaId).delete();
      } else if (CHILD_SCOPES[table]) {
        continue; // se limpian abajo por su padre
      } else {
        // Filtro por empresa_id aunque la tabla no esté en TABLES_WITH_EMPRESA
        // (ej. profiles): se borran las filas de otros inquilinos.
        const foreignIds: any[] = [];
        await localTable.toCollection().each((row: any) => {
          if (row && 'empresa_id' in row && row.empresa_id && row.empresa_id !== empresaId) {
            foreignIds.push(row.id);
          }
        });
        if (foreignIds.length > 0) await localTable.bulkDelete(foreignIds);
        else if (empresaChanged) await localTable.clear();
      }
    } catch { /* una tabla no debe romper la limpieza completa */ }
  }

  // 2) Tablas hijas (líneas, aplicaciones, reglas…): se borran las filas
  // huérfanas, es decir cuyo padre ya no existe localmente tras el paso 1.
  for (const table of TABLES_TO_CACHE) {
    const scope = CHILD_SCOPES[table];
    if (!scope) continue;
    const localTable = getOfflineTable(table);
    const parentTable = getOfflineTable(scope.parentTable);
    if (!localTable || !parentTable) continue;
    try {
      const parentIds = new Set<string>();
      await parentTable.toCollection().each((row: any) => { if (row?.id) parentIds.add(row.id); });
      const orphanIds: any[] = [];
      await localTable.toCollection().each((row: any) => {
        const fk = row?.[scope.foreignKey];
        if (!fk || !parentIds.has(fk)) orphanIds.push(row.id);
      });
      if (orphanIds.length > 0) await localTable.bulkDelete(orphanIds);
    } catch { /* ignore */ }
  }

  if (empresaChanged) {
    try { await offlineDb.cacheTimestamps.clear(); } catch { /* ignore */ }
  }
  try { localStorage.setItem(LS_LAST_EMPRESA, empresaId); } catch { /* ignore */ }
}

async function downloadAllDataInternal(
  empresaId: string,
  forceFullSync: boolean,
  onProgress: ((progress: SyncProgress[]) => void) | undefined,
  tablesToCache: readonly CacheTable[],
): Promise<DownloadResult> {
  let totalRows = 0;

  // Antes de bajar nada: fuera cualquier dato de otra empresa.
  await purgeForeignTenantData(empresaId);

  // Las tablas de lotes solo se descargan en empresas que manejan lotes; en las
  // demás serían megas tirados a la basura.
  let manejaLotes = false;
  try {
    const empLocal: any = await getOfflineTable('empresas')?.get(empresaId);
    if (empLocal && 'maneja_lotes' in empLocal) {
      manejaLotes = !!empLocal.maneja_lotes;
    } else {
      const { data } = await (supabase.from as any)('empresas').select('maneja_lotes').eq('id', empresaId).maybeSingle();
      manejaLotes = !!data?.maneja_lotes;
    }
  } catch { /* sin señal: se omiten los lotes en esta pasada */ }
  const effectiveTables = (manejaLotes
    ? tablesToCache
    : tablesToCache.filter(t => t !== 'lotes' && t !== 'stock_lotes')) as readonly CacheTable[];

  // Initialize progress
  const progress: SyncProgress[] = effectiveTables.map(table => ({
    table,
    label: TABLE_LABELS[table] || table,
    status: 'waiting',
    rowCount: 0,
  }));

  const notify = () => onProgress?.([...progress]);
  notify();

  // Process tables sequentially for progress visibility (parallel within batches)
  const BATCH_SIZE = 4;
  for (let i = 0; i < effectiveTables.length; i += BATCH_SIZE) {
    const batch = effectiveTables.slice(i, i + BATCH_SIZE);


    await Promise.all(batch.map(async (table) => {
      const idx = tablesToCache.indexOf(table);
      progress[idx].status = 'downloading';
      notify();

      try {
        const cacheEntry = await offlineDb.cacheTimestamps.get(table);
        const nowMs = Date.now();
        const isUpdatedAtDelta = UPDATED_AT_DELTA_TABLES.has(table);
        const isUpdatedAtWindow = UPDATED_AT_WINDOW_TABLES.has(table);
        const isNoDelta = NO_DELTA_TABLES.has(table);

        // AHORRO DE DATOS: las tablas "full" (sin updated_at) no se re-bajan en
        // cada sync de 30s; si se refrescaron hace poco, se saltan. Un
        // "Descargar todo" (forceFullSync) siempre las baja.
        if (!forceFullSync && isNoDelta && cacheEntry?.lastSuccessAt
            && (nowMs - cacheEntry.lastSuccessAt) < FULL_TABLE_REFRESH_MS) {
          progress[idx].status = 'done';
          progress[idx].rowCount = cacheEntry?.rowCount ?? 0;
          notify();
          return;
        }

        const selectStr = COLUMN_SELECTS[table] || '*';

        const parentIds = await getScopedParentIds(table, empresaId);
        const parentChunks = parentIds ? chunk(parentIds, CHILD_IN_CHUNK_SIZE) : [null];

        // Modo de descarga:
        //  - cursor (updated_at): solo filas cambiadas desde el último cursor.
        //  - lastTableSync (created_at): delta clásico para tablas transaccionales.
        //  - null en ambos: descarga COMPLETA (primer sync o forzado).
        const cursor = (!forceFullSync && (isUpdatedAtDelta || isUpdatedAtWindow)) ? (cacheEntry?.cursor ?? null) : null;
        const lastTableSync = (!forceFullSync && !isNoDelta && !isUpdatedAtDelta && !isUpdatedAtWindow && cacheEntry?.lastSync)
          ? cacheEntry.lastSync : null;
        const isDeltaPull = !!cursor || !!lastTableSync;

        if (parentIds && parentIds.length === 0) {
          if (!isDeltaPull) await clearLocalScope(table, empresaId, parentIds);
          await offlineDb.cacheTimestamps.put({
            table,
            lastSync: nowMs,
            lastSuccessAt: nowMs,
            cursor: cacheEntry?.cursor,
            lastFullAt: isDeltaPull ? cacheEntry?.lastFullAt : nowMs,
            rowCount: 0,
            lastError: undefined,
            lastErrorAt: undefined,
          });
          progress[idx].status = 'done';
          progress[idx].rowCount = 0;
          notify();
          return;
        }

        // Paginador reutilizable. mode='full' ignora los filtros de delta.
        const paginate = async (mode: 'delta' | 'full'): Promise<any[]> => {
          const build = (parentChunk: string[] | null) => {
            let q = (supabase.from as any)(table).select(selectStr);
            if (TABLES_WITH_EMPRESA.has(table)) {
              q = table === 'empresas' ? q.eq('id', empresaId) : q.eq('empresa_id', empresaId);
            }
            const childScope = CHILD_SCOPES[table];
            if (childScope && parentChunk && parentChunk.length > 0) {
              q = q.in(childScope.foreignKey, parentChunk);
            }
            // Ventana de 30 días por created_at para tablas transaccionales
            // hijas/append (acota cuánta historia se cachea).
            if (RECENT_TABLES.has(table)) {
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
              q = q.gte('created_at', thirtyDaysAgo.toISOString());
            }
            // Ventana por updated_at (ventas/cobros): cachea la actividad de los
            // últimos 30 días; una venta vieja pagada hoy tiene updated_at de hoy
            // y entra. Baja las ACTUALIZACIONES, no solo filas nuevas.
            if (isUpdatedAtWindow) {
              const windowStart = new Date();
              windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
              q = q.gte('updated_at', windowStart.toISOString());
            }
            if (mode === 'delta') {
              if (lastTableSync) q = q.gte('created_at', new Date(lastTableSync - 5000).toISOString());
              // cursor gana sobre la ventana (es más reciente) → solo lo cambiado.
              if (cursor) q = q.gte('updated_at', cursor);
            }
            return q;
          };

          let acc: any[] = [];
          const pageSize = 1000;
          for (const parentChunk of parentChunks) {
            let from = 0;
            let hasMore = true;
            while (hasMore) {
              const { data, error } = await withTimeout<any>(
                build(parentChunk).range(from, from + pageSize - 1),
                `${table} ${from + 1}-${from + pageSize}`,
              );
              if (error) {
                console.error(`Error downloading ${table}:`, error);
                throw new Error(error.message || `Error al descargar ${table}`);
              }
              if (data && data.length > 0) {
                acc = acc.concat(data);
                from += pageSize;
                hasMore = data.length === pageSize;
                progress[idx].rowCount = acc.length;
                notify();
              } else {
                hasMore = false;
              }
            }
          }
          return acc;
        };

        const localTable = getOfflineTable(table);
        const maxUpdatedAt = (rows: any[], seed?: string) => {
          let m = seed;
          for (const r of rows) {
            const u = r?.updated_at;
            if (u && (!m || u > m)) m = u;
          }
          return m;
        };

        // 1) Descarga (delta = merge sin borrar; full = borrar y reemplazar).
        //    Si la respuesta full viene vacía y fue exitosa, también se borra
        //    el scope local: así no quedan cobros/ventas fantasma tras borrados físicos.
        let allData = await paginate(isDeltaPull ? 'delta' : 'full');
        if (localTable) {
          if (!isDeltaPull) await clearLocalScope(table, empresaId, parentIds);
          if (allData.length > 0) await localTable.bulkPut(allData);
        }

        let newCursor = (isUpdatedAtDelta || isUpdatedAtWindow)
          ? maxUpdatedAt(allData, cacheEntry?.cursor)
          : cacheEntry?.cursor;
        let lastFullAt = isDeltaPull ? cacheEntry?.lastFullAt : nowMs;

        // 2) Robustez ante BORRADOS físicos (que un delta no ve): en tablas con
        //    delta por updated_at, comparamos conteo local vs servidor (barato,
        //    HEAD sin filas). Si difiere —o toca reconciliar cada 12h— se re-baja
        //    completa esa tabla. Los borrados suaves (status) sí llegan por delta.
        if (isUpdatedAtDelta && isDeltaPull && localTable) {
          let mismatch = false;
          try {
            const { count } = await withTimeout<any>(
              (supabase.from as any)(table).select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
              `${table} conteo`,
            );
            const localCount = await localTable.where('empresa_id').equals(empresaId).count();
            mismatch = typeof count === 'number' && count !== localCount;
          } catch { /* si el conteo falla, la reconciliación periódica cubre */ }

          const needsPeriodic = !lastFullAt || (nowMs - lastFullAt) > FULL_RECONCILE_MS;
          if (mismatch || needsPeriodic) {
            const full = await paginate('full');
            await clearLocalScope(table, empresaId, parentIds);
            if (full.length > 0) await localTable.bulkPut(full);
            allData = full;
            newCursor = maxUpdatedAt(full);
            lastFullAt = nowMs;
          }
        }

        totalRows += allData.length;
        const rowCount = localTable ? await localTable.count().catch(() => allData.length) : allData.length;

        await offlineDb.cacheTimestamps.put({
          table,
          lastSync: nowMs,
          lastSuccessAt: nowMs,
          cursor: newCursor,
          lastFullAt,
          rowCount,
          lastError: undefined,
          lastErrorAt: undefined,
        });

        progress[idx].status = 'done';
        progress[idx].rowCount = allData.length;
        notify();
      } catch (err: any) {
        console.error(`Failed to cache ${table}:`, err);
        // Persist failure metadata WITHOUT touching lastSync/cursor — so the
        // next sync retries from the same position and the UI can flag pending
        // tables even after a reload.
        try {
          const prev = await offlineDb.cacheTimestamps.get(table);
          await offlineDb.cacheTimestamps.put({
            table,
            lastSync: prev?.lastSync ?? 0,
            lastSuccessAt: prev?.lastSuccessAt,
            cursor: prev?.cursor,
            lastFullAt: prev?.lastFullAt,
            rowCount: prev?.rowCount,
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
export async function getLocalDataSummary(empresaId?: string): Promise<{ table: string; label: string; count: number; lastSync: number | null }[]> {
  const results: { table: string; label: string; count: number; lastSync: number | null }[] = [];

  for (const table of TABLES_TO_CACHE) {
    const localTable = getOfflineTable(table);
    let count = 0;
    if (localTable) {
      try {
        // Se cuentan SOLO los registros de la empresa activa: si el aparato
        // tuvo otra empresa antes, sus datos no deben inflar el contador.
        if (empresaId && table === 'empresas') {
          count = await localTable.where('id').equals(empresaId).count();
        } else if (empresaId && TABLES_WITH_EMPRESA.has(table)) {
          count = await localTable.where('empresa_id').equals(empresaId).count();
        } else {
          count = await localTable.count();
        }
      } catch { /* ignore */ }
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
  const valid = new Set<string>(TABLES_TO_CACHE as readonly string[]);
  // Auto-clean orphan error entries left over from previous app versions
  // (tables that no longer exist in TABLES_TO_CACHE). Without this, the
  // "partial sync" banner can stay forever because retry skips them.
  const orphans = all.filter(t => t.lastError && !valid.has(t.table));
  if (orphans.length > 0) {
    try {
      await Promise.all(orphans.map(o => offlineDb.cacheTimestamps.delete(o.table)));
    } catch { /* ignore */ }
  }
  return all
    .filter(t => t.lastError && t.lastErrorAt && valid.has(t.table))
    .map(t => ({
      table: t.table,
      label: TABLE_LABELS[t.table] || t.table,
      error: t.lastError!,
      lastErrorAt: t.lastErrorAt!,
    }));
}

/**
 * Manually clear all failure flags (user dismisses the "partial sync" banner).
 * Does NOT touch cached data — only the error metadata.
 */
export async function clearFailedTableFlags(): Promise<void> {
  const all = await offlineDb.cacheTimestamps.toArray();
  const failed = all.filter(t => t.lastError);
  await Promise.all(
    failed.map(t => offlineDb.cacheTimestamps.put({
      table: t.table,
      lastSync: t.lastSync,
      lastSuccessAt: t.lastSuccessAt,
      lastError: undefined,
      lastErrorAt: undefined,
    }))
  );
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
