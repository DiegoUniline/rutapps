export type StatusProducto = 'activo' | 'inactivo' | 'borrador';
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
  producto_id: string;
  precio: number;
  precio_minimo: number;
  descuento_max: number;
  notas?: string;
  created_at: string;
  productos?: { codigo: string; nombre: string };
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
export interface Profile { id: string; user_id: string; empresa_id: string; nombre?: string; avatar_url?: string; }
export interface Empresa { id: string; nombre: string; }
