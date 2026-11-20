/**
 * H10: ticket de venta de ruta. En crédito con pago a cuentas anteriores el pago se
 * restaba dos veces (de esta venta y de las anteriores).
 */
import { describe, it, expect } from 'vitest';
import { saldosTicketRuta } from '@/lib/ticketSaldoRuta';
import { construirModeloTicket, type RenglonTicket } from '@/lib/ticketModelo';
import type { TicketData } from '@/lib/ticketHtml';
import { ticketRutaCredito } from './fixtures/ticketFixtures';

const pares = (r: RenglonTicket[]) => r.flatMap(x => (x.tipo === 'par' ? [`${x.izq.trim()}=${x.der}`] : []));

describe('saldosTicketRuta', () => {
  it('crédito: saldo ant 1000, venta 500, pago 300 a cuenta anterior → saldo 1200 y nada pagado de esta venta', () => {
    const s = saldosTicketRuta({ condicionPago: 'credito', total: 500, pagos: 300, aplicadoACuentas: 300, saldoAnterior: 1000 });
    expect(s.pagadoEstaVenta).toBe(0);
    expect(s.saldoRestanteEstaVenta).toBe(500);
    expect(s.saldoAnteriorRestante).toBe(700);
    expect(s.saldoNuevo).toBe(1200); // antes 900
  });

  it('contado pagado completo y sobrante a cuentas anteriores', () => {
    const s = saldosTicketRuta({ condicionPago: 'contado', total: 500, pagos: 800, aplicadoACuentas: 300, saldoAnterior: 1000 });
    expect(s.pagadoEstaVenta).toBe(500);
    expect(s.saldoRestanteEstaVenta).toBe(0);
    expect(s.saldoNuevo).toBe(700);
  });

  it('contado sin pago (pago contra entrega) queda debiendo el total', () => {
    const s = saldosTicketRuta({ condicionPago: 'contado', total: 500, pagos: 0, aplicadoACuentas: 0, saldoAnterior: 0 });
    expect(s.pagadoEstaVenta).toBe(0);
    expect(s.saldoNuevo).toBe(500);
  });

  it('contado con cambio: lo pagado de la venta no pasa del total', () => {
    const s = saldosTicketRuta({ condicionPago: 'contado', total: 450.5, pagos: 500, aplicadoACuentas: 0, saldoAnterior: 0 });
    expect(s.pagadoEstaVenta).toBe(450.5);
    expect(s.saldoNuevo).toBe(0);
  });

  it('contado pago parcial: max(0, total − (pagos − abonado a cuentas))', () => {
    const s = saldosTicketRuta({ condicionPago: 'contado', total: 500, pagos: 200, aplicadoACuentas: 0, saldoAnterior: 100 });
    expect(s.saldoRestanteEstaVenta).toBe(300);
    expect(s.saldoNuevo).toBe(400);
  });
});

describe('ticket de ruta a crédito con abono a cuentas anteriores (modelo)', () => {
  const s = saldosTicketRuta({ condicionPago: 'credito', total: 500, pagos: 300, aplicadoACuentas: 300, saldoAnterior: 1000 });
  const td: TicketData = {
    ...ticketRutaCredito,
    total: 500,
    saldoAnterior: 1000,
    pagoAplicado: 300,
    pagadoEstaVenta: s.pagadoEstaVenta,
    saldoNuevo: s.saldoNuevo,
    pagos: [{ metodo: 'efectivo', monto: 300, fecha: '20/11/2026' }],
  };
  const p = pares(construirModeloTicket(td).cuerpo);

  it('«Total pagado» es $0.00: el pago fue abono a cuentas anteriores', () => {
    expect(p).toContain('Total pagado=$0.00');
  });

  it('estado de cuenta: Saldo ant 1000 − Pago 300 + Venta 500 = 1200', () => {
    expect(p).toContain('Saldo ant=$1,000.00');
    expect(p).toContain('Pago=-$300.00');
    expect(p).toContain('+Venta=$500.00');
    expect(p).toContain('Saldo=$1,200.00');
  });

  it('sin pagadoEstaVenta (otros llamadores) el comportamiento no cambia', () => {
    const sin = pares(construirModeloTicket({ ...td, pagadoEstaVenta: undefined }).cuerpo);
    expect(sin).toContain('Total pagado=$300.00');
  });
});
