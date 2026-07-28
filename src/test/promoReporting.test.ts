import { describe, it, expect } from 'vitest';
import { buildPromoReporting } from '@/lib/promoReporting';

describe('buildPromoReporting', () => {
  it('usa el desglose real cuando existe y no aplica fallback', () => {
    const r = buildPromoReporting({
      ventas: [{ id: 'v1', total: 80 }],
      lineas: [{ id: 'l1', venta_id: 'v1', total: 100 }],
      promoAplicadas: [{ venta_linea_id: 'l1', descuento_aplicado: 20 }],
    });
    expect(r.descByLinea.l1).toBe(20);
    expect(r.lineTotalEfectivo({ id: 'l1', total: 100 })).toBe(80);
  });

  it('prorratea la diferencia en ventas históricas sin desglose', () => {
    const r = buildPromoReporting({
      ventas: [{ id: 'v1', total: 90 }],
      lineas: [
        { id: 'l1', venta_id: 'v1', total: 60 },
        { id: 'l2', venta_id: 'v1', total: 40 },
      ],
      promoAplicadas: [],
    });
    expect(r.descByLinea.l1 + r.descByLinea.l2).toBeCloseTo(10, 2);
  });

  it('no descuenta nada cuando líneas y total cuadran', () => {
    const r = buildPromoReporting({
      ventas: [{ id: 'v1', total: 100 }],
      lineas: [{ id: 'l1', venta_id: 'v1', total: 100 }],
      promoAplicadas: [],
    });
    expect(r.descByLinea.l1).toBeUndefined();
  });
});
