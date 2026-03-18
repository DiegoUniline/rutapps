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
] as const;

// Minimal column selects per table to reduce payload size
const COLUMN_SELECTS: Record<string, string> = {
  clientes: 'id,empresa_id,vendedor_id,cobrador_id,nombre,codigo,telefono,email,direccion,colonia,cp,gps_lat,gps_lng,status,credito,limite_credito,dias_credito,dia_visita,frecuencia,tarifa_id,lista_id,zona_id,orden,rfc,regimen_fiscal,uso_cfdi,contacto,notas,requiere_factura,foto_url,foto_fachada_url,created_at,fecha_alta,facturama_id,facturama_rfc,facturama_razon_social,facturama_regimen_fiscal,facturama_uso_cfdi,facturama_cp,facturama_correo_facturacion',
  productos: 'id,empresa_id,codigo,clave_alterna,nombre,precio_principal,costo,cantidad,min,max,status,unidad_venta_id,unidad_compra_id,tasa_iva_id,tasa_ieps_id,marca_id,clasificacion_id,lista_id,codigo_sat,udem_sat_id,imagen_url,tiene_iva,iva_pct,tiene_ieps,ieps_pct,ieps_tipo,se_puede_vender,se_puede_comprar,se_puede_inventariar,vender_sin_stock,permitir_descuento,tiene_comision,tipo_comision,pct_comision,monto_maximo,es_combo,factor_conversion,costo_incluye_impuestos,almacenes,proveedor_id,manejar_lotes,created_at',
  venta_lineas: 'id,venta_id,producto_id,cantidad,precio_unitario,descuento_porcentaje,subtotal,iva,ieps,total,notas,unidad_id,facturado,created_at',
  carga_lineas: 'id,carga_id,producto_id,cantidad_cargada,cantidad_vendida,cantidad_devuelta,created_at',
  cobro_aplicaciones: 'id,cobro_id,venta_id,monto_aplicado,created_at',
  devolucion_lineas: 'id,devolucion_id,producto_id,cantidad,motivo,notas,created_at',
  descarga_ruta_lineas: 'id,descarga_id,producto_id,cantidad_esperada,cantidad_real,diferencia,motivo,notas,created_at',
  entrega_lineas: 'id,entrega_id,producto_id,cantidad_pedida,cantidad_entregada,hecho,almacen_origen_id,unidad_id,created_at',
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
};

// Tables that have empresa_id for filtering
const TABLES_WITH_EMPRESA = new Set([
  'clientes', 'productos', 'vendedores', 'cargas', 'ventas',
  'cobros', 'gastos', 'devoluciones', 'empresas', 'unidades',
  'tasas_iva', 'descarga_ruta', 'promociones', 'entregas', 'visitas',
]);

// Tables limited to recent data
const RECENT_TABLES = new Set([
  'ventas', 'venta_lineas', 'cobros', 'cobro_aplicaciones', 'gastos',
  'devoluciones', 'devolucion_lineas', 'entregas', 'entrega_lineas', 'visitas',
]);

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

/**
 * Download all data with progress reporting.
 * forceFullSync = true ignores delta timestamps and re-downloads everything.
 */
export async function downloadAllData(
  empresaId: string,
  forceFullSync = false,
  onProgress?: (progress: SyncProgress[]) => void,
): Promise<DownloadResult> {
  let totalRows = 0;

  // Initialize progress
  const progress: SyncProgress[] = TABLES_TO_CACHE.map(table => ({
    table,
    label: TABLE_LABELS[table] || table,
    status: 'waiting',
    rowCount: 0,
  }));

  const notify = () => onProgress?.([...progress]);
  notify();

  // Process tables sequentially for progress visibility (parallel within batches)
  const BATCH_SIZE = 4;
  for (let i = 0; i < TABLES_TO_CACHE.length; i += BATCH_SIZE) {
    const batch = TABLES_TO_CACHE.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (table) => {
      const idx = TABLES_TO_CACHE.indexOf(table);
      progress[idx].status = 'downloading';
      notify();

      try {
        const cacheEntry = await offlineDb.cacheTimestamps.get(table);
        const lastTableSync = (!forceFullSync && cacheEntry?.lastSync) ? cacheEntry.lastSync : null;

        const selectStr = COLUMN_SELECTS[table] || '*';
        let query = (supabase.from as any)(table).select(selectStr);

        if (TABLES_WITH_EMPRESA.has(table)) {
          if (table === 'empresas') {
            query = query.eq('id', empresaId);
          } else {
            query = query.eq('empresa_id', empresaId);
          }
        }

        if (RECENT_TABLES.has(table) && !lastTableSync) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          query = query.gte('created_at', thirtyDaysAgo.toISOString());
        }

        // Delta sync
        if (lastTableSync) {
          const sinceDate = new Date(lastTableSync - 5000).toISOString();
          query = query.gte('created_at', sinceDate);
        }

        // Paginate
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await query.range(from, from + pageSize - 1);
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

        // Write to IndexedDB
        const localTable = getOfflineTable(table);
        if (localTable && allData.length > 0) {
          if (!lastTableSync) {
            await localTable.clear();
          }
          await localTable.bulkPut(allData);
          totalRows += allData.length;
        }

        await offlineDb.cacheTimestamps.put({ table, lastSync: Date.now() });

        progress[idx].status = 'done';
        progress[idx].rowCount = allData.length;
        notify();
      } catch (err: any) {
        console.error(`Failed to cache ${table}:`, err);
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
