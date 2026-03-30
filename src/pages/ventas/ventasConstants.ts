import type { ExportColumn } from '@/lib/exportUtils';

export const VENTAS_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
  { key: 'cliente_nombre', header: 'Cliente', width: 25 },
  { key: 'tipo', header: 'Tipo', width: 14 },
  { key: 'condicion_pago', header: 'Condición', width: 12 },
  { key: 'subtotal', header: 'Subtotal', format: 'currency', width: 14 },
  { key: 'descuento_total', header: 'Descuento', format: 'currency', width: 14 },
  { key: 'iva_total', header: 'IVA', format: 'currency', width: 12 },
  { key: 'total', header: 'Total', format: 'currency', width: 14 },
  { key: 'saldo_pendiente', header: 'Saldo', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
];

export const CONDICION_LABELS: Record<string, string> = {
  contado: 'Contado',
  credito: 'Crédito',
  por_definir: 'Por definir',
};

export const TIPO_LABELS: Record<string, string> = {
  pedido: 'Pedido',
  venta_directa: 'Venta directa',
};

export const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  facturado: 'Facturado',
  cancelado: 'Cancelado',
};

export const STATIC_FILTER_OPTIONS = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { value: 'pedido', label: 'Pedido' },
      { value: 'venta_directa', label: 'Venta directa' },
    ],
  },
  {
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'borrador', label: 'Borrador' },
      { value: 'confirmado', label: 'Confirmado' },
      { value: 'entregado', label: 'Entregado' },
      { value: 'facturado', label: 'Facturado' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  {
    key: 'condicion_pago',
    label: 'Condición',
    options: [
      { value: 'contado', label: 'Contado' },
      { value: 'credito', label: 'Crédito' },
      { value: 'por_definir', label: 'Por definir' },
    ],
  },
];

export const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'condicion_pago', label: 'Condición de pago' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
  { value: 'fecha_anio', label: 'Año' },
  { value: 'fecha_mes', label: 'Mes' },
];
