export type StatusProducto = 'activo' | 'inactivo' | 'borrador';
export type StatusCliente = 'activo' | 'inactivo' | 'suspendido';
export type FrecuenciaVisita = 'diaria' | 'semanal' | 'quincenal' | 'mensual';
export type TipoComision = 'porcentaje' | 'monto_fijo';
export type CalculoCosto = 'promedio' | 'ultimo' | 'estandar' | 'manual' | 'ultimo_compra' | 'ultimo_proveedor';
export type TipoTarifa = 'general' | 'por_cliente' | 'por_ruta';
export type AplicaATarifa = 'todos' | 'categoria' | 'producto';
export type TipoCalculoTarifa = 'margen_costo' | 'descuento_precio' | 'precio_fijo';
export type TipoVenta = 'pedido' | 'venta_directa';
export type CondicionPago = 'contado' | 'credito' | 'por_definir';
export type StatusVenta = 'borrador' | 'confirmado' | 'entregado' | 'facturado' | 'cancelado';

export interface Producto {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  clave_alterna?: string;
  marca_id?: string;
  proveedor_id?: string;
  costo: number;
  clasificacion_id?: string;
  lista_id?: string;
  imagen_url?: string;
  precio_principal: number;
  se_puede_comprar: boolean;
  se_puede_vender: boolean;
  vender_sin_stock: boolean;
  se_puede_inventariar: boolean;
  es_combo: boolean;
  min: number;
  max: number;
  manejar_lotes: boolean;
  unidad_compra_id?: string;
  unidad_venta_id?: string;
  factor_conversion: number;
  permitir_descuento: boolean;
  monto_maximo: number;
  cantidad: number;
  tiene_comision: boolean;
  tipo_comision: TipoComision;
  pct_comision: number;
  status: StatusProducto;
  almacenes: string[];
  tiene_iva: boolean;
  tiene_ieps: boolean;
  tasa_iva_id?: string;
  tasa_ieps_id?: string;
  iva_pct: number;
  ieps_pct: number;
  ieps_tipo: 'porcentaje' | 'cuota';
  costo_incluye_impuestos: boolean;
  calculo_costo: CalculoCosto;
  codigo_sat?: string;
  udem_sat_id?: string;
  contador: number;
  contador_tarifas: number;
  created_at: string;
  // joined
  marcas?: { nombre: string };
}

export interface Tarifa {
  id: string;
  empresa_id: string;
  nombre: string;
  descripcion?: string;
  tipo: TipoTarifa;
  moneda: string;
  vigencia_inicio?: string;
  vigencia_fin?: string;
  activa: boolean;
  created_at: string;
  tarifa_lineas?: TarifaLinea[];
}

export type RedondeoTarifa = 'ninguno' | 'arriba' | 'abajo' | 'cercano';

export interface TarifaLinea {
  id: string;
  tarifa_id: string;
  producto_ids: string[];
  clasificacion_ids: string[];
  aplica_a: AplicaATarifa;
  tipo_calculo: TipoCalculoTarifa;
  precio: number;
  precio_minimo: number;
  descuento_max: number;
  margen_pct: number;
  descuento_pct: number;
  redondeo: RedondeoTarifa;
  notas?: string;
  created_at: string;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  codigo?: string;
  nombre: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  rfc?: string;
  notas?: string;
  gps_lat?: number;
  gps_lng?: number;
  colonia?: string;
  zona_id?: string;
  frecuencia?: FrecuenciaVisita;
  dia_visita?: string[];
  lista_id?: string;
  vendedor_id?: string;
  cobrador_id?: string;
  credito?: boolean;
  limite_credito?: number;
  dias_credito?: number;
  foto_url?: string;
  foto_fachada_url?: string;
  fecha_alta?: string;
  orden?: number;
  tarifa_id?: string;
  status?: StatusCliente;
  // Facturación
  requiere_factura?: boolean;
  facturama_rfc?: string;
  facturama_razon_social?: string;
  facturama_regimen_fiscal?: string;
  facturama_uso_cfdi?: string;
  facturama_cp?: string;
  facturama_correo_facturacion?: string;
  facturama_id?: string;
  created_at: string;
  // joined
  zonas?: { nombre: string };
  listas?: { nombre: string };
  vendedores?: { nombre: string };
  cobradores?: { nombre: string };
  tarifas?: { nombre: string };
}

export interface Marca { id: string; empresa_id: string; nombre: string; }
export interface Proveedor { id: string; empresa_id: string; nombre: string; }
export interface Clasificacion { id: string; empresa_id: string; nombre: string; }
export interface Lista { id: string; empresa_id: string; nombre: string; }
export interface Unidad { id: string; empresa_id: string; nombre: string; abreviatura?: string; }
export interface TasaIva { id: string; empresa_id: string; nombre: string; porcentaje: number; }
export interface TasaIeps { id: string; empresa_id: string; nombre: string; porcentaje: number; }
export interface Almacen { id: string; empresa_id: string; nombre: string; }
export interface UnidadSat { id: string; clave: string; nombre: string; }
export interface Zona { id: string; empresa_id: string; nombre: string; }
export interface Vendedor { id: string; empresa_id: string; nombre: string; }
export interface Cobrador { id: string; empresa_id: string; nombre: string; }
export interface Profile { id: string; user_id: string; empresa_id: string; nombre?: string; avatar_url?: string; almacen_id?: string; vendedor_id?: string; must_change_password?: boolean; }
export interface Empresa {
  id: string;
  nombre: string;
  razon_social?: string;
  rfc?: string;
  regimen_fiscal?: string;
  direccion?: string;
  colonia?: string;
  ciudad?: string;
  estado?: string;
  cp?: string;
  telefono?: string;
  email?: string;
  logo_url?: string;
  notas_ticket?: string;
  moneda?: string;
}

export interface Gasto {
  id: string;
  empresa_id: string;
  vendedor_id?: string;
  user_id: string;
  fecha: string;
  concepto: string;
  monto: number;
  foto_url?: string;
  notas?: string;
  created_at: string;
}

export interface Venta {
  id: string;
  empresa_id: string;
  folio?: string;
  tipo: TipoVenta;
  status: StatusVenta;
  cliente_id?: string;
  vendedor_id?: string;
  condicion_pago: CondicionPago;
  tarifa_id?: string;
  almacen_id?: string;
  fecha: string;
  fecha_entrega?: string;
  entrega_inmediata: boolean;
  notas?: string;
  subtotal: number;
  descuento_total: number;
  iva_total: number;
  ieps_total: number;
  total: number;
  saldo_pendiente?: number;
  created_at: string;
  // joined
  clientes?: { nombre: string };
  vendedores?: { nombre: string };
  tarifas?: { nombre: string };
  almacenes?: { nombre: string };
  venta_lineas?: VentaLinea[];
}

export interface VentaLinea {
  id: string;
  venta_id: string;
  producto_id?: string;
  descripcion?: string;
  cantidad: number;
  unidad_id?: string;
  precio_unitario: number;
  descuento_pct: number;
  subtotal: number;
  iva_pct: number;
  ieps_pct: number;
  iva_monto: number;
  ieps_monto: number;
  total: number;
  notas?: string;
  facturado?: boolean;
  factura_cfdi_id?: string;
  created_at: string;
  // joined
  productos?: { id: string; codigo: string; nombre: string; precio_principal: number; tiene_iva: boolean; tiene_ieps: boolean; tasa_iva_id: string | null; tasa_ieps_id: string | null; unidad_venta_id: string | null; codigo_sat?: string; udem_sat_id?: string };
  unidades?: { nombre: string; abreviatura?: string };
}
