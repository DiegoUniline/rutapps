import { describe, expect, it } from 'vitest';
import {
  saldoFavorDisponible,
  aplicarSaldoFavor,
  tieneSaldoFavor,
  SALDO_FAVOR_METODO,
} from '@/lib/saldoFavor';

describe('saldoFavorDisponible', () => {
  it('disponible = emitido − usado', () => {
    expect(saldoFavorDisponible(500, 200)).toBe(300);
  });

  it('sin uso, disponible = emitido', () => {
    expect(saldoFavorDisponible(150, 0)).toBe(150);
  });

  it('totalmente usado → 0', () => {
    expect(saldoFavorDisponible(150, 150)).toBe(0);
  });

  it('nunca negativo aunque el usado supere lo emitido (datos sucios)', () => {
    expect(saldoFavorDisponible(100, 130)).toBe(0);
  });

  it('redondea a 2 decimales', () => {
    expect(saldoFavorDisponible(100.005, 0)).toBe(100.01);
  });
});

describe('aplicarSaldoFavor', () => {
  it('aplica todo lo disponible si la venta lo supera', () => {
    // disponible 100, venta 250, sin solicitar → usa 100
    expect(aplicarSaldoFavor(100, 250)).toEqual({ aplicado: 100, restante: 0 });
  });

  it('no aplica más que el monto a cubrir', () => {
    // disponible 300, venta 120 → solo 120, sobran 180
    expect(aplicarSaldoFavor(300, 120)).toEqual({ aplicado: 120, restante: 180 });
  });

  it('respeta lo que el usuario pide usar', () => {
    // disponible 300, venta 250, pide usar 100 → 100
    expect(aplicarSaldoFavor(300, 250, 100)).toEqual({ aplicado: 100, restante: 200 });
  });

  it('lo solicitado se topa al disponible y al monto a cubrir', () => {
    // pide 999, disponible 80, venta 50 → 50
    expect(aplicarSaldoFavor(80, 50, 999)).toEqual({ aplicado: 50, restante: 30 });
  });

  it('sin disponible no aplica nada', () => {
    expect(aplicarSaldoFavor(0, 100)).toEqual({ aplicado: 0, restante: 0 });
  });

  it('solicitado negativo se trata como 0', () => {
    expect(aplicarSaldoFavor(100, 100, -50)).toEqual({ aplicado: 0, restante: 100 });
  });
});

describe('tieneSaldoFavor', () => {
  it('true cuando hay disponible', () => {
    expect(tieneSaldoFavor(100, 40)).toBe(true);
  });
  it('false cuando no hay', () => {
    expect(tieneSaldoFavor(100, 100)).toBe(false);
  });
});

describe('SALDO_FAVOR_METODO', () => {
  it('es un identificador estable distinto de efectivo', () => {
    expect(SALDO_FAVOR_METODO).toBe('saldo_favor');
    expect(SALDO_FAVOR_METODO).not.toBe('efectivo');
  });
});
