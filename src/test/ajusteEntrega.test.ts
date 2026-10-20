import { describe, it, expect } from 'vitest';
import { lineaVentaParaProducto } from '@/lib/ajusteEntrega';

const base = { id: 'p', precio_principal: 116, costo: 50, clasificacion_id: null, tiene_iva: true, iva_pct: 16, tiene_ieps: false, ieps_pct: 0 };

describe('lineaVentaParaProducto', () => {
  it('sin lista de precios usa el precio principal (con impuestos)', () => {
    const l = lineaVentaParaProducto(base, [], null, 2);
    expect(l.total).toBe(232);
    expect(l.subtotal).toBe(200);
    expect(l.iva_monto).toBe(32);
    expect(l.descuento_pct).toBe(0);
  });

  it('producto sin impuestos', () => {
    const l = lineaVentaParaProducto({ ...base, tiene_iva: false, iva_pct: 0, precio_principal: 50 }, [], null, 3);
    expect(l.total).toBe(150);
    expect(l.iva_monto).toBe(0);
  });
});
