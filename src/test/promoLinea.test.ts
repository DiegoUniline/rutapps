import { describe, expect, it } from 'vitest';
import { aplicarPromoALinea, separarDescuentoPromo } from '@/lib/promoLinea';

describe('producto_gratis con impuestos', () => {
  it('elimina la unidad gratis a valor bruto, incluido su IEPS', () => {
    const promo = separarDescuentoPromo([
      {
        tipo: 'producto_gratis',
        producto_id: 'producto-1',
        descuento: 185.19,
        cantidad_gratis: 1,
      },
    ], 'producto-1', 200);

    expect(promo.descuentoRegular).toBe(0);
    expect(promo.descuentoGratisBruto).toBe(200);

    const neto = aplicarPromoALinea({
      subtotal: 555.56,
      ieps: 44.44,
      iva: 0,
      total: 600,
    }, promo.descuentoGratisBruto);

    expect(neto).toEqual({ subtotal: 370.37, ieps: 29.63, iva: 0, total: 400 });
  });
});
describe('descuento de promo sobre base bruta', () => {
  it('10% sobre 200 brutos deja total 180 con IVA proporcional', () => {
    // 4 × $50 con IVA 16% incluido: subtotal 172.41 + IVA 27.59 = 200
    const bruto = { subtotal: 172.41, ieps: 0, iva: 27.59, total: 200 };
    const neto = aplicarPromoALinea(bruto, 20);
    expect(neto.total).toBe(180);
    expect(neto.iva).toBe(24.83);
    expect(neto.subtotal).toBe(155.17);
  });
});
