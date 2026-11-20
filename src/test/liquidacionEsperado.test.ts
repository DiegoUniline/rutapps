/**
 * F0 (H6/H8): una sola fórmula del efectivo esperado de la liquidación.
 * Espejo TS de fn_liquidacion_esperado (la BD es la fuente; esto la replica sin conexión).
 */
import { describe, it, expect } from 'vitest';
import { calcularEfectivoEsperado, parseLiquidacionEsperado } from '@/lib/liquidacion';

describe('calcularEfectivoEsperado', () => {
  it('escenario de auditoría: cobro 80 − gasto 50 − dinero devuelto 7.75 = 22.25', () => {
    expect(calcularEfectivoEsperado({ cobrosEfectivo: 80, gastos: 50, devolucionesDinero: 7.75 })).toBe(22.25);
  });

  it('el reembolso de una venta cancelada sin turno de caja también se resta (H8)', () => {
    // Venta pagada 100 en efectivo y cancelada con «se devolvió el dinero»: el cobro sigue
    // activo (+100) y el reembolso (−100) lo neutraliza.
    expect(calcularEfectivoEsperado({ cobrosEfectivo: 180, gastos: 50, devolucionesDinero: 7.75, reembolsos: 100 })).toBe(22.25);
  });

  it('sin devoluciones ni reembolsos es cobros − gastos (lo que antes calculaba el escritorio)', () => {
    expect(calcularEfectivoEsperado({ cobrosEfectivo: 1234.5, gastos: 234.25 })).toBe(1000.25);
  });

  it('redondea a centavos sin errores de coma flotante', () => {
    expect(calcularEfectivoEsperado({ cobrosEfectivo: 0.1 + 0.2, gastos: 0.1, devolucionesDinero: 0.05 })).toBe(0.15);
  });

  it('puede quedar negativo (gastó o devolvió más de lo que cobró en efectivo)', () => {
    expect(calcularEfectivoEsperado({ cobrosEfectivo: 0, gastos: 30, devolucionesDinero: 5 })).toBe(-35);
  });
});

describe('parseLiquidacionEsperado', () => {
  it('lee el jsonb de la función SQL', () => {
    expect(parseLiquidacionEsperado({ cobros_efectivo: 80, gastos: 50, devoluciones_dinero: 7.75, reembolsos: 0, esperado: 22.25 }))
      .toEqual({ cobrosEfectivo: 80, gastos: 50, devolucionesDinero: 7.75, reembolsos: 0, esperado: 22.25 });
  });

  it('lee los numeric que PostgREST manda como texto', () => {
    expect(parseLiquidacionEsperado({ cobros_efectivo: '80.00', gastos: '50.00', devoluciones_dinero: '7.75', reembolsos: '0', esperado: '22.25' })?.esperado).toBe(22.25);
  });

  it('respuesta vacía → null', () => {
    expect(parseLiquidacionEsperado(null)).toBeNull();
    expect(parseLiquidacionEsperado('x')).toBeNull();
  });
});
