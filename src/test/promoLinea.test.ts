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