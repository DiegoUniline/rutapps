import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchConcentradoReport, type ConcentradoReportFilters } from '@/lib/concentradoReportData';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as { table: string; constraints: [string, unknown][] }[],
  failTable: '',
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  let from = 0, to = 999;
  const checks: ((row: Record<string, unknown>) => boolean)[] = [];
  const constraints: [string, unknown][] = [];
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => { constraints.push([key, value]); checks.push(r => r[key] === value); return q; },
    neq: (key: string, value: unknown) => { checks.push(r => r[key] !== value); return q; },
    in: (key: string, values: unknown[]) => { checks.push(r => values.includes(r[key])); return q; },
    gte: (key: string, value: string) => { checks.push(r => String(r[key]) >= value); return q; },
    lte: (key: string, value: string) => { checks.push(r => String(r[key]) <= value); return q; },
    range: (a: number, b: number) => { from = a; to = b; return q; },
    then: (resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      state.calls.push({ table, constraints });
      return Promise.resolve({
        data: state.tables[table]?.filter(row => checks.every(check => check(row))).slice(from, to + 1) ?? [],
        error: table === state.failTable ? new Error('Lectura fallida') : null,
      }).then(resolve, reject);
    },
  };
  return q;
} } }));

const filters: ConcentradoReportFilters = {
  empresaId: 'tenant', desde: '2026-09-01', hasta: '2026-09-30', fechaField: 'fecha_entrega', statuses: ['confirmado'], tipo: 'pedido',
};
beforeEach(() => { state.tables = {}; state.calls = []; state.failTable = ''; });
describe('lectura completa del reporte', () => {
  it('recupera más de 1,000 pedidos y líneas, con ámbito de empresa en todas las lecturas', async () => {
    state.tables.ventas = Array.from({ length: 1001 }, (_, i) => ({ id: `v${i}`, folio: `P-${i}`, empresa_id: 'tenant', fecha_entrega: '2026-09-10', tipo: 'pedido', status: 'confirmado' }));
    state.tables.venta_lineas = Array.from({ length: 1101 }, (_, i) => ({ id: `l${i}`, empresa_id: 'tenant', venta_id: i < 1100 ? 'v0' : 'v1000', cantidad: 1 }));
    state.tables.entregas = [{ id: 'e1', empresa_id: 'tenant', pedido_id: 'v0', status: 'surtido' }];
    state.tables.entrega_lineas = Array.from({ length: 1100 }, (_, i) => ({ id: `e${i}`, 'entregas.empresa_id': 'tenant', entrega_id: 'e1', cantidad_entregada: 1 }));
    const result = await fetchConcentradoReport(filters);
    expect(result.orders).toHaveLength(1001);
    expect(result.saleLines).toHaveLength(1101);
    expect(result.saleLines[result.saleLines.length - 1]?.venta_id).toBe('v1000');
    expect(result.deliveryLines).toHaveLength(1100);
    for (const call of state.calls) expect(call.constraints).toContainEqual([call.table === 'entrega_lineas' ? 'entregas.empresa_id' : 'empresa_id', 'tenant']);
  });
  it('excluye otra empresa, otro estado y fechas fuera del rango; propaga errores de lectura', async () => {
    state.tables.ventas = [
      { id: 'ok', empresa_id: 'tenant', fecha_entrega: '2026-09-10', tipo: 'pedido', status: 'confirmado' },
      { id: 'other', empresa_id: 'other', fecha_entrega: '2026-09-10', tipo: 'pedido', status: 'confirmado' },
      { id: 'cancel', empresa_id: 'tenant', fecha_entrega: '2026-09-10', tipo: 'pedido', status: 'cancelado' },
      { id: 'past', empresa_id: 'tenant', fecha_entrega: '2026-08-10', tipo: 'pedido', status: 'confirmado' },
    ];
    expect((await fetchConcentradoReport(filters)).orders.map(o => o.id)).toEqual(['ok']);
    state.failTable = 'venta_lineas';
    await expect(fetchConcentradoReport(filters)).rejects.toThrow('Lectura fallida');
  });
  it('rechaza rangos invertidos antes de consultar', async () => {
    await expect(fetchConcentradoReport({ ...filters, desde: '2026-10-01' })).rejects.toThrow('fecha inicial');
    expect(state.calls).toEqual([]);
  });
});
