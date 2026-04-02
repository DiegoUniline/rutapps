import { describe, expect, it } from 'vitest';
import { buildPosLinePricing } from '@/lib/posPricing';

describe('buildPosLinePricing', () => {
  /**
   * Caso 1: CON IMPUESTOS
   * Costo $20, Margen 37.5% → bruto $27.50 (IVA 16% incluido)
   * Promo 10% → $27.50 - $2.75 = $24.75 bruto
   * Impuestos ya incluidos → neto = $24.75 / 1.16 = $21.34
   * Redondeo cercano al final → round($24.75) = $25.00
   */
  it('con_impuestos: promo on gross, then round at the end', () => {
    const line = buildPosLinePricing({
      cantidad: 1,
      precio_unitario: 23.71,                // net from rounded gross (28/1.16)
      precio_unitario_sin_redondeo: 27.5 / 1.16, // raw net
      precio_display_sin_redondeo: 27.5,      // raw gross
      tiene_iva: true,
      iva_pct: 16,
      tiene_ieps: false,
      ieps_pct: 0,
      base_precio: 'con_impuestos',
      redondeo: 'cercano',
    }, 2.75); // 10% of 27.5

    // After promo: gross = 24.75, round(24.75) = 25
    expect(line.finalGross).toBe(25);
  });

  /**
   * Caso 2: SIN IMPUESTOS
   * Costo $20, Margen 37.5% → neto $27.50
   * Promo 10% → $27.50 - $2.75 = $24.75 neto
   * + IVA 16% → $24.75 * 1.16 = $28.71
   * Redondeo cercano al final → round($28.71) = $29.00
   */
  it('sin_impuestos: promo on net, add taxes, then round at the end', () => {
    const line = buildPosLinePricing({
      cantidad: 1,
      precio_unitario: 27.5,
      precio_unitario_sin_redondeo: 27.5,
      precio_display_sin_redondeo: 27.5,
      tiene_iva: true,
      iva_pct: 16,
      tiene_ieps: false,
      ieps_pct: 0,
      base_precio: 'sin_impuestos',
      redondeo: 'cercano',
    }, 2.75); // 10% of 27.5

    // net after promo = 24.75, + IVA = 28.71, round = 29
    expect(line.finalGross).toBe(29);
    expect(line.subtotal).toBe(24.75);
    expect(line.iva).toBe(3.96); // 24.75 * 0.16
  });

  it('no discount when promo is 0', () => {
    const line = buildPosLinePricing({
      cantidad: 1,
      precio_unitario: 24.14,
      precio_unitario_sin_redondeo: 27.5 / 1.16,
      precio_display_sin_redondeo: 27.5,
      tiene_iva: true,
      iva_pct: 16,
      tiene_ieps: false,
      ieps_pct: 0,
      base_precio: 'con_impuestos',
      redondeo: 'cercano',
    }, 0);

    expect(line.finalGross).toBe(28);
    expect(line.effectiveDiscount).toBe(0);
  });

  it('con_impuestos without rounding', () => {
    const line = buildPosLinePricing({
      cantidad: 1,
      precio_unitario: 27.5 / 1.16,
      precio_unitario_sin_redondeo: 27.5 / 1.16,
      precio_display_sin_redondeo: 27.5,
      tiene_iva: true,
      iva_pct: 16,
      tiene_ieps: false,
      ieps_pct: 0,
      base_precio: 'con_impuestos',
      redondeo: 'ninguno',
    }, 2.75);

    // 27.5 - 2.75 = 24.75, no rounding → 24.75
    expect(line.finalGross).toBe(24.75);
  });
});
