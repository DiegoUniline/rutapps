import { describe, it, expect } from 'vitest';
import { calcularLineaAdmin, precioListaConImpuestos } from '@/lib/adminEditVenta';

describe('calcularLineaAdmin', () => {
  it('sin descuento: subtotal + impuestos = total', () => {
    const m = calcularLineaAdmin({ cantidad: 2, iva_pct: 16, ieps_pct: 0, descuento_pct: 0, brutoUnit: 116 });
    expect(m).toEqual({ subtotal: 200, iva: 32, ieps: 0, total: 232 });
  });

  it('el descuento BAJA el total y no sube el precio (Tampico PED-12342, CONTAC ULTRA)', () => {
    const m = calcularLineaAdmin({ cantidad: 2, iva_pct: 0, ieps_pct: 0, descuento_pct: 5, brutoUnit: 40 });
    expect(m.subtotal).toBe(80);      // precio de lista × cantidad, sin inflar
    expect(m.total).toBe(76);         // 80 − 5 %
  });

  it('con IVA: el impuesto va sobre lo descontado', () => {
    const m = calcularLineaAdmin({ cantidad: 1, iva_pct: 16, ieps_pct: 0, descuento_pct: 10, brutoUnit: 116 });
    expect(m.subtotal).toBe(100);
    expect(m.iva).toBe(14.4);
    expect(m.total).toBe(104.4);
  });

  it('descuento de 100 % deja total 0', () => {
    const m = calcularLineaAdmin({ cantidad: 1, iva_pct: 16, ieps_pct: 0, descuento_pct: 100, brutoUnit: 116 });
    expect(m.total).toBe(0);
  });

  it('precarga el precio de lista con impuestos desde el renglón guardado', () => {
    expect(precioListaConImpuestos({ precio_unitario: 40, iva_pct: 0, ieps_pct: 0 })).toBe(40);
    expect(precioListaConImpuestos({ precio_unitario: 100, iva_pct: 16, ieps_pct: 8 })).toBe(125.28);
  });
});
