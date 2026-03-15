/**
 * Tax calculation utilities
 * 
 * IVA is calculated ON TOP of IEPS (Mexican standard):
 *   base_ieps = precio * ieps_pct / 100
 *   base_iva  = (precio + base_ieps) * iva_pct / 100
 *   total     = precio + base_ieps + base_iva
 * 
 * If costo_incluye_impuestos = true, the system extracts taxes from the gross amount.
 */

export interface TaxInput {
  precio: number;       // base price or gross price
  iva_pct: number;      // e.g. 16
  ieps_pct: number;     // e.g. 8
  incluye_impuestos?: boolean;
}

export interface TaxBreakdown {
  precio_neto: number;  // price without taxes
  ieps_monto: number;
  iva_monto: number;
  total: number;        // price with all taxes
}

/**
 * Calculate taxes given a price and rates.
 * If incluye_impuestos = true, precio is the gross (tax-inclusive) amount
 * and we extract the net price.
 */
export function calcTax({ precio, iva_pct, ieps_pct, incluye_impuestos }: TaxInput): TaxBreakdown {
  if (incluye_impuestos) {
    // Extract taxes from gross amount
    // total = neto * (1 + ieps_pct/100) * (1 + iva_pct/100)  ... IVA on (neto + IEPS)
    // Actually: total = neto + neto*ieps/100 + (neto + neto*ieps/100)*iva/100
    //         = neto * (1 + ieps/100) * (1 + iva/100)
    const factor = (1 + (ieps_pct || 0) / 100) * (1 + (iva_pct || 0) / 100);
    const precio_neto = factor > 0 ? precio / factor : precio;
    const ieps_monto = precio_neto * (ieps_pct || 0) / 100;
    const iva_monto = (precio_neto + ieps_monto) * (iva_pct || 0) / 100;
    return {
      precio_neto: round2(precio_neto),
      ieps_monto: round2(ieps_monto),
      iva_monto: round2(iva_monto),
      total: round2(precio),
    };
  }

  // Normal: precio is net
  const ieps_monto = precio * (ieps_pct || 0) / 100;
  const iva_monto = (precio + ieps_monto) * (iva_pct || 0) / 100;
  return {
    precio_neto: round2(precio),
    ieps_monto: round2(ieps_monto),
    iva_monto: round2(iva_monto),
    total: round2(precio + ieps_monto + iva_monto),
  };
}

/**
 * Calculate line total with quantity and discount
 */
export function calcLineTax(params: {
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  iva_pct: number;
  ieps_pct: number;
}): {
  subtotal: number;
  ieps_monto: number;
  iva_monto: number;
  total: number;
} {
  const { cantidad, precio_unitario, descuento_pct, iva_pct, ieps_pct } = params;
  const base = cantidad * precio_unitario;
  const descuento = base * (descuento_pct || 0) / 100;
  const subtotal = base - descuento;

  const ieps_monto = subtotal * (ieps_pct || 0) / 100;
  const iva_monto = (subtotal + ieps_monto) * (iva_pct || 0) / 100;

  return {
    subtotal: round2(subtotal),
    ieps_monto: round2(ieps_monto),
    iva_monto: round2(iva_monto),
    total: round2(subtotal + ieps_monto + iva_monto),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
