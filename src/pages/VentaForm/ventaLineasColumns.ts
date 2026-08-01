import type { ColumnDef, ColumnPreset } from '@/components/ColumnVisibilityMenu';

// Columnas configurables de la tabla de líneas en el DETALLE de la venta (escritorio).
// `#`, la casilla de acciones y las columnas `required` no se pueden ocultar.
export const VENTA_LINEAS_COLUMNS: ColumnDef[] = [
  { key: 'producto',    label: 'Producto',     required: true, group: 'Básicas' },
  { key: 'cantidad',    label: 'Cantidad',                     group: 'Básicas' },
  { key: 'unidad',      label: 'Unidad',                       group: 'Básicas' },
  { key: 'lote',        label: 'Lote',                         group: 'Logística' },
  { key: 'precioNeto',  label: 'Precio s/imp', sub: 'neto unitario',   group: 'Precio' },
  { key: 'precioBruto', label: 'Precio c/imp', sub: 'final unitario', group: 'Precio' },
  { key: 'descMan',     label: 'Desc man.',    sub: 'manual $',        group: 'Descuentos' },
  { key: 'descPromo',   label: 'Desc promo',   sub: 'promoción $',     group: 'Descuentos' },
  { key: 'iva',         label: 'IVA',          sub: 'monto en $',      group: 'Impuestos' },
  { key: 'ieps',        label: 'IEPS',         sub: 'monto en $',      group: 'Impuestos' },
  { key: 'subtotal',    label: 'Subtotal',     required: true,         group: 'Total' },
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
export const VENTA_LINEAS_DESGLOSE_COLUMNS: ColumnDef[] = [
  { key: 'dPromoNombre',    label: 'Promoción',       sub: 'nombre',         group: 'Desglose' },
  { key: 'dCantBonificada', label: 'Cant. regalo',    sub: 'bonificación',   group: 'Desglose' },
  { key: 'dPrecioLista',    label: 'Precio lista',   sub: 'unitario base',  group: 'Desglose' },
  { key: 'dImporteBruto',   label: 'Importe bruto',  sub: 'antes de desc.',  group: 'Desglose' },
  { key: 'dDescTotal',      label: 'Desc. total $',                          group: 'Desglose' },
  { key: 'dBaseIva',        label: 'Base IVA',                               group: 'Desglose' },
  { key: 'dImpuestosTot',   label: 'Impuestos $',     sub: 'IVA + IEPS',     group: 'Desglose' },
  { key: 'dMotivoDescMan',  label: 'Motivo desc.',    sub: 'manual',         group: 'Desglose' },
  // Columnas más técnicas ocultas por defecto
  { key: 'dBaseDescMan',    label: 'Base desc. man.',                        group: 'Desglose' },
  { key: 'dBaseIeps',       label: 'Base IEPS',                              group: 'Desglose' },
  { key: 'dDescPromoMonto', label: 'Desc. promo $',                          group: 'Desglose' },
  { key: 'dDescManMonto',   label: 'Desc. manual $',                         group: 'Desglose' },
  { key: 'dEsBonificacion', label: '¿Es regalo?',                           group: 'Desglose' },
  { key: 'dObjetoImpuesto', label: 'Objeto impuesto', sub: 'SAT',            group: 'Desglose' },
];

export const VENTA_LINEAS_DESGLOSE_KEYS = VENTA_LINEAS_DESGLOSE_COLUMNS.map(c => c.key);

// Visibilidad por defecto del desglose: Solo lo más relevante para el usuario
export const VENTA_LINEAS_DESGLOSE_DEFAULTS: Record<string, boolean> = {
  dPromoNombre: true,
  dCantBonificada: true,
  dPrecioLista: false,
  dImporteBruto: false,
  dDescTotal: true,
  dBaseIva: true,
  dImpuestosTot: true,
  dMotivoDescMan: true,
  dBaseDescMan: false,
  dBaseIeps: false,
  dDescPromoMonto: false,
  dDescManMonto: false,
  dEsBonificacion: false,
  dObjetoImpuesto: false,
};

export const VENTA_LINEAS_DESGLOSE_OFF: Record<string, boolean> = 
  Object.fromEntries(VENTA_LINEAS_DESGLOSE_KEYS.map(k => [k, false]));

export function getVentaLineasColumns(showDesglose: boolean): ColumnDef[] {
  return showDesglose
    ? [...VENTA_LINEAS_COLUMNS, ...VENTA_LINEAS_DESGLOSE_COLUMNS]
    : VENTA_LINEAS_COLUMNS;
}

export function getVentaLineasPresets(showDesglose: boolean): ColumnPreset[] {
  const presets = [...VENTA_LINEAS_PRESETS];
  if (showDesglose) {
    presets.push({ 
      key: 'desglose_audit', 
      label: 'Auditoría Total', 
      columns: ['cantidad', 'precioBruto', 'dPromoNombre', 'dDescTotal', 'dBaseIva', 'dImpuestosTot'] 
    });
  }
  return presets;
}

export const VENTA_LINEAS_DESGLOSE_GROUP_ORDER = VENTA_LINEAS_GROUP_ORDER;
