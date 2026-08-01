import type { ColumnDef, ColumnPreset } from '@/components/ColumnVisibilityMenu';

// Columnas configurables de la tabla de líneas en el DETALLE de la venta (escritorio).
// `#`, la casilla de acciones y las columnas `required` no se pueden ocultar.
export const VENTA_LINEAS_COLUMNS: ColumnDef[] = [
  { key: 'cantidad',    label: 'Cantidad',                     group: 'Básicas' },
  { key: 'producto',    label: 'Producto',     required: true, group: 'Básicas' },
  { key: 'unidad',      label: 'Unidad',                       group: 'Básicas' },
  { key: 'lote',        label: 'Lote',                         group: 'Logística' },
  { key: 'precioBruto', label: 'Precio c/imp', sub: 'bruto unitario',  group: 'Precio' },
  { key: 'precioNeto',  label: 'Precio s/imp', sub: 'neto unitario',   group: 'Precio' },
  { key: 'descPromo',   label: 'Desc promo',   sub: 'promoción $',     group: 'Descuentos' },
  { key: 'descMan',     label: 'Desc man.',    sub: 'manual %',        group: 'Descuentos' },
  { key: 'iva',         label: 'IVA',          sub: 'monto en $',      group: 'Impuestos' },
  { key: 'ieps',        label: 'IEPS',         sub: 'monto en $',      group: 'Impuestos' },
  { key: 'subtotal',    label: 'Total línea',  required: true,         group: 'Total' },
];

export const VENTA_LINEAS_GROUP_ORDER = ['Básicas', 'Logística', 'Precio', 'Descuentos', 'Impuestos', 'Total', 'Otras', 'Desglose'];

// Visibilidad por defecto (solo columnas ocultables). 
// Recomendación: Mantener lo esencial para no saturar, pero con impuestos visibles.
export const VENTA_LINEAS_DEFAULT_VISIBILITY: Record<string, boolean> = {
  cantidad: true,
  unidad: true,
  lote: false,
  precioNeto: true,
  precioBruto: true, 
  descMan: true,
  descPromo: true,
  iva: true,
  ieps: false,
};

export const VENTA_LINEAS_PRESETS: ColumnPreset[] = [
  { key: 'comercial', label: 'Vista Comercial', columns: ['cantidad', 'unidad', 'precioBruto', 'descMan', 'descPromo'] },
  { key: 'fiscal',    label: 'Vista Fiscal',    columns: ['cantidad', 'unidad', 'precioNeto', 'iva', 'ieps'] },
  { key: 'operativa', label: 'Vista Logística', columns: ['cantidad', 'unidad', 'lote'] },
  { key: 'todas',     label: 'Todas',           columns: ['cantidad', 'unidad', 'lote', 'precioNeto', 'precioBruto', 'descMan', 'descPromo', 'iva', 'ieps'] },
];

// ── Desglose completo por línea ──
// Columnas 100% informativas que leen los campos guardados en `venta_lineas`.
// ORDEN SECUENCIAL: Compra → Descuentos → Impuestos → Total
export const VENTA_LINEAS_DESGLOSE_COLUMNS: ColumnDef[] = [
  // PASO 1: PRECIOS
  { key: 'dCosto',          label: 'Costo',           sub: 'unit. producto',      group: 'Desglose' },
  { key: 'dPrecioLista',    label: 'Precio S/Imp.',   sub: 'unit. sin impuestos', group: 'Desglose' },
  { key: 'dSubtotalNeto',   label: 'Subtotal S/Imp.', sub: 'precio s/imp × cant.', group: 'Desglose' },

  { key: 'dImpuestosMonto', label: 'Impuestos $',     sub: 'unit. s/desc.',       group: 'Desglose' },
  { key: 'dImporteBruto',   label: 'Precio',          sub: 'unit. c/imp',         group: 'Desglose' },
  { key: 'dSubtotalBruto',  label: 'Subtotal',        sub: 'precio × cantidad',   group: 'Desglose' },

  // PASO 2: DESCUENTOS
  { key: 'dDescTotal',      label: 'Descuento',       sub: 'promo + manual',      group: 'Desglose' },
  { key: 'dDescPromoMonto', label: 'Desc. promo $',   sub: 'dDescPromoMonto',     group: 'Desglose' },
  { key: 'dCantBonificada', label: 'Cant. regalo',    sub: 'dCantBonificada',     group: 'Desglose' },
  { key: 'dDescManMonto',   label: 'Desc. manual $',  sub: 'dDescManMonto',       group: 'Desglose' },

  // PASO 3: TOTAL LÍNEA
  { key: 'dTotal',          label: 'Total',           sub: 'total línea',        group: 'Desglose' },

  // PASO 4: IMPUESTOS (%) Y PROMOCIÓN
  { key: 'dImpuestosPct',   label: 'Impuestos',       sub: '% aplicado',         group: 'Desglose' },
  { key: 'dPromoNombre',    label: 'Promo aplicada',  sub: 'nombre',             group: 'Desglose' },

  // PASO 5: BASES E IMPORTES DE IMPUESTOS
  { key: 'dBaseDescMan',    label: 'Base neta',       sub: 'dBaseDescMan',       group: 'Desglose' },
  { key: 'dBaseIeps',       label: 'Base IEPS',       sub: 'dBaseIeps',          group: 'Desglose' },
  { key: 'dIepsMontoUnit',  label: 'IEPS $',          sub: 'monto',              group: 'Desglose' },
  { key: 'dBaseIva',        label: 'Base IVA',        sub: 'dBaseIva',          group: 'Desglose' },
  { key: 'dIvaMontoUnit',   label: 'IVA $',           sub: 'monto',              group: 'Desglose' },

  // ADICIONALES
  { key: 'dMotivoDescMan',  label: 'Motivo desc.',    sub: 'manual',             group: 'Desglose' },
  { key: 'dEsBonificacion', label: '¿Es regalo?',     sub: 'boolean',            group: 'Desglose' },
  { key: 'dObjetoImpuesto', label: 'Objeto impuesto', sub: 'SAT',                group: 'Desglose' },
];

export const VENTA_LINEAS_DESGLOSE_KEYS = VENTA_LINEAS_DESGLOSE_COLUMNS.map(c => c.key);

// Visibilidad por defecto: Cantidad, Producto, Unidad, Precio S/Imp., Precio,
// Subtotal, Descuento, Total, Impuestos (%) y Promo aplicada.
export const VENTA_LINEAS_DESGLOSE_DEFAULTS: Record<string, boolean> = {
  dCosto: true,
  dPrecioLista: true,
  dSubtotalNeto: false,

  dImpuestosMonto: true,
  dImporteBruto: true,
  dSubtotalBruto: true,

  dDescTotal: true,
  dDescPromoMonto: false,
  dCantBonificada: false,
  dDescManMonto: false,

  dTotal: true,

  dImpuestosPct: true,
  dPromoNombre: true,

  dBaseDescMan: false,
  dBaseIeps: false,
  dIepsMontoUnit: false,
  dBaseIva: false,
  dIvaMontoUnit: false,

  dMotivoDescMan: false,
  dEsBonificacion: false,
  dObjetoImpuesto: false,
};

export const VENTA_LINEAS_DESGLOSE_OFF: Record<string, boolean> = 
  Object.fromEntries(VENTA_LINEAS_DESGLOSE_KEYS.map(k => [k, false]));

// ── Columnas FINALES ──
// Únicas columnas que se ofrecen en el selector cuando el desglose está activo.
// El resto quedan ocultas (no se muestran ni se pueden encender).
export const VENTA_LINEAS_FINAL_KEYS = [
  'cantidad', 'producto', 'unidad',
  'dCosto', 'dPrecioLista', 'dImpuestosMonto', 'dImporteBruto', 'dSubtotalBruto',
  'dDescTotal', 'dTotal', 'dImpuestosPct', 'dPromoNombre',
];

/** Fuerza en `false` toda columna que no esté en el set final. */
export const VENTA_LINEAS_NON_FINAL_OFF: Record<string, boolean> = Object.fromEntries(
  [...VENTA_LINEAS_COLUMNS, ...VENTA_LINEAS_DESGLOSE_COLUMNS]
    .map(c => c.key)
    .filter(k => !VENTA_LINEAS_FINAL_KEYS.includes(k))
    .map(k => [k, false]),
);

export function getVentaLineasColumns(showDesglose: boolean): ColumnDef[] {
  const all = [...VENTA_LINEAS_COLUMNS, ...VENTA_LINEAS_DESGLOSE_COLUMNS];
  if (!showDesglose) return VENTA_LINEAS_COLUMNS;
  return VENTA_LINEAS_FINAL_KEYS
    .map(k => all.find(c => c.key === k))
    .filter((c): c is ColumnDef => !!c);
}

export const VENTA_LINEAS_DESGLOSE_GROUP_ORDER = VENTA_LINEAS_GROUP_ORDER;

