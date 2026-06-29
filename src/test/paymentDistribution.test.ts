import { describe, expect, it } from 'vitest';
import {
  autoDistributeSurplus,
  distributePaymentsFIFO,
  type PendingAccountInput,
} from '@/lib/paymentDistribution';

const acct = (id: string, saldo: number, montoAplicar = 0): PendingAccountInput => ({
  id,
  saldo_pendiente: saldo,
  montoAplicar,
});

describe('autoDistributeSurplus', () => {
  it('no asigna nada cuando no hay sobrante (pago = total)', () => {
    const res = autoDistributeSurplus(100, 100, [acct('a', 50), acct('b', 80)]);
    expect(res.map(a => a.montoAplicar)).toEqual([0, 0]);
  });

  it('no asigna nada cuando el pago es menor al total', () => {
    const res = autoDistributeSurplus(100, 60, [acct('a', 50)]);
    expect(res[0].montoAplicar).toBe(0);
  });

  it('reparte el sobrante FIFO: primera cuenta completa, segunda parcial, tercera cero', () => {
    // sobrante = 130 - 100 = 30. a:20 (full), b:10 (parcial de 80), c:0
    const res = autoDistributeSurplus(100, 130, [acct('a', 20), acct('b', 80), acct('c', 40)]);
    expect(res.map(a => a.montoAplicar)).toEqual([20, 10, 0]);
  });

  it('no excede el saldo de cada cuenta', () => {
    // sobrante 50, primera cuenta solo debe 15 → toma 15, resto 35 a la segunda
    const res = autoDistributeSurplus(100, 150, [acct('a', 15), acct('b', 200)]);
    expect(res[0].montoAplicar).toBe(15);
    expect(res[1].montoAplicar).toBe(35);
  });

  it('no muta el arreglo de entrada', () => {
    const input = [acct('a', 20)];
    autoDistributeSurplus(100, 130, input);
    expect(input[0].montoAplicar).toBe(0);
  });
});

describe('distributePaymentsFIFO', () => {
  it('contado con pago exacto: cubre la venta, sin cambio', () => {
    const res = distributePaymentsFIFO(100, true, [{ monto: 100, metodo: 'efectivo' }], []);
    expect(res.appliedToSale).toBe(100);
    expect(res.saleNewSaldo).toBe(0);
    expect(res.cambio).toBe(0);
  });

  it('contado con sobrepago en efectivo: genera cambio', () => {
    const res = distributePaymentsFIFO(100, true, [{ monto: 150, metodo: 'efectivo' }], []);
    expect(res.appliedToSale).toBe(100);
    expect(res.cambio).toBe(50);
  });

  it('contado con sobrepago SOLO con tarjeta: no genera cambio', () => {
    const res = distributePaymentsFIFO(100, true, [{ monto: 150, metodo: 'tarjeta' }], []);
    expect(res.appliedToSale).toBe(100);
    expect(res.cambio).toBe(0);
  });

  it('venta a crédito (no contado): no carga a la venta, aplica a cuentas pendientes', () => {
    const res = distributePaymentsFIFO(
      100,
      false,
      [{ monto: 80, metodo: 'efectivo' }],
      [acct('a', 200, 80)],
    );
    expect(res.appliedToSale).toBe(0);
    expect(res.saleNewSaldo).toBe(100);
    expect(res.accountApplications[0]).toMatchObject({
      accountId: 'a',
      applied: 80,
      newSaldo: 120,
    });
    expect(res.totalAppliedToAccounts).toBe(80);
    expect(res.cambio).toBe(0);
  });

  it('contado + cuentas pendientes: paga venta y luego abona según montoAplicar', () => {
    // recibe 250: 100 a la venta, 80 a la cuenta a, sobran 70 efectivo → cambio
    const res = distributePaymentsFIFO(
      100,
      true,
      [{ monto: 250, metodo: 'efectivo' }],
      [acct('a', 80, 80)],
    );
    expect(res.appliedToSale).toBe(100);
    expect(res.totalAppliedToAccounts).toBe(80);
    expect(res.accountApplications[0].newSaldo).toBe(0);
    expect(res.cambio).toBe(70);
  });

  it('ignora cuentas con montoAplicar 0', () => {
    const res = distributePaymentsFIFO(
      0,
      false,
      [{ monto: 100, metodo: 'efectivo' }],
      [acct('a', 50, 0), acct('b', 50, 50)],
    );
    expect(res.accountApplications).toHaveLength(1);
    expect(res.accountApplications[0].accountId).toBe('b');
  });

  it('reporta totalReceived como la suma de todos los pagos', () => {
    const res = distributePaymentsFIFO(
      100,
      true,
      [{ monto: 60, metodo: 'efectivo' }, { monto: 40, metodo: 'tarjeta' }],
      [],
    );
    expect(res.totalReceived).toBe(100);
  });

  it('método por defecto (sin metodo) se trata como efectivo y genera cambio', () => {
    const res = distributePaymentsFIFO(100, true, [{ monto: 120 }], []);
    expect(res.cambio).toBe(20);
  });
});
