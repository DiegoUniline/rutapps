export interface CompraLinea {
  id?: string;
  compra_id?: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  total: number;
  _tiene_iva: boolean;
  _iva_pct: number;
  _tiene_ieps: boolean;
  _ieps_pct: number;
  _ieps_tipo: string;
  _unidad_compra: string;
  _factor_conversion: number;
  _piezas_total: number;
  productos?: { id: string; codigo: string; nombre: string; costo: number };
}

export function emptyLine(): Partial<CompraLinea> {
  return { cantidad: 1, precio_unitario: 0, subtotal: 0, total: 0, _tiene_iva: false, _iva_pct: 16, _tiene_ieps: false, _ieps_pct: 0, _ieps_tipo: 'porcentaje', _unidad_compra: '', _factor_conversion: 1, _piezas_total: 1 };
}

export function calcLineTotals(line: Partial<CompraLinea>) {
  const cant = Number(line.cantidad) || 0;
  const precio = Number(line.precio_unitario) || 0;
  const base = cant * precio;
  let iepsAmount = 0;
  if (line._tiene_ieps) {
    iepsAmount = line._ieps_tipo === 'cuota' ? cant * (Number(line._ieps_pct) || 0) : base * ((Number(line._ieps_pct) || 0) / 100);
  }
  const baseConIeps = base + iepsAmount;
  const ivaAmount = line._tiene_iva ? baseConIeps * ((Number(line._iva_pct) || 0) / 100) : 0;
  line.subtotal = base;
  line.total = base + iepsAmount + ivaAmount;
  line._piezas_total = cant * (Number(line._factor_conversion) || 1);
  return line;
}

export const COMPRA_STEPS = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'pagada', label: 'Pagada' },
  { key: 'cancelada', label: 'Cancelada' },
];
