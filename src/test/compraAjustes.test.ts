import { describe, expect, it } from 'vitest';
import { calcularTotalesCompra, prorratearAjustesCompra } from '@/lib/compraAjustes';

describe('ajustes de compra', () => {
  it('aplica descuento en monto y ajuste de centavos al total final', () => {
    expect(calcularTotalesCompra({
      subtotalLineas: 900,
      totalLineas: 1005.27,
      descuentoExtra: 5,
      descuentoExtraTipo: 'monto',
      ajusteTotal: -0.02,
    })).toEqual({
      subtotal: 900,
      iva_total: 105.27,
      total_antes_ajustes: 1005.27,
      descuento_total: 5,
      ajuste_total: -0.02,
      total: 1000.25,
    });
  });

  it('limita el porcentaje de descuento a cien', () => {
    const result = calcularTotalesCompra({
      subtotalLineas: 100,
      totalLineas: 116,
      descuentoExtra: 150,
      descuentoExtraTipo: 'porcentaje',
    });
    expect(result.descuento_total).toBe(116);
    expect(result.total).toBe(0);
  });

  it('prorratea sin perder centavos', () => {
    const lineas = prorratearAjustesCompra(
      [{ total: 333.33 }, { total: 333.33 }, { total: 338.61 }],
      5,
      -0.02,
    );
    expect(lineas.reduce((sum, linea) => sum + linea.descuento_prorrateado, 0)).toBe(5);
    expect(lineas.reduce((sum, linea) => sum + linea.ajuste_prorrateado, 0)).toBe(-0.02);
    expect(lineas.reduce((sum, linea) => sum + linea.total_neto_linea, 0)).toBe(1000.25);
  });
});
