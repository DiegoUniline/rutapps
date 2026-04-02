import { describe, it, expect } from 'vitest';
import { resolveProductPrice, resolveProductPricing, calculatePrice, type TarifaLineaRule } from '@/lib/priceResolver';
import { productoBasico, productoConIeps } from './fixtures/productos';
import { reglaPrecioFijo, reglaMargenCosto, reglaDescuento } from './fixtures/tarifas';

describe('resolveProductPrice', () => {
  it('returns precio_principal when no rules', () => {
    expect(resolveProductPrice([], productoBasico)).toBe(10);
  });

  it('applies precio_fijo rule for specific product', () => {
    expect(resolveProductPrice([reglaPrecioFijo], productoBasico)).toBe(12);
  });

  it('ignores product rule when product id does not match', () => {
    expect(resolveProductPrice([reglaPrecioFijo], productoConIeps)).toBe(15);
  });

  it('applies descuento rule by category', () => {
    const price = resolveProductPrice([reglaDescuento], productoBasico);
    expect(price).toBe(9); // 10 - 10%
  });

  it('applies margen_costo rule as global fallback', () => {
    const price = resolveProductPrice([reglaMargenCosto], productoConIeps);
    expect(price).toBe(12);
  });

  it('enforces precio_minimo', () => {
    const lowCostProduct = { ...productoBasico, costo: 2 };
    const price = resolveProductPrice([reglaMargenCosto], lowCostProduct);
    expect(price).toBe(8);
  });

  it('product rule has priority over category rule', () => {
    const price = resolveProductPrice([reglaPrecioFijo, reglaDescuento], productoBasico);
    expect(price).toBe(12);
  });
});

describe('calculatePrice – base_precio con_impuestos', () => {
  it('extracts pre-tax price when base includes taxes', () => {
    const rule = { ...reglaPrecioFijo, precio: 11.6, base_precio: 'con_impuestos' };
    const price = calculatePrice(rule, productoBasico);
    expect(price).toBe(10);
  });

  it('returns null for precio_fijo = 0 placeholder rules', () => {
    const rule = { ...reglaPrecioFijo, precio: 0, precio_minimo: null, aplica_a: 'categoria' as const, clasificacion_ids: ['cat-001'], producto_ids: [] };
    const price = calculatePrice(rule, productoBasico);
    expect(price).toBeNull();
  });
});

describe('resolveProductPrice – placeholder rules fallback', () => {
  it('falls back to precio_principal when precio_fijo = 0 category rule matches', () => {
    const placeholderRule: TarifaLineaRule = {
      ...reglaPrecioFijo, precio: 0, precio_minimo: null, aplica_a: 'categoria',
      clasificacion_ids: ['cat-001'], producto_ids: [],
    };
    const price = resolveProductPrice([placeholderRule], productoBasico);
    expect(price).toBe(10);
  });
});

describe('resolveProductPricing – display price', () => {
  it('keeps the rounded public price when the rule is con_impuestos', () => {
    const rule: TarifaLineaRule = {
      ...reglaPrecioFijo,
      tipo_calculo: 'precio_fijo',
      precio: 27.5,
      precio_minimo: null,
      redondeo: 'cercano',
      base_precio: 'con_impuestos',
    };

    const pricing = resolveProductPricing([rule], productoBasico);

    expect(pricing.unitPrice).toBe(24.14);
    expect(pricing.displayPrice).toBe(28);
    expect(pricing.basePrecio).toBe('con_impuestos');
  });

  it('shows the same amount for display when the rule is sin_impuestos', () => {
    const pricing = resolveProductPricing([reglaPrecioFijo], productoBasico);

    expect(pricing.unitPrice).toBe(12);
    expect(pricing.displayPrice).toBe(12);
    expect(pricing.basePrecio).toBe('sin_impuestos');
  });
});
