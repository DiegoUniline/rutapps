import { describe, it, expect } from 'vitest';
import { resolveProductPrice, calculatePrice } from '@/lib/priceResolver';
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
    // costo=8, margen=50% → 12, redondeo arriba → 12
    expect(price).toBe(12);
  });

  it('enforces precio_minimo', () => {
    const lowCostProduct = { ...productoBasico, costo: 2 };
    const price = resolveProductPrice([reglaMargenCosto], lowCostProduct);
    // costo=2, margen 50% → 3, min is 8
    expect(price).toBe(8);
  });

  it('product rule has priority over category rule', () => {
    const price = resolveProductPrice([reglaPrecioFijo, reglaDescuento], productoBasico);
    expect(price).toBe(12); // precio fijo wins
  });
});

describe('calculatePrice – base_precio con_impuestos', () => {
  it('extracts pre-tax price when base includes taxes', () => {
    const rule = { ...reglaPrecioFijo, precio: 11.6, base_precio: 'con_impuestos' };
    const price = calculatePrice(rule, productoBasico);
    expect(price).toBe(10); // 11.6 / 1.16
  });
});
