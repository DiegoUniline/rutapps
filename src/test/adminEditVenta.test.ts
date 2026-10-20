import { describe, it, expect } from 'vitest';
import { calcularLineaAdmin } from '@/lib/adminEditVenta';

const r2 = (n: number) => Math.round(n * 100) / 100;

describe('calcularLineaAdmin', () => {
  it('sin descuento: subtotal + impuestos = total', () => {
    const m = calcularLineaAdmin({ cantidad: 2, iva_pct: 16, ieps_pct: 0, descuento_pct: 0, brutoUnit: 116 });
    expect(m).toEqual({ subtotal: 200, iva: 32, ieps: 0, total: 232 });
  });

  it('con descuento: subtotal va antes del descuento y no se descuenta dos veces', () => {
    const m = calcularLineaAdmin({ cantidad: 1, iva_pct: 16, ieps_pct: 0, descuento_pct: 10, brutoUnit: 104.4 });
    expect(m.subtotal).toBe(100);
    expect(m.iva).toBe(14.4);
    // Lo que hace la BD: bruto − descuento_total = total de la línea.
    const descuento = r2(m.subtotal * 0.10);
    expect(r2(m.subtotal + m.iva + m.ieps - descuento)).toBe(m.total);
  });

  it('descuento de 100 % no divide entre cero', () => {
    const m = calcularLineaAdmin({ cantidad: 1, iva_pct: 16, ieps_pct: 0, descuento_pct: 100, brutoUnit: 0 });
    expect(m.total).toBe(0);
    expect(Number.isFinite(m.subtotal)).toBe(true);
  });
});
