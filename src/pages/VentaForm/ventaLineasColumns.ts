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

// ── Desglose completo por línea (solo licencias con la bandera
// `venta_linea_desglose` activa). Son columnas 100% informativas que leen los
// campos guardados en `venta_lineas`; no recalculan nada.
export const VENTA_LINEAS_DESGLOSE_COLUMNS: ColumnDef[] = [
  { key: 'dPrecioLista',    label: 'Precio lista',   sub: 'unitario s/desc', group: 'Desglose' },
  { key: 'dImporteBruto',   label: 'Importe bruto',  sub: 'antes de desc.',  group: 'Desglose' },
  { key: 'dDescPromoMonto', label: 'Desc. promo $',                          group: 'Desglose' },
  { key: 'dBaseDescMan',    label: 'Base desc. man.',                        group: 'Desglose' },
  { key: 'dDescManMonto',   label: 'Desc. manual $',                         group: 'Desglose' },
  { key: 'dDescTotal',      label: 'Desc. total $',                          group: 'Desglose' },
  { key: 'dBaseIeps',       label: 'Base IEPS',                              group: 'Desglose' },
  { key: 'dBaseIva',        label: 'Base IVA',                               group: 'Desglose' },
  { key: 'dImpuestosTot',   label: 'Impuestos $',     sub: 'IVA + IEPS',     group: 'Desglose' },
  { key: 'dPromoNombre',    label: 'Promoción',       sub: 'nombre',         group: 'Desglose' },
  { key: 'dCantBonificada', label: 'Cant. bonificada',                       group: 'Desglose' },
  { key: 'dEsBonificacion', label: '¿Bonificación?',                         group: 'Desglose' },
  { key: 'dMotivoDescMan',  label: 'Motivo desc.',    sub: 'manual',         group: 'Desglose' },
  { key: 'dObjetoImpuesto', label: 'Objeto impuesto', sub: 'SAT',            group: 'Desglose' },
];

export const VENTA_LINEAS_DESGLOSE_KEYS = VENTA_LINEAS_DESGLOSE_COLUMNS.map(c => c.key);

/** Todas las columnas OFF por defecto (no cambian la vista actual de nadie). */
export const VENTA_LINEAS_DESGLOSE_DEFAULTS: Record<string, boolean> =
  Object.fromEntries(VENTA_LINEAS_DESGLOSE_KEYS.map(k => [k, false]));

/** Fuerza apagadas las columnas de desglose (licencias sin la bandera). */
export const VENTA_LINEAS_DESGLOSE_OFF: Record<string, boolean> = VENTA_LINEAS_DESGLOSE_DEFAULTS;

export function getVentaLineasColumns(showDesglose: boolean): ColumnDef[] {
  return showDesglose
    ? [...VENTA_LINEAS_COLUMNS, ...VENTA_LINEAS_DESGLOSE_COLUMNS]
    : VENTA_LINEAS_COLUMNS;
}

export function getVentaLineasPresets(showDesglose: boolean): ColumnPreset[] {
  if (!showDesglose) return VENTA_LINEAS_PRESETS;
  return [
    ...VENTA_LINEAS_PRESETS,
    { key: 'desglose', label: 'Desglose completo', columns: ['cantidad', 'unidad', 'precioNeto', 'precioBruto', 'iva', 'ieps', 'descMan', 'descPromo', ...VENTA_LINEAS_DESGLOSE_KEYS] },
  ];
}

export const VENTA_LINEAS_DESGLOSE_GROUP_ORDER = [...VENTA_LINEAS_GROUP_ORDER, 'Desglose'];
