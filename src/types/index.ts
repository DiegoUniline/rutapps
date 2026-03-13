export type StatusProducto = 'activo' | 'inactivo' | 'borrador';
export type StatusCliente = 'activo' | 'inactivo' | 'suspendido';
export type FrecuenciaVisita = 'diaria' | 'semanal' | 'quincenal' | 'mensual';
export type TipoComision = 'porcentaje' | 'monto_fijo';
export type CalculoCosto = 'promedio' | 'ultimo' | 'estandar' | 'manual';
export type TipoTarifa = 'general' | 'por_cliente' | 'por_ruta';
export type AplicaATarifa = 'todos' | 'categoria' | 'producto';
export type TipoCalculoTarifa = 'margen_costo' | 'descuento_precio' | 'precio_fijo';

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
export interface Profile { id: string; user_id: string; empresa_id: string; nombre?: string; avatar_url?: string; }
export interface Empresa { id: string; nombre: string; }
