/** Cantidad neta de una venta: lo vendido menos lo devuelto (todas las unidades sumadas). */
export interface VentaConCantidades {
  cantidad_neta?: number | string | null;
  venta_lineas?: { cantidad?: number | string | null }[] | null;
  devoluciones?: { devolucion_lineas?: { cantidad?: number | string | null }[] | null }[] | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function cantidadNetaVenta(v: VentaConCantidades): number {
  if (v.cantidad_neta != null) return r3(Number(v.cantidad_neta) || 0);
  const vendida = (v.venta_lineas ?? []).reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const devuelta = (v.devoluciones ?? []).reduce(
    (s, d) => s + (d.devolucion_lineas ?? []).reduce((t, l) => t + (Number(l.cantidad) || 0), 0), 0);
  return r3(Math.max(0, vendida - devuelta));
}
