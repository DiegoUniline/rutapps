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

export function calculateSaleLineAmounts(line: SaleLinePricingLike, sinImpuestos = false): SaleLineAmounts {
  const qty = Number(line.cantidad) || 0;
  const price = Number(line.precio_unitario) || 0;
  const descPct = Number(line.descuento_pct) || 0;
  const ivaPct = sinImpuestos ? 0 : Number(line.iva_pct) || 0;
  const iepsPct = sinImpuestos ? 0 : Number(line.ieps_pct) || 0;

  const subtotal = round2(qty * price);
  const discount = round2(subtotal * (descPct / 100));
  const base = round2(subtotal - discount);
  let ieps = iepsPct > 0 ? round2(base * (iepsPct / 100)) : 0;
  let iva = ivaPct > 0 ? round2((base + ieps) * (ivaPct / 100)) : 0;
  let total = round2(base + ieps + iva);

  const displayUnitPrice = Number(line.display_unit_price) || 0;
  const canUseDisplayTotal = !sinImpuestos
    && !line.precio_manual
    && descPct === 0
    && displayUnitPrice > 0
    && (ivaPct > 0 || iepsPct > 0);

  if (canUseDisplayTotal) {
    const targetTotal = round2(displayUnitPrice * qty);
    const diff = Math.abs(targetTotal - total);

    // Only correct normal per-line tax rounding drift. Larger gaps usually mean
    // the user typed a manual net price or stale display metadata survived.
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

  return { subtotal, discount, iva, ieps, total };
}
