const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface LineaAdminInput {
  cantidad: number;
  iva_pct: number;
  ieps_pct: number;
  descuento_pct: number;
  /** Precio unitario CON impuestos, ya neto de descuento (lo que se cobra). */
  brutoUnit: number;
}

/**
 * Montos de una línea corregida desde Admin. El subtotal va ANTES del descuento
 * (igual que calculateSaleLineAmounts): la BD calcula descuento_total =
 * subtotal × descuento_pct y total = subtotal − descuento + impuestos.
 */
export function calcularLineaAdmin(r: LineaAdminInput) {
  const totalNeto = r2(r.brutoUnit * r.cantidad);
  const base = totalNeto / ((1 + r.ieps_pct / 100) * (1 + r.iva_pct / 100));
  const ieps = r2(base * (r.ieps_pct / 100));
  const iva = r2((base + ieps) * (r.iva_pct / 100));
  const baseNeta = r2(totalNeto - ieps - iva);
  const factor = 1 - r.descuento_pct / 100;
  const subtotal = factor > 0 ? r2(baseNeta / factor) : baseNeta;
  return { subtotal, iva, ieps, total: totalNeto };
}
