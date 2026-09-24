import { describe, expect, it } from 'vitest';
import { atribuirCobrosAVendedor, type DashboardCobroAplicacion } from '@/lib/dashboardCobros';

const cobros = [
  { id: 'cobro-1', monto: 1000, cliente_id: 'cliente-1', fecha: '2026-09-10' },
];

describe('atribuirCobrosAVendedor', () => {
  it('atribuye solo el monto aplicado a ventas del vendedor seleccionado', () => {
    const aplicaciones: DashboardCobroAplicacion[] = [
      { cobro_id: 'cobro-1', monto_aplicado: 300, ventas: { vendedor_id: 'vend-a', status: 'entregado' } },
      { cobro_id: 'cobro-1', monto_aplicado: 700, ventas: { vendedor_id: 'vend-b', status: 'entregado' } },
    ];

    expect(
      atribuirCobrosAVendedor(cobros, 'vend-a', aplicaciones, new Map()),
    ).toEqual([
      { ...cobros[0], monto: 300 },
    ]);

    expect(
      atribuirCobrosAVendedor(cobros, 'vend-b', aplicaciones, new Map()),
    ).toEqual([
      { ...cobros[0], monto: 700 },
    ]);
  });

  it('no duplica el cobro cuando tiene varias aplicaciones del mismo vendedor', () => {
    const aplicaciones: DashboardCobroAplicacion[] = [
      { cobro_id: 'cobro-1', monto_aplicado: 250, ventas: { vendedor_id: 'vend-a', status: 'confirmado' } },
      { cobro_id: 'cobro-1', monto_aplicado: 150, ventas: { vendedor_id: 'vend-a', status: 'entregado' } },
    ];

    const resultado = atribuirCobrosAVendedor(cobros, 'vend-a', aplicaciones, new Map());

    expect(resultado).toHaveLength(1);
    expect(resultado[0].monto).toBe(400);
  });

  it('excluye aplicaciones correspondientes a ventas canceladas', () => {
    const aplicaciones: DashboardCobroAplicacion[] = [
      { cobro_id: 'cobro-1', monto_aplicado: 400, ventas: { vendedor_id: 'vend-a', status: 'cancelado' } },
      { cobro_id: 'cobro-1', monto_aplicado: 600, ventas: { vendedor_id: 'vend-a', status: 'entregado' } },
    ];

    const resultado = atribuirCobrosAVendedor(cobros, 'vend-a', aplicaciones, new Map());

    expect(resultado).toHaveLength(1);
    expect(resultado[0].monto).toBe(600);
  });

  it('usa el vendedor asignado al cliente cuando el cobro aún no tiene aplicaciones', () => {
    const clienteVendedor = new Map<string, string | null>([
      ['cliente-1', 'vend-a'],
    ]);

    expect(
      atribuirCobrosAVendedor(cobros, 'vend-a', [], clienteVendedor),
    ).toEqual(cobros);

    expect(
      atribuirCobrosAVendedor(cobros, 'vend-b', [], clienteVendedor),
    ).toEqual([]);
  });

  it('devuelve cero filas para un vendedor sin cobros atribuibles', () => {
    const aplicaciones: DashboardCobroAplicacion[] = [
      { cobro_id: 'cobro-1', monto_aplicado: 1000, ventas: { vendedor_id: 'vend-a', status: 'entregado' } },
    ];

    expect(
      atribuirCobrosAVendedor(cobros, 'vend-c', aplicaciones, new Map()),
    ).toEqual([]);
  });
});
