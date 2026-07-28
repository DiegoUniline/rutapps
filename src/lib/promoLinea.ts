/**
 * Descuento de promoción aplicado A NIVEL DE LÍNEA (opt-in por licencia).
 *
 * Por defecto el motor de promociones descuenta solo en el encabezado
 * (`ventas.total` ya viene neto) y `venta_lineas` conserva el precio de lista.
 * Con la bandera `promo_descuento_linea` activa, al guardar la venta cada línea
 * se guarda YA NETA de su promoción.
 *
 * GARANTÍAS:
 *  - `ventas.total` NO cambia: es el mismo neto que ya se mostraba y con el que
 *    trabajan cobros y saldos (`trg_recalc_venta_saldo`). Cero impacto en dinero.
 *  - El prorrateo es proporcional, así que `total = subtotal + iva + ieps`.
 *  - Nunca descuenta dos veces: el descuento se resta una sola vez, en la línea.
 */
import { isFeatureEnabled } from '@/lib/featureFlags';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ¿Esta licencia guarda las líneas ya netas de promoción? */
export function promoLineaHabilitado(licencia?: string | null): boolean {
  return isFeatureEnabled('promo_descuento_linea', String(licencia ?? '').trim());
}

export interface LineaMontos {
  subtotal: number;
  iva: number;
  ieps: number;
  total: number;
}

/**
 * Resta `descuento` (descuento efectivo de promoción de esa línea) repartiéndolo
 * proporcionalmente entre subtotal / IVA / IEPS.
 */
export function aplicarPromoALinea(montos: LineaMontos, descuento: number): LineaMontos {
  const total = Number(montos.total) || 0;
  const desc = Math.min(Math.max(Number(descuento) || 0, 0), total);
  if (desc <= 0 || total <= 0) return montos;

  const factor = (total - desc) / total;
  const subtotal = r2((Number(montos.subtotal) || 0) * factor);
  const iva = r2((Number(montos.iva) || 0) * factor);
  const ieps = r2((Number(montos.ieps) || 0) * factor);
  // El total manda: se ajusta el subtotal para que cuadre exactamente.
  const nuevoTotal = r2(total - desc);
  return { subtotal: r2(nuevoTotal - iva - ieps) || subtotal, iva, ieps, total: nuevoTotal };
}
