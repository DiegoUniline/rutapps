import { describe, it, expect, vi } from 'vitest';

const llamadas: { self: unknown; fn: string; args: Record<string, unknown> }[] = [];
const cliente = {
  rest: {},
  rpc(this: { rest?: unknown }, fn: string, args: Record<string, unknown>) {
    if (!this?.rest) throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    llamadas.push({ self: this, fn, args });
    return Promise.resolve(
      args.p_destino_pago ? { error: null } : { error: { message: 'PAGADA|651.00|La venta tiene pagos por 651.00.' } },
    );
  },
};
vi.mock('@/lib/supabase', () => ({ supabase: cliente }));

describe('cancelarVenta', () => {
  it('llama a la BD conservando el cliente y reintenta con el destino elegido', async () => {
    const { cancelarVenta } = await import('@/lib/cancelarVenta');
    const pedir = vi.fn().mockResolvedValue('saldo_favor');
    const r = await cancelarVenta('v1', pedir);
    expect(r).toEqual({ error: null, cancelado: false, destino: 'saldo_favor' });
    expect(pedir).toHaveBeenCalledWith({ monto: 651, mensaje: 'La venta tiene pagos por 651.00.' });
    expect(llamadas.map(l => l.args.p_destino_pago)).toEqual([null, 'saldo_favor']);
    expect(llamadas.every(l => l.self === cliente)).toBe(true);
  });
});
