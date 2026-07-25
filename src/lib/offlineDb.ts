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
  lastError?: string;
  lastAttemptAt?: number;
}


export interface CacheTimestamp {
  table: string;
  lastSync: number;
  // Extended metadata (no schema change needed — Dexie only indexes 'table').
  // lastSync is updated only on success; lastError/lastErrorAt persist failures
  // across reloads so the sync screen can highlight pending tables.
  lastSuccessAt?: number;
  lastError?: string;
  lastErrorAt?: number;
  // Delta incremental por updated_at (reloj del servidor, sin problemas de
  // desfase de reloj del cliente): mayor updated_at ya descargado.
  cursor?: string;
  // Última vez que se hizo una descarga COMPLETA de la tabla (para reconciliar
  // borrados físicos periódicamente en tablas con delta por updated_at).
  lastFullAt?: number;
  // Filas locales tras el último sync (para el gate de frescura de tablas full).
  rowCount?: number;
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
  cotizaciones!: Table;
  cotizacion_lineas!: Table;
  empresas!: Table;
  cliente_pedido_sugerido!: Table;
  unidades!: Table;
  tasas_iva!: Table;
  descarga_ruta!: Table;
  descarga_ruta_lineas!: Table;
  promociones!: Table;
  entregas!: Table;
  entrega_lineas!: Table;
  visitas!: Table;
  tarifa_lineas!: Table;
  tarifas!: Table;
  stock_almacen!: Table;
  stock_apartado!: Table;
  producto_presentaciones!: Table;
  lista_precios!: Table;
  listas!: Table;
  zonas!: Table;
  almacenes!: Table;
  // Sync infrastructure
  syncQueue!: Table<SyncQueueItem, number>;
  cacheTimestamps!: Table<CacheTimestamp, string>;

  constructor() {
    super('UnilineOffline');
    this.version(7).stores({
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
      promociones: 'id, empresa_id, activa',
      entregas: 'id, empresa_id, vendedor_ruta_id, status, pedido_id',
      entrega_lineas: 'id, entrega_id, producto_id',
      visitas: 'id, empresa_id, cliente_id, user_id, tipo, fecha',
      tarifa_lineas: 'id, tarifa_id, lista_precio_id, aplica_a',
      tarifas: 'id, empresa_id, tipo, activa',
      stock_almacen: 'id, empresa_id, almacen_id, producto_id',
      producto_presentaciones: 'id, empresa_id, producto_id, activo',
      syncQueue: '++id, table, createdAt',
      cacheTimestamps: 'table',
    });
    // v8: cache lista_precios + listas for offline client creation
    this.version(8).stores({
      lista_precios: 'id, empresa_id, tarifa_id, es_principal, activa',
      listas: 'id, empresa_id',
    });
    // v9: cache cotizaciones for offline list view
    this.version(9).stores({
      cotizaciones: 'id, empresa_id, cliente_id, vendedor_id, estado, fecha, created_at',
      cotizacion_lineas: 'id, cotizacion_id, producto_id',
    });
    // v10: cache zonas + almacenes for offline client/entrega forms
    this.version(10).stores({
      zonas: 'id, empresa_id, activo',
      almacenes: 'id, empresa_id, activo, es_merma',
    });
    // v11: cache stock reservations so mobile orders can calculate
    // disponible = stock_almacen - stock_apartado even without signal.
    this.version(11).stores({
      stock_apartado: 'id, empresa_id, almacen_id, producto_id, venta_id, venta_linea_id',
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
