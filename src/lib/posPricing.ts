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
 * Build POS line pricing.
 *
 * Order of operations (system-wide rule):
 *
 * When base_precio = 'con_impuestos':
 *   1. Costo → Regla de tarifa = precio bruto (taxes included)
 *   2. Promo discount on bruto
 *   3. Taxes already included → extract net
 *   4. Redondeo at the very end on the final gross
 *
 * When base_precio = 'sin_impuestos':
 *   1. Costo → Regla de tarifa = precio neto
 *   2. Promo discount on neto
 *   3. Add taxes
 *   4. Redondeo at the very end on the final gross
 */
export function buildPosLinePricing(item: PosPricingItem, rawPromoDiscount = 0): PosLinePricing {
  const qty = item.cantidad;
  const promoPerUnit = qty > 0 ? rawPromoDiscount / qty : 0;

  // --- Original line (no promo) ---
  // For origGross we use the rounded price (what was shown before promo)
  const origSub = round2(item.precio_unitario * qty);
  const origIeps = item.tiene_ieps ? round2(origSub * (item.ieps_pct / 100)) : 0;
  const origIva = item.tiene_iva ? round2((origSub + origIeps) * (item.iva_pct / 100)) : 0;
  const origGross = round2(origSub + origIeps + origIva);

  if (rawPromoDiscount <= 0) {
    return { subtotal: origSub, iva: origIva, ieps: origIeps, gross: origGross, effectiveDiscount: 0, finalGross: origGross };
  }

  // --- With promo ---
  if (item.base_precio === 'con_impuestos') {
    // 1. Raw gross per unit (from tarifa, before any rounding)
    const rawGrossPerUnit = item.precio_display_sin_redondeo;
    // 2. Apply promo on gross
    const afterPromoPerUnit = Math.max(0, rawGrossPerUnit - promoPerUnit);
    // 3. Taxes already included → extract net from after-promo gross
    const afterPromoGross = round2(afterPromoPerUnit * qty);
    const divisor = getTaxMultiplier(item);
    const finalNet = divisor > 0 ? round2(afterPromoGross / divisor) : afterPromoGross;
    const finalIeps = item.tiene_ieps ? round2(finalNet * (item.ieps_pct / 100)) : 0;
    const finalIva = item.tiene_iva ? round2((finalNet + finalIeps) * (item.iva_pct / 100)) : 0;
    const preRoundGross = round2(finalNet + finalIeps + finalIva);
    // 4. Redondeo at the very end
    const finalGross = round2(applyRedondeo(preRoundGross, item.redondeo));

    return {
      subtotal: finalNet,
      iva: finalIva,
      ieps: finalIeps,
      gross: origGross,
      effectiveDiscount: round2(Math.max(0, origGross - finalGross)),
      finalGross,
    };
  } else {
    // 1. Raw net per unit (from tarifa, before any rounding)
    const rawNetPerUnit = item.precio_unitario_sin_redondeo;
    // 2. Apply promo on net
    const afterPromoPerUnit = Math.max(0, rawNetPerUnit - promoPerUnit);
    const finalSub = round2(afterPromoPerUnit * qty);
    // 3. Add taxes
    const finalIeps = item.tiene_ieps ? round2(finalSub * (item.ieps_pct / 100)) : 0;
    const finalIva = item.tiene_iva ? round2((finalSub + finalIeps) * (item.iva_pct / 100)) : 0;
    const preRoundGross = round2(finalSub + finalIeps + finalIva);
    // 4. Redondeo at the very end
    const finalGross = round2(applyRedondeo(preRoundGross, item.redondeo));

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
