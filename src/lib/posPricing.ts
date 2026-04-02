export type BasePrecioMode = 'con_impuestos' | 'sin_impuestos';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getTaxMultiplier(item: { tiene_iva: boolean; iva_pct: number; tiene_ieps: boolean; ieps_pct: number }) {
  const ieps = item.tiene_ieps ? (item.ieps_pct ?? 0) : 0;
  const iva = item.tiene_iva ? (item.iva_pct ?? 0) : 0;
  return (1 + ieps / 100) * (1 + iva / 100);
}

function applyRedondeo(precio: number, redondeo: string): number {
  if (!redondeo || redondeo === 'ninguno') return precio;
  if (redondeo === 'arriba') return Math.ceil(precio);
  if (redondeo === 'abajo') return Math.floor(precio);
  return Math.round(precio);
}

export interface PosPricingItem {
  precio_unitario: number;
  precio_unitario_sin_redondeo: number;
  precio_display_sin_redondeo: number;
  cantidad: number;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
  base_precio: BasePrecioMode;
  redondeo: string;
}

export interface PosLinePricing {
  subtotal: number;
  iva: number;
  ieps: number;
  gross: number;
  effectiveDiscount: number;
  finalGross: number;
}

/**
 * Build POS line pricing that applies promo discount BEFORE the final rounding.
 *
 * Order of operations:
 *   1. Take the raw (pre-rounding) base price.
 *   2. Subtract the promo discount per unit.
 *   3. Apply the configured rounding.
 *   4. Then compute taxes on the rounded result.
 *
 * When base_precio = 'con_impuestos', the raw base is already gross,
 * so the discount and rounding happen in gross space, then we extract net + taxes.
 *
 * When base_precio = 'sin_impuestos', the raw base is net,
 * so discount and rounding happen in net space, then we add taxes.
 */
export function buildPosLinePricing(item: PosPricingItem, rawPromoDiscount = 0): PosLinePricing {
  const qty = item.cantidad;
  const promoPerUnit = qty > 0 ? rawPromoDiscount / qty : 0;

  // --- Original line (no promo) ---
  const origSub = round2(item.precio_unitario * qty);
  const origIeps = item.tiene_ieps ? round2(origSub * (item.ieps_pct / 100)) : 0;
  const origIva = item.tiene_iva ? round2((origSub + origIeps) * (item.iva_pct / 100)) : 0;
  const origGross = round2(origSub + origIeps + origIva);

  if (rawPromoDiscount <= 0) {
    return { subtotal: origSub, iva: origIva, ieps: origIeps, gross: origGross, effectiveDiscount: 0, finalGross: origGross };
  }

  // --- With promo ---
  if (item.base_precio === 'con_impuestos') {
    // Work in gross space: raw gross per unit - promo per unit, then round
    const rawGrossPerUnit = item.precio_display_sin_redondeo;
    const afterPromoPerUnit = Math.max(0, rawGrossPerUnit - promoPerUnit);
    const roundedGrossPerUnit = applyRedondeo(afterPromoPerUnit, item.redondeo);
    const finalGross = round2(roundedGrossPerUnit * qty);
    // Extract net from final gross
    const divisor = getTaxMultiplier(item);
    const finalNet = divisor > 0 ? round2(finalGross / divisor) : finalGross;
    const finalIeps = item.tiene_ieps ? round2(finalNet * (item.ieps_pct / 100)) : 0;
    const finalIva = item.tiene_iva ? round2((finalNet + finalIeps) * (item.iva_pct / 100)) : 0;

    return {
      subtotal: finalNet,
      iva: finalIva,
      ieps: finalIeps,
      gross: origGross,
      effectiveDiscount: round2(Math.max(0, origGross - finalGross)),
      finalGross,
    };
  } else {
    // Work in net space: raw net per unit - promo per unit, then round
    const rawNetPerUnit = item.precio_unitario_sin_redondeo;
    const afterPromoPerUnit = Math.max(0, rawNetPerUnit - promoPerUnit);
    const roundedNetPerUnit = applyRedondeo(afterPromoPerUnit, item.redondeo);
    const finalSub = round2(roundedNetPerUnit * qty);
    const finalIeps = item.tiene_ieps ? round2(finalSub * (item.ieps_pct / 100)) : 0;
    const finalIva = item.tiene_iva ? round2((finalSub + finalIeps) * (item.iva_pct / 100)) : 0;
    const finalGross = round2(finalSub + finalIeps + finalIva);

    return {
      subtotal: finalSub,
      iva: finalIva,
      ieps: finalIeps,
      gross: origGross,
      effectiveDiscount: round2(Math.max(0, origGross - finalGross)),
      finalGross,
    };
  }
}