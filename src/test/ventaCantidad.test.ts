import { describe, it, expect } from 'vitest';
import { cantidadNetaVenta } from '@/lib/ventaCantidad';

describe('cantidadNetaVenta', () => {
  it('resta lo devuelto a lo vendido', () => {
    expect(cantidadNetaVenta({
      venta_lineas: [{ cantidad: 15 }, { cantidad: '90' }, { cantidad: 12 }],
      devoluciones: [{ devolucion_lineas: [{ cantidad: 5 }, { cantidad: 5 }] }],
    })).toBe(107);
  });
  it('usa la cantidad neta de la vista si viene', () => {
    expect(cantidadNetaVenta({ cantidad_neta: '40.5', venta_lineas: [{ cantidad: 1 }] })).toBe(40.5);
  });
  it('sin datos es cero y nunca negativo', () => {
    expect(cantidadNetaVenta({})).toBe(0);
    expect(cantidadNetaVenta({ venta_lineas: [{ cantidad: 1 }], devoluciones: [{ devolucion_lineas: [{ cantidad: 3 }] }] })).toBe(0);
  });
});
