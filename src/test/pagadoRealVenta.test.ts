import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pagadoRealVenta, porCobrarAlEntregar } from '@/lib/ventaCerrada';

// PED-0250 (Multi, 2026-11-23): pedido D-034 sin entregar ni cobrar salía como «pagado».
const pedido = (extra: Record<string, unknown> = {}) => ({
  tipo: 'pedido', politica_cobro: 'entregado', status: 'confirmado', total: 50, saldo_pendiente: 0,
  cobro_aplicaciones: [], ...extra,
});

describe('pagado real en listas', () => {
  it('pedido sin entregar y sin cobros: pagado 0 y 50 por cobrar al entregar', () => {
    expect(pagadoRealVenta(pedido())).toBe(0);
    expect(porCobrarAlEntregar(pedido())).toBe(50);
  });
  it('pedido con anticipo: pagado = cobros reales', () => {
    const v = pedido({ cobro_aplicaciones: [{ monto_aplicado: 20, cobros: { status: 'activo' } }] });
    expect(pagadoRealVenta(v)).toBe(20);
    expect(porCobrarAlEntregar(v)).toBe(30);
  });
  it('pedido entregado: ya no es «al entregar»', () => {
    expect(porCobrarAlEntregar(pedido({ status: 'entregado' }))).toBe(0);
  });
  it('venta directa: igual que antes (total − saldo)', () => {
    expect(pagadoRealVenta({ tipo: 'venta_directa', status: 'confirmado', total: 100, saldo_pendiente: 40,
      cobro_aplicaciones: [{ monto_aplicado: 60, cobros: { status: 'activo' } }] })).toBe(60);
  });
});

describe('dashboard: con filtro de vendedor el cobro cuenta para quien cobró', () => {
  it('filtra cobros por user_id del perfil elegido', () => {
    const src = readFileSync('src/hooks/useDashboardData.ts', 'utf8');
    expect(src).toContain("const delVendedor = (rows as any[]).filter((c) => c.user_id === userId);");
    expect(src).not.toContain('atribuirCobrosAVendedor(');
  });
});
