import { describe, expect, it } from 'vitest';
import { descuentoPctVenta, diasCreditoVenta } from '@/lib/creditoVenta';

describe('diasCreditoVenta', () => {
  it('deriva los días entre la fecha y el vencimiento', () => {
    expect(diasCreditoVenta('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasCreditoVenta('2026-10-01T15:30:00', '2026-10-16')).toBe(15);
  });

  it('sin vencimiento usa los días de crédito del cliente (D-004)', () => {
    expect(diasCreditoVenta('2026-10-01', null, 15)).toBe(15);
    expect(diasCreditoVenta('2026-10-01', null, null)).toBe(0);
    expect(diasCreditoVenta('2026-10-01', null)).toBe(0);
  });

  it('con vencimiento real ignora los días del cliente; vencimiento anterior = 0', () => {
    expect(diasCreditoVenta('2026-10-01', '2026-10-08', 30)).toBe(7);
    expect(diasCreditoVenta('2026-10-10', '2026-10-01')).toBe(0);
  });

  it('cruza cambio de mes y año', () => {
    expect(diasCreditoVenta('2026-12-15', '2027-01-14')).toBe(30);
  });
});

describe('descuentoPctVenta', () => {
  it('calcula el porcentaje sobre el subtotal con 2 decimales', () => {
    expect(descuentoPctVenta(200, 30)).toBe(15);
    expect(descuentoPctVenta(300, 50)).toBe(16.67);
  });

  it('sin subtotal o sin descuento es 0', () => {
    expect(descuentoPctVenta(0, 10)).toBe(0);
    expect(descuentoPctVenta(100, null)).toBe(0);
  });
});
