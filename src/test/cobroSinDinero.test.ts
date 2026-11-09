import { describe, it, expect } from 'vitest';
import { esCobroSinDinero } from '@/lib/saldoFavor';

describe('esCobroSinDinero', () => {
  it('saldo a favor y ajuste de liquidación no son dinero recibido', () => {
    expect(esCobroSinDinero('saldo_favor')).toBe(true);
    expect(esCobroSinDinero('ajuste_liquidacion')).toBe(true);
    expect(esCobroSinDinero('efectivo')).toBe(false);
    expect(esCobroSinDinero('transferencia')).toBe(false);
    expect(esCobroSinDinero(null)).toBe(false);
  });
});
