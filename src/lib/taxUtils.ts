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

export type IepsTipo = 'porcentaje' | 'cuota';

export interface TaxInput {
  precio: number;       // base price or gross price
  iva_pct: number;      // e.g. 16
  ieps_pct: number;     // e.g. 8 (percentage) or fixed amount per unit
  ieps_tipo?: IepsTipo; // 'porcentaje' (default) or 'cuota' (fixed amount)
  incluye_impuestos?: boolean;
  cantidad?: number;    // needed when ieps_tipo='cuota' to calc total IEPS
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
export function calcTax({ precio, iva_pct, ieps_pct, ieps_tipo = 'porcentaje', incluye_impuestos, cantidad = 1 }: TaxInput): TaxBreakdown {
  const isCuota = ieps_tipo === 'cuota';

  if (incluye_impuestos) {
    if (isCuota) {
      // cuota: IEPS is fixed per unit, IVA applies on (neto + ieps)
      // total = neto + cuota*cant + (neto + cuota*cant) * iva/100
      // total = (neto + cuota*cant) * (1 + iva/100)
      const ieps_total = (ieps_pct || 0) * cantidad;
      const base_con_ieps = precio / (1 + (iva_pct || 0) / 100);
      const iva_monto = precio - base_con_ieps;
      const precio_neto = base_con_ieps - ieps_total;
      return {
        precio_neto: round2(precio_neto),
        ieps_monto: round2(ieps_total),
        iva_monto: round2(iva_monto),
        total: round2(precio),
      };
    }
    // porcentaje
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
  const ieps_monto = isCuota ? (ieps_pct || 0) * cantidad : precio * (ieps_pct || 0) / 100;
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
  ieps_tipo?: IepsTipo;
}): {
  subtotal: number;
  ieps_monto: number;
  iva_monto: number;
  total: number;
} {
  const { cantidad, precio_unitario, descuento_pct, iva_pct, ieps_pct, ieps_tipo = 'porcentaje' } = params;
  const isCuota = ieps_tipo === 'cuota';
  const base = cantidad * precio_unitario;
  const descuento = base * (descuento_pct || 0) / 100;
  const subtotal = base - descuento;

  const ieps_monto = isCuota ? (ieps_pct || 0) * cantidad : subtotal * (ieps_pct || 0) / 100;
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
