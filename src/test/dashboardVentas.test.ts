import { describe, it, expect } from 'vitest';
import { ventasPorDia, ventasPorVendedor } from '@/hooks/useDashboardData';

const rows = [
  { fecha: '2026-10-01', total: 100, vendedor_id: 'a', vendedores: { nombre: 'Ana' } },
  { fecha: '2026-10-01', total: 50, vendedor_id: 'b', vendedores: { nombre: 'Beto' } },
  { fecha: '2026-10-03', total: 30, vendedor_id: 'a', vendedores: { nombre: 'Ana' } },
  { fecha: '2026-10-03', total: null, vendedor_id: null, vendedores: null },
];

describe('tablero: ventas por día y por vendedor desde las filas del periodo', () => {
  it('suma por día y rellena con ceros los días sin venta', () => {
    const r = ventasPorDia(rows, { from: new Date('2026-10-01T12:00:00'), to: new Date('2026-10-03T12:00:00') });
    expect(r).toEqual([
      { date: '2026-10-01', total: 150 },
      { date: '2026-10-02', total: 0 },
      { date: '2026-10-03', total: 30 },
    ]);
  });

  it('agrupa por vendedor, omite ventas sin vendedor y ordena por total', () => {
    expect(ventasPorVendedor(rows)).toEqual([
      { id: 'a', nombre: 'Ana', total: 130, count: 2 },
      { id: 'b', nombre: 'Beto', total: 50, count: 1 },
    ]);
  });
});
