import { describe, it, expect } from 'vitest';
import { estadoPagoMovil, etiquetaCondicionPago } from '@/lib/estadoPagoMovil';

describe('estadoPagoMovil', () => {
  const pedido = { tipo: 'pedido', status: 'confirmado', condicion_pago: 'por_definir', total: 500, saldo_pendiente: 0 };
  it('pedido «Por definir» sin cobro y saldo 0 → pendiente de pago (no «Pagado»)', () => {
    expect(estadoPagoMovil(pedido, null)).toEqual({ tipo: 'pendiente', monto: 500 });
    expect(estadoPagoMovil(pedido, 0)).toEqual({ tipo: 'pendiente', monto: 500 });
  });
  it('pedido con anticipo que cubre el total → pagado; parcial → pendiente por la diferencia', () => {
    expect(estadoPagoMovil(pedido, 500)).toEqual({ tipo: 'pagado' });
    expect(estadoPagoMovil(pedido, 200)).toEqual({ tipo: 'pendiente', monto: 300 });
  });
  it('con saldo → saldo; venta directa o pedido entregado con saldo 0 → pagado', () => {
    expect(estadoPagoMovil({ ...pedido, saldo_pendiente: 120 }, null)).toEqual({ tipo: 'saldo', monto: 120 });
    expect(estadoPagoMovil({ tipo: 'venta_directa', status: 'entregado', total: 300, saldo_pendiente: 0 }, null)).toEqual({ tipo: 'pagado' });
    expect(estadoPagoMovil({ ...pedido, status: 'entregado' }, null)).toEqual({ tipo: 'pagado' });
  });
  it('cancelada y borrador', () => {
    expect(estadoPagoMovil({ ...pedido, status: 'cancelado' }, null)).toEqual({ tipo: 'cancelada' });
    expect(estadoPagoMovil({ ...pedido, status: 'borrador' }, null)).toEqual({ tipo: 'sin_estado' });
  });
  it('etiqueta de condición', () => {
    expect(etiquetaCondicionPago('por_definir')).toBe('Por definir');
    expect(etiquetaCondicionPago('credito')).toBe('Crédito');
    expect(etiquetaCondicionPago('contado')).toBe('Contado');
  });
});
