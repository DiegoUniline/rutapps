export interface HistoricalStockRow {
  producto_id: string;
  codigo: string;
  producto: string;
  producto_status: string;
  categoria_id: string | null;
  categoria: string | null;
  marca_id: string | null;
  marca: string | null;
  proveedor_id: string | null;
  proveedor: string | null;
  unidad: string | null;
  costo_actual: number;
  almacen_id: string;
  almacen: string;
  ubicacion_tipo: string;
  ubicacion_activa: boolean;
  cantidad: number;
  cantidad_actual: number;
  diferencia_actual: number;
  movimientos_posteriores: number;
}

export type HistoricalLocationFilter = 'todas' | 'almacenes' | 'rutas';
export type HistoricalQuantityFilter = 'todos' | 'con_stock' | 'sin_stock' | 'negativos';

export interface HistoricalStockFilters {
  search: string;
  locationType: HistoricalLocationFilter;
  quantity: HistoricalQuantityFilter;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
}

export function locationDelta(
  quantity: number,
  selectedLocationId: string,
  originId?: string | null,
  destinationId?: string | null,
): number {
  const value = Number(quantity) || 0;
  return (destinationId === selectedLocationId ? value : 0)
    - (originId === selectedLocationId ? value : 0);
}

export function historicalStockFromCurrent(current: number, laterDeltas: number[]): number {
  return laterDeltas.reduce((stock, delta) => stock - delta, Number(current) || 0);
}

export function filterHistoricalStockRows(
  rows: HistoricalStockRow[],
  filters: HistoricalStockFilters,
): HistoricalStockRow[] {
  const search = filters.search.trim().toLocaleLowerCase('es-MX');
  return rows.filter((row) => {
    const isRoute = row.ubicacion_tipo === 'ruta';
    if (filters.locationType === 'rutas' && !isRoute) return false;
    if (filters.locationType === 'almacenes' && isRoute) return false;
    if (filters.quantity === 'con_stock' && row.cantidad <= 0) return false;
    if (filters.quantity === 'sin_stock' && row.cantidad !== 0) return false;
    if (filters.quantity === 'negativos' && row.cantidad >= 0) return false;
    if (filters.categoryId && row.categoria_id !== filters.categoryId) return false;
    if (filters.brandId && row.marca_id !== filters.brandId) return false;
    if (filters.supplierId && row.proveedor_id !== filters.supplierId) return false;
    if (search) {
      const haystack = [
        row.codigo, row.producto, row.almacen, row.categoria,
        row.marca, row.proveedor,
      ].filter(Boolean).join(' ').toLocaleLowerCase('es-MX');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function subtractDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

