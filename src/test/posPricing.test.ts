import { describe, expect, it } from 'vitest';
import { buildPosLinePricing } from '@/lib/posPricing';

describe('buildPosLinePricing', () => {
  it('applies promo before final rounding when base_precio is con_impuestos', () => {
    // Rule: precio_fijo 27.5 con_impuestos, redondeo cercano, IVA 16%
    // Without promo: round(27.5) = 28
    // With 10% promo: 27.5 - 2.75 = 24.75, round(24.75) = 25
    const line = buildPosLinePricing({
      cantidad: 1,
      precio_unitario: 24.14,         // net after rounding (28 / 1.16)
      precio_unitario_sin_redondeo: 27.5 / 1.16,  // raw net
      precio_display_sin_redondeo: 27.5,           // raw gross
      tiene_iva: true,
      iva_pct: 16,
      tiene_ieps: false,
      ieps_pct: 0,
      base_precio: 'con_impuestos',
      redondeo: 'cercano',
    }, 2.75);  // 10% of 27.5

    expect(line.gross).toBe(28);       // original rounded gross
    expect(line.finalGross).toBe(25);  // (27.5 - 2.75) rounded = 25
    expect(line.effectiveDiscount).toBe(3); // 28 - 25
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

  it('applies promo in net space for sin_impuestos', () => {
    const line = buildPosLinePricing({
      cantidad: 1,
      precio_unitario: 10,
      precio_unitario_sin_redondeo: 10,
      precio_display_sin_redondeo: 10,
      tiene_iva: true,
      iva_pct: 16,
      tiene_ieps: false,
      ieps_pct: 0,
      base_precio: 'sin_impuestos',
      redondeo: 'cercano',
    }, 1); // 10% of 10

    // net 10 - 1 = 9, round(9) = 9, + IVA 1.44 = 10.44
    expect(line.finalGross).toBe(10.44);
  });
});