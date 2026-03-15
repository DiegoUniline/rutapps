/**
 * Master sync: downloads all relevant data from the server into IndexedDB.
 * Called on app load when online and periodically.
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
] as const;

// Some tables need special select queries (joins)
const SPECIAL_SELECTS: Record<string, string> = {
  productos: '*, unidades:unidad_venta_id(nombre, abreviatura), tasas_iva:tasa_iva_id(porcentaje)',
};

export async function downloadAllData(empresaId: string): Promise<void> {
  const promises = TABLES_TO_CACHE.map(async (table) => {
    try {
      const selectStr = SPECIAL_SELECTS[table] || '*';
      let query = (supabase.from as any)(table).select(selectStr);

      // Tables with empresa_id filter
      const tablesWithEmpresa = [
        'clientes', 'productos', 'vendedores', 'cargas', 'ventas',
        'cobros', 'gastos', 'devoluciones', 'empresas', 'unidades',
        'tasas_iva', 'descarga_ruta', 'promociones',
      ];

      if (tablesWithEmpresa.includes(table)) {
        if (table === 'empresas') {
          query = query.eq('id', empresaId);
        } else {
          query = query.eq('empresa_id', empresaId);
        }
      }

      // Limit large tables to recent data
      const recentTables = ['ventas', 'venta_lineas', 'cobros', 'cobro_aplicaciones', 'gastos', 'devoluciones', 'devolucion_lineas'];
      if (recentTables.includes(table)) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte('created_at', thirtyDaysAgo.toISOString());
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
        await localTable.clear();
        await localTable.bulkPut(allData);
      }

      // Update cache timestamp
      await offlineDb.cacheTimestamps.put({ table, lastSync: Date.now() });
    } catch (err) {
      console.error(`Failed to cache ${table}:`, err);
    }
  });

  await Promise.all(promises);
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
