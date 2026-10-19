const DAY_MS = 86_400_000;

/**
 * Días de crédito de una venta, derivados de su `fecha_vencimiento` (snapshot de la
 * política de cobro). `ventas` no tiene columna `dias_credito`; sin vencimiento la
 * venta vence el mismo día de su fecha (0 días).
 */
export function diasCreditoVenta(fecha: string, fechaVencimiento: string | null | undefined): number {
  if (!fechaVencimiento) return 0;
  const inicio = Date.parse(fecha.slice(0, 10));
  const vence = Date.parse(fechaVencimiento.slice(0, 10));
  if (!Number.isFinite(inicio) || !Number.isFinite(vence)) return 0;
  return Math.max(0, Math.round((vence - inicio) / DAY_MS));
}

/**
 * Porcentaje de descuento de una venta sobre su `subtotal` (importe antes de descuentos
 * e impuestos). `ventas` no tiene `descuento_porcentaje`; se deriva de `descuento_total`.
 */
export function descuentoPctVenta(subtotal: number | null | undefined, descuentoTotal: number | null | undefined): number {
  const base = Number(subtotal ?? 0);
  const desc = Number(descuentoTotal ?? 0);
  if (!(base > 0) || !(desc > 0)) return 0;
  return Math.round((desc / base) * 10_000) / 100;
}
