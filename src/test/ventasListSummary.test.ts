import { describe, expect, it } from 'vitest';
import {
  computeVentasListSummary,
  normalizeVentaLineasListSummary,
  normalizeVentasListSummary,
} from '@/lib/ventasListSummary';

describe('computeVentasListSummary', () => {
  it('conserva impuestos, descuento y cobros activos del resumen histórico', () => {
    const result = computeVentasListSummary([
      {
        total: 116,
        iva_total: 16,
        ieps_total: 0,
        descuento_total: 5,
        status: 'confirmado',
        venta_lineas: [{ subtotal: 105, descuento_pct: 0, precio_unitario: 105, cantidad: 1, total: 116 }],
        promocion_aplicada: [{ descuento_aplicado: 10 }],
        cobro_aplicaciones: [
          { monto_aplicado: 40, cobros: { status: 'activo' } },
          { monto_aplicado: 25, cobros: { status: 'cancelado' } },
        ] as never[],
      },
    ]);

    expect(result).toEqual({
      count: 1,
      subtotal: 110,
      descuento: 10,
      impuestos: 16,
      total: 116,
      pagado: 40,
      saldo: 76,
    });
  });

  it('conserva total efectivo y saldo de un pedido cerrado parcialmente', () => {
    const result = computeVentasListSummary([
      {
        total: 500,
        total_efectivo: 300,
        cerrado_at: '2026-09-01T12:00:00Z',
        status: 'entregado',
        cobro_aplicaciones: [{ monto_aplicado: 125, cobros: { status: 'activo' } }] as never[],
      },
    ]);

    expect(result.total).toBe(300);
    expect(result.pagado).toBe(125);
    expect(result.saldo).toBe(175);
    // El desglose fiscal histórico usa el total original guardado en cabecera.
    expect(result.subtotal).toBe(500);
  });

  it('conserva la regla visual existente de una venta cancelada', () => {
    const result = computeVentasListSummary([{ total: 80, status: 'cancelado' }]);
    expect(result.total).toBe(80);
    expect(result.saldo).toBe(0);
    expect(result.pagado).toBe(80);
  });

  it('reconoce una línea gratuita como descuento completo', () => {
    const result = computeVentasListSummary([
      {
        total: 0,
        status: 'confirmado',
        venta_lineas: [{ subtotal: 0, precio_unitario: 25, cantidad: 2, total: 0 }],
      },
    ]);
    expect(result.subtotal).toBe(50);
    expect(result.descuento).toBe(50);
  });
});

describe('normalizadores de RPC', () => {
  it('acepta NUMERIC y BIGINT serializados como texto', () => {
    expect(normalizeVentasListSummary([{
      ventas_count: '12', subtotal_sin_impuestos: '100.25', descuento: '5.50',
      impuestos: '16.04', total_efectivo: '110.79', pagado: '90', saldo: '20.79',
    }])).toEqual({ count: 12, subtotal: 100.25, descuento: 5.5, impuestos: 16.04, total: 110.79, pagado: 90, saldo: 20.79 });

    expect(normalizeVentaLineasListSummary([{ lineas_count: '7', cantidad: '13.5', total: '42.25' }]))
      .toEqual({ count: 7, cantidad: 13.5, total: 42.25 });
  });
});
