import { describe, expect, it } from 'vitest';
import { calcularUtilidadBruta } from '@/lib/utilidadFinanciera';

describe('calcularUtilidadBruta', () => {
  it('calcula ventas efectivas menos costo', () => {
    const r = calcularUtilidadBruta(
      [{ total: 1000 }],
      [{ producto_id: 'p1', cantidad: 2 }, { producto_id: 'p2', cantidad: 1 }],
      new Map([['p1', 200], ['p2', 100]]),
    );
    expect(r.totalVentas).toBe(1000);
    expect(r.costoTotal).toBe(500);
    expect(r.utilidadBruta).toBe(500);
    expect(r.margenPct).toBe(50);
  });

  it('usa total efectivo para pedidos cerrados parcialmente', () => {
    const r = calcularUtilidadBruta(
      [{ total: 1000, total_efectivo: 600, cerrado_at: '2026-09-24T12:00:00Z' }],
      [{ producto_id: 'p1', cantidad: 2 }],
      new Map([['p1', 100]]),
    );
    expect(r.totalVentas).toBe(600);
    expect(r.utilidadBruta).toBe(400);
  });

  it('devuelve cero sin operaciones', () => {
    expect(calcularUtilidadBruta([], [], new Map())).toEqual({
      totalVentas: 0, costoTotal: 0, utilidadBruta: 0, margenPct: 0,
    });
  });

  it('conserva una perdida real', () => {
    const r = calcularUtilidadBruta(
      [{ total: 100 }],
      [{ producto_id: 'p1', cantidad: 2 }],
      new Map([['p1', 80]]),
    );
    expect(r.utilidadBruta).toBe(-60);
  });
});
