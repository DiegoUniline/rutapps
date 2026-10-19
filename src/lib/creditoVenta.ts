const DAY_MS = 86_400_000;

/**
 * Días de crédito de una venta, derivados de su `fecha_vencimiento` (snapshot de la
 * política de cobro). `ventas` no tiene columna `dias_credito`. Sin vencimiento se
 * aplican los días de crédito actuales del cliente (D-004).
 */
export function diasCreditoVenta(fecha: string, fechaVencimiento: string | null | undefined, diasCliente?: number | null): number {
  if (!fechaVencimiento) return Math.max(0, Number(diasCliente) || 0);
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
