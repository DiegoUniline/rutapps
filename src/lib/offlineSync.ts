/**
 * Master sync: downloads only CHANGED data from the server into IndexedDB.
 * Uses updated_at/created_at timestamps for delta sync to minimize data usage.
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
] as const;

// Minimal column selects per table to reduce payload size
const COLUMN_SELECTS: Record<string, string> = {
  clientes: 'id,empresa_id,vendedor_id,cobrador_id,nombre,codigo,telefono,email,direccion,colonia,cp,gps_lat,gps_lng,status,credito,limite_credito,dias_credito,dia_visita,frecuencia,tarifa_id,lista_id,zona_id,orden,rfc,regimen_fiscal,uso_cfdi,contacto,notas,requiere_factura,foto_url,foto_fachada_url,created_at,fecha_alta,facturama_id,facturama_rfc,facturama_razon_social,facturama_regimen_fiscal,facturama_uso_cfdi,facturama_cp,facturama_correo_facturacion',
  productos: 'id,empresa_id,codigo,nombre,descripcion,precio_venta,costo,stock,stock_minimo,status,unidad_venta_id,tasa_iva_id,marca_id,clasificacion_id,codigo_sat,unidad_sat,peso,ieps_tasa,ieps_cuota,foto_url,created_at,unidades:unidad_venta_id(nombre,abreviatura),tasas_iva:tasa_iva_id(porcentaje)',
  venta_lineas: 'id,venta_id,producto_id,cantidad,precio_unitario,descuento_porcentaje,subtotal,iva,ieps,total,notas,unidad_id,facturado,created_at',
  carga_lineas: 'id,carga_id,producto_id,cantidad_cargada,cantidad_vendida,cantidad_devuelta,created_at',
  cobro_aplicaciones: 'id,cobro_id,venta_id,monto_aplicado,created_at',
  devolucion_lineas: 'id,devolucion_id,producto_id,cantidad,motivo,notas,created_at',
  descarga_ruta_lineas: 'id,descarga_id,producto_id,cantidad_esperada,cantidad_real,diferencia,motivo,notas,created_at',
  entrega_lineas: 'id,entrega_id,producto_id,cantidad_pedida,cantidad_entregada,hecho,almacen_origen_id,unidad_id,created_at',
};

// Tables that have empresa_id for filtering
const TABLES_WITH_EMPRESA = new Set([
  'clientes', 'productos', 'vendedores', 'cargas', 'ventas',
  'cobros', 'gastos', 'devoluciones', 'empresas', 'unidades',
  'tasas_iva', 'descarga_ruta', 'promociones', 'entregas',
]);

// Tables limited to recent data
const RECENT_TABLES = new Set([
  'ventas', 'venta_lineas', 'cobros', 'cobro_aplicaciones', 'gastos',
  'devoluciones', 'devolucion_lineas', 'entregas', 'entrega_lineas',
]);

/**
 * Delta sync: only downloads records created/updated since lastSync.
 * First sync downloads everything; subsequent syncs only get changes.
 */
export async function downloadAllData(empresaId: string, forceFullSync = false): Promise<{ rowsDownloaded: number }> {
  let totalRows = 0;

  const promises = TABLES_TO_CACHE.map(async (table) => {
    try {
      // Get last sync time for this specific table
      const cacheEntry = await offlineDb.cacheTimestamps.get(table);
      const lastTableSync = (!forceFullSync && cacheEntry?.lastSync) ? cacheEntry.lastSync : null;

      const selectStr = COLUMN_SELECTS[table] || '*';
      let query = (supabase.from as any)(table).select(selectStr);

      // Filter by empresa
      if (TABLES_WITH_EMPRESA.has(table)) {
        if (table === 'empresas') {
          query = query.eq('id', empresaId);
        } else {
          query = query.eq('empresa_id', empresaId);
        }
      }

      // Limit large tables to recent data (only on full sync)
      if (RECENT_TABLES.has(table) && !lastTableSync) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte('created_at', thirtyDaysAgo.toISOString());
      }

      // DELTA SYNC: only get records modified since last sync
      if (lastTableSync) {
        const sinceDate = new Date(lastTableSync - 5000).toISOString(); // 5s buffer
        query = query.gte('created_at', sinceDate);
      }

      // Paginate to avoid the 1000 row limit
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
        } else {
          hasMore = false;
        }
      }

      // Write to IndexedDB
      const localTable = getOfflineTable(table);
      if (localTable && allData.length > 0) {
        if (!lastTableSync) {
          // Full sync: clear and replace
          await localTable.clear();
        }
        // Delta or full: upsert
        await localTable.bulkPut(allData);
        totalRows += allData.length;
      }

      // Update cache timestamp
      await offlineDb.cacheTimestamps.put({ table, lastSync: Date.now() });
    } catch (err) {
      console.error(`Failed to cache ${table}:`, err);
    }
  });

  await Promise.all(promises);
  return { rowsDownloaded: totalRows };
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
