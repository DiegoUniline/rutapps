import { describe, it, expect } from 'vitest';
import { calcLineTotals, emptyLine } from '@/pages/CompraForm/types';

describe('calcLineTotals – compra', () => {
  it('calculates subtotal without taxes', () => {
    const line = { ...emptyLine(), cantidad: 5, precio_unitario: 100 };
    calcLineTotals(line);
    expect(line.subtotal).toBe(500);
    expect(line.total).toBe(500);
  });

  it('adds IVA when enabled', () => {
    const line = { ...emptyLine(), cantidad: 2, precio_unitario: 100, _tiene_iva: true, _iva_pct: 16 };
    calcLineTotals(line);
    expect(line.subtotal).toBe(200);
    expect(line.total).toBe(232); // 200 + 32
  });

  it('adds IEPS porcentaje + IVA', () => {
    const line = {
      ...emptyLine(), cantidad: 1, precio_unitario: 100,
      _tiene_iva: true, _iva_pct: 16,
      _tiene_ieps: true, _ieps_pct: 8, _ieps_tipo: 'porcentaje',
    };
    calcLineTotals(line);
    expect(line.subtotal).toBe(100);
    // IEPS = 8, IVA = (100+8)*0.16 = 17.28
    expect(line.total).toBeCloseTo(125.28, 2);
  });

  it('adds IEPS cuota + IVA', () => {
    const line = {
      ...emptyLine(), cantidad: 10, precio_unitario: 20,
      _tiene_iva: true, _iva_pct: 16,
      _tiene_ieps: true, _ieps_pct: 3.5, _ieps_tipo: 'cuota',
    };
    calcLineTotals(line);
    expect(line.subtotal).toBe(200);
    // IEPS cuota = 10*3.5=35, IVA = (200+35)*0.16=37.6
    expect(line.total).toBeCloseTo(272.6, 2);
  });

  it('calculates _piezas_total with factor_conversion', () => {
    const line = { ...emptyLine(), cantidad: 5, _factor_conversion: 12 };
    calcLineTotals(line);
    expect(line._piezas_total).toBe(60);
  });

  it('handles zero quantity', () => {
    const line = { ...emptyLine(), cantidad: 0, precio_unitario: 100 };
    calcLineTotals(line);
    expect(line.subtotal).toBe(0);
    expect(line.total).toBe(0);
  });
});
