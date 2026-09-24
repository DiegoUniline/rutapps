import { totalEfectivoVenta, type VentaCerradaFields } from '@/lib/ventaCerrada';

export interface UtilidadLinea {
  producto_id?: string | null;
  cantidad?: number | null;
}

export interface UtilidadResultado {
  totalVentas: number;
  costoTotal: number;
  utilidadBruta: number;
  margenPct: number;
}

/**
 * Fuente compartida de verdad para UTILIDAD BRUTA en Dashboard y Reportes.
 *
 * Mantiene la definición vigente de Reportes:
 *   total de ventas efectivo - costo de mercancía
 *
 * - Ventas cerradas parcialmente usan total_efectivo mediante totalEfectivoVenta.
 * - El costo usa el costo actual que Reportes ya utiliza para cada producto.
 * - No descuenta gastos ni devoluciones aquí porque la tarjeta y Reportes
 *   llaman "Utilidad bruta" a esta métrica. La utilidad neta resta gastos aparte.
 */
export function calcularUtilidadBruta(
  ventas: Array<VentaCerradaFields>,
  lineas: UtilidadLinea[],
  costosPorProducto: ReadonlyMap<string, number>,
): UtilidadResultado {
  const totalVentas = ventas.reduce(
    (total, venta) => total + totalEfectivoVenta(venta),
    0,
  );

  const costoTotal = lineas.reduce((total, linea) => {
    const productoId = linea.producto_id ?? '';
    const costoUnitario = Number(costosPorProducto.get(productoId) ?? 0) || 0;
    const cantidad = Number(linea.cantidad ?? 0) || 0;
    return total + (costoUnitario * cantidad);
  }, 0);

  const utilidadBruta = totalVentas - costoTotal;
  const margenPct = totalVentas > 0 ? (utilidadBruta / totalVentas) * 100 : 0;

  return {
    totalVentas,
    costoTotal,
    utilidadBruta,
    margenPct,
  };
}
