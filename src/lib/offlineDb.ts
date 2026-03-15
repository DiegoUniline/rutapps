import Dexie, { type Table } from 'dexie';

export interface SyncQueueItem {
  id?: number;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  keyField: string;
  keyValue: string;
  createdAt: number;
  retries: number;
}

export interface CacheTimestamp {
  table: string;
  lastSync: number;
}

class OfflineDatabase extends Dexie {
  // Reference data caches
  clientes!: Table;
  productos!: Table;
  vendedores!: Table;
  cargas!: Table;
  carga_lineas!: Table;
  ventas!: Table;
  venta_lineas!: Table;
  cobros!: Table;
  cobro_aplicaciones!: Table;
  gastos!: Table;
  devoluciones!: Table;
  devolucion_lineas!: Table;
  profiles!: Table;
  empresas!: Table;
  cliente_pedido_sugerido!: Table;
  unidades!: Table;
  tasas_iva!: Table;
  descarga_ruta!: Table;
  descarga_ruta_lineas!: Table;
  promociones!: Table;
  // Sync infrastructure
  syncQueue!: Table<SyncQueueItem, number>;
  cacheTimestamps!: Table<CacheTimestamp, string>;

  constructor() {
    super('UnilineOffline');
    this.version(1).stores({
      clientes: 'id, empresa_id, vendedor_id, status, nombre',
      productos: 'id, empresa_id, codigo, nombre, status',
      vendedores: 'id, empresa_id',
      cargas: 'id, empresa_id, vendedor_id, status, fecha',
      carga_lineas: 'id, carga_id, producto_id',
      ventas: 'id, empresa_id, cliente_id, fecha, status, tipo',
      venta_lineas: 'id, venta_id, producto_id',
      cobros: 'id, empresa_id, cliente_id, fecha',
      cobro_aplicaciones: 'id, cobro_id, venta_id',
      gastos: 'id, empresa_id, fecha, user_id',
      devoluciones: 'id, empresa_id, fecha',
      devolucion_lineas: 'id, devolucion_id',
      profiles: 'id, user_id, empresa_id',
      empresas: 'id',
      cliente_pedido_sugerido: 'id, cliente_id, producto_id',
      unidades: 'id, empresa_id',
      tasas_iva: 'id, empresa_id',
      descarga_ruta: 'id, empresa_id, carga_id',
      descarga_ruta_lineas: 'id, descarga_id',
      syncQueue: '++id, table, createdAt',
      cacheTimestamps: 'table',
    });
  }
}

export const offlineDb = new OfflineDatabase();

// Helper to get a table reference by name
export function getOfflineTable(tableName: string): Table | null {
  try {
    return (offlineDb as any)[tableName] as Table;
  } catch {
    return null;
  }
}
