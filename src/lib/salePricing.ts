import type { BasePrecioMode } from '@/lib/posPricing';
import type { ProductForPricing, ResolvedProductPricing } from '@/lib/priceResolver';

export interface TaxPricingInput {
  tiene_iva?: boolean;
  iva_pct?: number;
  tiene_ieps?: boolean;
  ieps_pct?: number;
}

export interface DisplayPricingLike extends TaxPricingInput {
  precio_unitario: number;
  precio_unitario_sin_redondeo?: number;
  precio_display_sin_redondeo?: number;
  display_unit_price?: number;
  base_precio?: BasePrecioMode | string;
  redondeo?: string;
}

export interface SaleLinePricingLike extends DisplayPricingLike {
  cantidad?: number | string | null;
  descuento_pct?: number | string | null;
  precio_manual?: boolean | null;
}

export interface SaleLineAmounts {
  subtotal: number;
  discount: number;
  iva: number;
  ieps: number;
  total: number;
}

export interface SaleLineEffectivePrices {
  unitPrice: number;
  displayPrice: number;
  finalUnitGross: number;
  appliedRounding: boolean;
}

export interface SalePricingSnapshot {
  unitPrice: number;
  displayPrice: number;
  rawUnitPrice: number;
  rawDisplayPrice: number;
  basePrecio: BasePrecioMode;
  redondeo: string;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getTaxMultiplier(input: TaxPricingInput): number {
  const iepsPct = input.tiene_ieps ? (input.ieps_pct ?? 0) : 0;
  const ivaPct = input.tiene_iva ? (input.iva_pct ?? 0) : 0;
  return (1 + iepsPct / 100) * (1 + ivaPct / 100);
}

function applyDisplayRedondeo(precio: number, redondeo?: string): number {
  if (!redondeo || redondeo === 'ninguno') return precio;
  if (redondeo === 'arriba') return Math.ceil(precio);
  if (redondeo === 'abajo') return Math.floor(precio);
  return Math.round(precio);
}

export function getDisplayUnitPrice(item: DisplayPricingLike): number {
  const basePrecio = (item.base_precio ?? 'sin_impuestos') as BasePrecioMode;
  const rawGross = basePrecio === 'con_impuestos'
    ? (item.precio_display_sin_redondeo ?? item.precio_unitario)
    : (item.precio_unitario_sin_redondeo ?? item.precio_unitario) * getTaxMultiplier(item);

  return round2(applyDisplayRedondeo(rawGross, item.redondeo));
}

export function getStoredNetUnitPriceFromGross(input: TaxPricingInput, grossPrice: number): number {
  const divisor = getTaxMultiplier(input);
  return divisor > 0 ? grossPrice / divisor : grossPrice;
}

export function buildSalePricingSnapshot(producto: ProductForPricing, pricing: ResolvedProductPricing): SalePricingSnapshot {
  const hasRule = !!pricing.appliedRule;
  const displayPrice = hasRule ? pricing.displayPrice : round2(producto.precio_principal ?? 0);
  const unitPrice = getStoredNetUnitPriceFromGross(producto, displayPrice);

  if (!hasRule) {
    return {
      unitPrice,
      displayPrice,
      rawUnitPrice: unitPrice,
      rawDisplayPrice: displayPrice,
      basePrecio: 'con_impuestos',
      redondeo: 'ninguno',
    };
  }

  return {
    unitPrice,
    displayPrice,
    rawUnitPrice: pricing.rawUnitPrice,
    rawDisplayPrice: pricing.rawDisplayPrice,
    basePrecio: (pricing.basePrecio as BasePrecioMode) ?? 'sin_impuestos',
    redondeo: pricing.appliedRule?.redondeo ?? 'ninguno',
  };
}

export function buildManualSalePricingFromGross(input: TaxPricingInput, grossPrice: number): SalePricingSnapshot {
  const displayPrice = round2(Math.max(0, grossPrice));
  const unitPrice = getStoredNetUnitPriceFromGross(input, displayPrice);

  return {
    unitPrice,
    displayPrice,
    rawUnitPrice: unitPrice,
    rawDisplayPrice: displayPrice,
    basePrecio: 'con_impuestos',
    redondeo: 'ninguno',
  };
}

export function calculateSaleLineEffectivePrices(line: SaleLinePricingLike, sinImpuestos = false): SaleLineEffectivePrices {
  const currentUnitPrice = Number(line.precio_unitario) || 0;
  const currentDisplayPrice = Number(line.display_unit_price) || currentUnitPrice;
  const descPct = Number(line.descuento_pct) || 0;
  const descFactor = Math.max(0, 1 - descPct / 100);
  const ivaPct = sinImpuestos ? 0 : Number(line.iva_pct) || 0;
  const iepsPct = sinImpuestos ? 0 : Number(line.ieps_pct) || 0;
  const taxMultiplier = (1 + iepsPct / 100) * (1 + ivaPct / 100);
  const redondeo = line.redondeo;
  const hasConfiguredRounding = !!redondeo && redondeo !== 'ninguno';
  const canApplyRounding = hasConfiguredRounding && !line.precio_manual;

  if (!canApplyRounding) {
    // Sin regla de redondeo: mantener el display bruto como fuente de verdad y
    // re-derivar el neto según el multiplicador de impuestos actual. Esto
    // asegura que al alternar IVA/IEPS el subtotal siga cuadrando con el
    // precio mostrado (p. ej. display=$68 con IVA 16% ⇒ neto=$58.62 y total=$68).
    const displayPrice = currentDisplayPrice;
    const unitPrice = taxMultiplier > 0 ? displayPrice / taxMultiplier : displayPrice;
    return {
      unitPrice,
      displayPrice,
      finalUnitGross: round2(unitPrice * descFactor * taxMultiplier),
      appliedRounding: false,
    };
  }

  const rawNet = Number(line.precio_unitario_sin_redondeo) || currentUnitPrice;
  const unitGrossBeforeRound = round2(rawNet * descFactor * taxMultiplier);
  const finalUnitGross = round2(applyDisplayRedondeo(unitGrossBeforeRound, redondeo));

  if (descFactor <= 0) {
    return {
      unitPrice: rawNet,
      displayPrice: round2(rawNet * taxMultiplier),
      finalUnitGross: 0,
      appliedRounding: true,
    };
  }

  const displayPrice = finalUnitGross / descFactor;
  const unitPrice = taxMultiplier > 0 ? displayPrice / taxMultiplier : displayPrice;

  return {
    unitPrice,
    displayPrice,
    finalUnitGross,
    appliedRounding: true,
  };
}

export function calculateSaleLineAmounts(line: SaleLinePricingLike, sinImpuestos = false): SaleLineAmounts {
  const qty = Number(line.cantidad) || 0;
  const effectivePrices = calculateSaleLineEffectivePrices(line, sinImpuestos);
  const price = effectivePrices.unitPrice;
  const descPct = Number(line.descuento_pct) || 0;
  const ivaPct = sinImpuestos ? 0 : Number(line.iva_pct) || 0;
  const iepsPct = sinImpuestos ? 0 : Number(line.ieps_pct) || 0;

  const subtotal = round2(qty * price);
  const discount = round2(subtotal * (descPct / 100));
  const base = round2(subtotal - discount);
  let ieps = iepsPct > 0 ? round2(base * (iepsPct / 100)) : 0;
  let iva = ivaPct > 0 ? round2((base + ieps) * (ivaPct / 100)) : 0;
  let total = round2(base + ieps + iva);

  // ─── Redondeo como ÚLTIMO paso ───────────────────────────────────────────────
  // El redondeo de la regla se aplica siempre al precio unitario final
  // (después de descuentos e impuestos), independientemente de si hay
  // impuestos activos o no. Luego se multiplica por la cantidad para obtener
  // el total de la línea. No se re-redondea el total (evita doble redondeo).
  const redondeo = line.redondeo;
  const hasConfiguredRounding = !!redondeo && redondeo !== 'ninguno';
  const canApplyRounding = hasConfiguredRounding
    && !line.precio_manual
    && qty > 0;

  if (canApplyRounding) {
    // Usar el NET crudo pre-redondeo cuando esté disponible para que un
    // precio ya limpio ($60.00) no se infle al alternar impuestos (Caso 5).
    const finalUnitGross = effectivePrices.finalUnitGross;
    const targetTotal = round2(finalUnitGross * qty);
    const diff = round2(targetTotal - total);

    if (diff !== 0) {
      if (ivaPct > 0) {
        const adj = round2(iva + diff);
        if (adj >= 0) { iva = adj; total = round2(base + ieps + iva); }
      } else if (iepsPct > 0) {
        const adj = round2(ieps + diff);
        if (adj >= 0) { ieps = adj; total = round2(base + ieps + iva); }
      } else {
        // Sin impuestos: el ajuste de redondeo vive en el total directamente.
        total = targetTotal;
      }
    }
  } else {
    // Corrección legacy de drift de impuestos cuando la regla no configura redondeo.
    const displayUnitPrice = Number(line.display_unit_price) || 0;
    const canUseDisplayTotal = !sinImpuestos
      && !line.precio_manual
      && descPct === 0
      && displayUnitPrice > 0
      && (ivaPct > 0 || iepsPct > 0);

    if (canUseDisplayTotal) {
      const targetTotal = round2(displayUnitPrice * qty);
      const diff = Math.abs(targetTotal - total);
      if (diff > 0 && diff <= Math.max(0.1, 0.03 * Math.max(1, qty))) {
        if (iepsPct > 0 && ivaPct > 0) {
          const adjustedIva = round2(targetTotal - base - ieps);
          if (adjustedIva >= 0) iva = adjustedIva;
        } else if (iepsPct > 0) {
          const adjustedIeps = round2(targetTotal - base);
          if (adjustedIeps >= 0) ieps = adjustedIeps;
        } else if (ivaPct > 0) {
          const adjustedIva = round2(targetTotal - base);
          if (adjustedIva >= 0) iva = adjustedIva;
        }
        total = round2(base + ieps + iva);
      }
    }
  }

  return { subtotal, discount, iva, ieps, total };
}
