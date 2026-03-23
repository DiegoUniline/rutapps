import type { TarifaLineaRule } from '@/lib/priceResolver';

export const reglaPrecioFijo: TarifaLineaRule = {
  aplica_a: 'producto',
  producto_ids: ['prod-001'],
  clasificacion_ids: [],
  tipo_calculo: 'precio_fijo',
  precio: 12,
  precio_minimo: null,
  margen_pct: null,
  descuento_pct: null,
  redondeo: 'ninguno',
  base_precio: 'sin_impuestos',
  lista_precio_id: null,
};

export const reglaMargenCosto: TarifaLineaRule = {
  aplica_a: 'todos',
  producto_ids: [],
  clasificacion_ids: [],
  tipo_calculo: 'margen_costo',
  precio: 0,
  precio_minimo: 8,
  margen_pct: 50,
  descuento_pct: null,
  redondeo: 'arriba',
  base_precio: 'sin_impuestos',
  lista_precio_id: null,
};

export const reglaDescuento: TarifaLineaRule = {
  aplica_a: 'categoria',
  producto_ids: [],
  clasificacion_ids: ['cat-001'],
  tipo_calculo: 'descuento_precio',
  precio: 0,
  precio_minimo: null,
  margen_pct: null,
  descuento_pct: 10,
  redondeo: 'ninguno',
  base_precio: 'sin_impuestos',
  lista_precio_id: null,
};
