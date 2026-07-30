import type { ColumnDef, ColumnPreset } from '@/components/ColumnVisibilityMenu';

// Columnas configurables de la tabla de líneas en el DETALLE de la venta (escritorio).
// `#`, la casilla de acciones y las columnas `required` no se pueden ocultar.
export const VENTA_LINEAS_COLUMNS: ColumnDef[] = [
  { key: 'producto',    label: 'Producto',     required: true, group: 'Básicas' },
  { key: 'cantidad',    label: 'Cantidad',                     group: 'Básicas' },
  { key: 'unidad',      label: 'Unidad',                       group: 'Básicas' },
  { key: 'precioNeto',  label: 'Precio s/imp', sub: 'neto',            group: 'Precio' },
  { key: 'precioBruto', label: 'Precio c/imp', sub: 'con impuestos',   group: 'Precio' },
  { key: 'iva',         label: 'IVA',          sub: 'monto en $',      group: 'Impuestos' },
  { key: 'ieps',        label: 'IEPS',         sub: 'monto en $',      group: 'Impuestos' },
  { key: 'descMan',     label: 'Desc man.',    sub: 'descuento manual',group: 'Descuentos' },
  { key: 'descPromo',   label: 'Desc promo',   sub: 'de promoción',    group: 'Descuentos' },
  { key: 'subtotal',    label: 'Subtotal',     required: true, group: 'Total' },
  { key: 'lote',        label: 'Lote',                         group: 'Otras' },
];

export const VENTA_LINEAS_GROUP_ORDER = ['Básicas', 'Precio', 'Impuestos', 'Descuentos', 'Total', 'Otras'];

// Visibilidad por defecto (solo columnas ocultables). Igual a lo que ya se
// mostraba antes de agregar el selector → sin cambios para quien no lo toque.
export const VENTA_LINEAS_DEFAULT_VISIBILITY: Record<string, boolean> = {
  cantidad: true,
  unidad: true,
  precioNeto: true,
  precioBruto: false,
  iva: true,
  ieps: true,
  descMan: true,
  descPromo: true,
  lote: true,
};

export const VENTA_LINEAS_PRESETS: ColumnPreset[] = [
  { key: 'compacta',  label: 'Compacta',      columns: ['cantidad', 'precioBruto'] },
  { key: 'detallada', label: 'Detallada',     columns: ['cantidad', 'unidad', 'precioNeto', 'iva', 'ieps', 'descMan', 'descPromo', 'lote'] },
  { key: 'fiscal',    label: 'Fiscal (CFDI)', columns: ['cantidad', 'precioNeto', 'descMan', 'descPromo', 'iva', 'ieps'] },
  { key: 'todas',     label: 'Todas',         columns: ['cantidad', 'unidad', 'precioNeto', 'precioBruto', 'iva', 'ieps', 'descMan', 'descPromo', 'lote'] },
];
