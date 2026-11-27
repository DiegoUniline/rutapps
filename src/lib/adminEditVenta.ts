const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface LineaAdminInput {
  cantidad: number;
  iva_pct: number;
  ieps_pct: number;
  descuento_pct: number;
  /** Precio unitario CON impuestos y ANTES del descuento (precio de lista). El descuento lo baja. */
  brutoUnit: number;
}

/**
 * Montos de una línea corregida desde Admin, con el mismo criterio que calculateSaleLineAmounts:
 * subtotal = neto ANTES del descuento; el descuento se resta y los impuestos van sobre lo que queda.
 * (Antes el precio capturado se tomaba como ya descontado y el % se usaba para INFLAR el subtotal:
 * poner 5 % subía el precio de lista y el total no bajaba. Tampico PED-12342, 20-nov.)
 */
export function calcularLineaAdmin(r: LineaAdminInput) {
  const mult = (1 + r.ieps_pct / 100) * (1 + r.iva_pct / 100);
  const subtotal = r2((r.brutoUnit * r.cantidad) / (mult > 0 ? mult : 1));
  const descuento = r2(subtotal * (Math.min(Math.max(r.descuento_pct, 0), 100) / 100));
  const base = r2(subtotal - descuento);
  const ieps = r2(base * (r.ieps_pct / 100));
  const iva = r2((base + ieps) * (r.iva_pct / 100));
  return { subtotal, iva, ieps, total: r2(base + ieps + iva) };
}

/** Precio c/imp. antes del descuento para precargar el diálogo desde un renglón guardado. */
export function precioListaConImpuestos(l: { precio_unitario?: number | null; iva_pct?: number | null; ieps_pct?: number | null }) {
  const mult = (1 + (Number(l.ieps_pct) || 0) / 100) * (1 + (Number(l.iva_pct) || 0) / 100);
  return r2((Number(l.precio_unitario) || 0) * mult);
}
