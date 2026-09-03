import { describe, expect, it } from 'vitest';
import { saldoVentaTrasEditar } from '@/lib/ventaEditBalance';

describe('saldoVentaTrasEditar', () => {
  it('deja pendiente únicamente el producto agregado a un pedido liquidado', () => {
    expect(saldoVentaTrasEditar(150, [
      { monto_aplicado: 100, cobros: { status: 'activo' } },
    ])).toBe(50);
  });

  it('conserva pagos parciales y excluye cobros cancelados', () => {
    expect(saldoVentaTrasEditar(200, [
      { monto_aplicado: 60, cobros: { status: 'activo' } },
      { monto_aplicado: 90, cobros: { status: 'cancelado' } },
    ])).toBe(140);
  });

  it('nunca genera un saldo negativo', () => {
    expect(saldoVentaTrasEditar(80, [
      { monto_aplicado: 100, cobros: { status: 'activo' } },
    ])).toBe(0);
  });
});
