import { describe, expect, it } from 'vitest';
import { buildPosTicketPayments } from '@/lib/posTicketPayments';

describe('buildPosTicketPayments', () => {
  it('no inventa pagos para una venta a credito', () => {
    const result = buildPosTicketPayments({
      condicion: 'credito',
      splits: [],
      total: 450,
      fecha: '2026-08-27',
    });

    expect(result).toEqual({
      metodoPago: undefined,
      montoRecibido: undefined,
      pagos: [],
    });
  });

  it('ignora cualquier importe residual si la venta es a credito', () => {
    const result = buildPosTicketPayments({
      condicion: 'credito',
      splits: [{ metodo: 'efectivo', monto: 450 }],
      total: 450,
      fecha: '2026-08-27',
    });

    expect(result.pagos).toEqual([]);
    expect(result.montoRecibido).toBeUndefined();
    expect(result.metodoPago).toBeUndefined();
  });

  it('conserva los pagos capturados en una venta de contado', () => {
    const result = buildPosTicketPayments({
      condicion: 'contado',
      splits: [
        { metodo: 'efectivo', monto: 200 },
        { metodo: 'tarjeta', monto: 250, referencia: 'ABC123' },
      ],
      total: 450,
      fecha: '2026-08-27',
    });

    expect(result.metodoPago).toBe('efectivo + tarjeta');
    expect(result.montoRecibido).toBe(450);
    expect(result.pagos).toHaveLength(2);
    expect(result.pagos[1]).toMatchObject({
      metodo: 'tarjeta',
      monto: 250,
      referencia: 'ABC123',
      fecha: '2026-08-27',
    });
  });

  it('mantiene el respaldo en efectivo para contado sin desglose', () => {
    const result = buildPosTicketPayments({
      condicion: 'contado',
      splits: [],
      total: 120,
      fecha: '2026-08-27',
    });

    expect(result.metodoPago).toBe('efectivo');
    expect(result.montoRecibido).toBe(120);
    expect(result.pagos).toEqual([
      { metodo: 'efectivo', monto: 120, referencia: '', fecha: '2026-08-27' },
    ]);
  });
});
