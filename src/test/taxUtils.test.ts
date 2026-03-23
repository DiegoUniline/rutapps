import { describe, it, expect } from 'vitest';
import { calcTax, calcLineTax } from '@/lib/taxUtils';

describe('calcTax – IVA only', () => {
  it('calculates IVA 16% on net price', () => {
    const r = calcTax({ precio: 100, iva_pct: 16, ieps_pct: 0 });
    expect(r.precio_neto).toBe(100);
    expect(r.iva_monto).toBe(16);
    expect(r.total).toBe(116);
  });

  it('extracts IVA when price includes taxes', () => {
    const r = calcTax({ precio: 116, iva_pct: 16, ieps_pct: 0, incluye_impuestos: true });
    expect(r.precio_neto).toBe(100);
    expect(r.iva_monto).toBe(16);
    expect(r.total).toBe(116);
  });

  it('handles 0% IVA', () => {
    const r = calcTax({ precio: 100, iva_pct: 0, ieps_pct: 0 });
    expect(r.total).toBe(100);
    expect(r.iva_monto).toBe(0);
  });
});

describe('calcTax – IVA + IEPS porcentaje', () => {
  it('IVA applies on base + IEPS', () => {
    const r = calcTax({ precio: 100, iva_pct: 16, ieps_pct: 8 });
    expect(r.ieps_monto).toBe(8);
    expect(r.iva_monto).toBe(17.28); // (100+8)*0.16
    expect(r.total).toBe(125.28);
  });

  it('extracts both taxes from gross price', () => {
    const r = calcTax({ precio: 125.28, iva_pct: 16, ieps_pct: 8, incluye_impuestos: true });
    expect(r.precio_neto).toBe(100);
    expect(r.ieps_monto).toBe(8);
  });
});

describe('calcTax – IEPS cuota', () => {
  it('cuota is per unit', () => {
    const r = calcTax({ precio: 100, iva_pct: 16, ieps_pct: 3.5, ieps_tipo: 'cuota', cantidad: 10 });
    expect(r.ieps_monto).toBe(35); // 3.5 * 10
    expect(r.iva_monto).toBe(21.6); // (100+35)*0.16
    expect(r.total).toBe(156.6);
  });
});

describe('calcLineTax – with discount', () => {
  it('applies discount before taxes', () => {
    const r = calcLineTax({
      cantidad: 5, precio_unitario: 100, descuento_pct: 10,
      iva_pct: 16, ieps_pct: 0,
    });
    expect(r.subtotal).toBe(450); // 5*100 - 10%
    expect(r.iva_monto).toBe(72); // 450*0.16
    expect(r.total).toBe(522);
  });

  it('handles 0 discount', () => {
    const r = calcLineTax({
      cantidad: 2, precio_unitario: 50, descuento_pct: 0,
      iva_pct: 16, ieps_pct: 0,
    });
    expect(r.subtotal).toBe(100);
    expect(r.total).toBe(116);
  });

  it('handles IEPS cuota with discount', () => {
    const r = calcLineTax({
      cantidad: 10, precio_unitario: 20, descuento_pct: 0,
      iva_pct: 16, ieps_pct: 3, ieps_tipo: 'cuota',
    });
    expect(r.subtotal).toBe(200);
    expect(r.ieps_monto).toBe(30);
    expect(r.iva_monto).toBe(36.8); // (200+30)*0.16
    expect(r.total).toBe(266.8);
  });
});
