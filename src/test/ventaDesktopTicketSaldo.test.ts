import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchVentaDesktopTicketSaldo } from '@/lib/ventaDesktopTicketSaldo';

const db = vi.hoisted(() => {
  const query = {
    select: vi.fn(), eq: vi.fn(), gt: vi.fn(), in: vi.fn(),
    order: vi.fn(), neq: vi.fn(), range: vi.fn(),
  };
  return { from: vi.fn(), query };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from } }));

beforeEach(() => {
  vi.resetAllMocks();
  db.from.mockReturnValue(db.query);
  for (const method of ['select', 'eq', 'gt', 'in', 'order', 'neq'] as const) {
    db.query[method].mockReturnValue(db.query);
  }
  db.query.range.mockResolvedValue({ data: [], error: null });
});

describe('saldo del ticket de Ventas en escritorio', () => {
  it('incluye deuda anterior aunque esta venta ya esté pagada', async () => {
    db.query.range.mockResolvedValue({ data: [{ saldo_pendiente: 100 }, { saldo_pendiente: 200 }], error: null });
    expect(await fetchVentaDesktopTicketSaldo('empresa-1', 'cliente-1', 'venta-actual', 0))
      .toEqual({ saldoAnterior: 300, saldoNuevo: 300 });
    expect(db.query.eq).toHaveBeenCalledWith('empresa_id', 'empresa-1');
    expect(db.query.eq).toHaveBeenCalledWith('cliente_id', 'cliente-1');
    expect(db.query.neq).toHaveBeenCalledWith('id', 'venta-actual');
    expect(db.query.gt).toHaveBeenCalledWith('saldo_pendiente', 0);
    expect(db.query.in).toHaveBeenCalledWith('status', ['borrador', 'confirmado', 'entregado', 'facturado']);
  });

  it('suma solamente el saldo pendiente de esta venta al saldo anterior', async () => {
    db.query.range.mockResolvedValue({ data: [{ saldo_pendiente: 300.1 }], error: null });
    expect(await fetchVentaDesktopTicketSaldo('empresa-1', 'cliente-1', 'venta-actual', 50.2))
      .toEqual({ saldoAnterior: 300.1, saldoNuevo: 350.3 });
  });

  it('incluye ventas más allá de las primeras 1000', async () => {
    db.query.range.mockImplementation(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 1000 }, () => ({ saldo_pendiente: 1 }))
        : from === 1000 ? [{ saldo_pendiente: 25 }] : [],
      error: null,
    }));
    expect(await fetchVentaDesktopTicketSaldo('empresa-1', 'cliente-1', 'venta-actual', 0))
      .toEqual({ saldoAnterior: 1025, saldoNuevo: 1025 });
    expect(db.query.range).toHaveBeenCalledWith(1000, 1999);
  });

  it('no imprime un saldo cero inventado si falla la consulta', async () => {
    db.query.range.mockResolvedValue({ data: null, error: new Error('consulta fallida') });
    await expect(fetchVentaDesktopTicketSaldo('empresa-1', 'cliente-1', 'venta-actual', 0))
      .rejects.toThrow('consulta fallida');
  });

  it('sin cliente no consulta deudas de otros clientes', async () => {
    expect(await fetchVentaDesktopTicketSaldo('empresa-1', null, 'venta-actual', 50))
      .toEqual({ saldoAnterior: 0, saldoNuevo: 50 });
    expect(db.from).not.toHaveBeenCalled();
  });
});