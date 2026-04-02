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
  base_precio?: BasePrecioMode | string;
  redondeo?: string;
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
