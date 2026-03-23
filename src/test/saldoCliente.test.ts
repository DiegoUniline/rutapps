import { describe, it, expect } from 'vitest';

/**
 * Saldo de cliente = suma de saldo_pendiente de todas sus ventas activas
 */
function calcSaldoCliente(ventas: { saldo_pendiente: number; status: string }[]): number {
  return ventas
    .filter(v => v.status !== 'cancelado')
    .reduce((sum, v) => sum + (v.saldo_pendiente ?? 0), 0);
}

function excedeLimiteCredito(saldoActual: number, nuevoTotal: number, limite: number): boolean {
  return (saldoActual + nuevoTotal) > limite;
}

describe('calcSaldoCliente', () => {
  it('sums pending balances excluding cancelled', () => {
    const ventas = [
      { saldo_pendiente: 100, status: 'confirmado' },
      { saldo_pendiente: 200, status: 'entregado' },
      { saldo_pendiente: 500, status: 'cancelado' },
    ];
    expect(calcSaldoCliente(ventas)).toBe(300);
  });

  it('returns 0 for empty array', () => {
    expect(calcSaldoCliente([])).toBe(0);
  });
});

describe('excedeLimiteCredito', () => {
  it('returns true when exceeds limit', () => {
    expect(excedeLimiteCredito(45000, 6000, 50000)).toBe(true);
  });

  it('returns false when within limit', () => {
    expect(excedeLimiteCredito(20000, 5000, 50000)).toBe(false);
  });

  it('returns false at exact limit', () => {
    expect(excedeLimiteCredito(40000, 10000, 50000)).toBe(false);
  });
});
