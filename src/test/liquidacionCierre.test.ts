/**
 * F3 (D-049): desglose congelado de la liquidación y aviso de movimientos posteriores.
 */
import { describe, it, expect } from 'vitest';
import { parseLiquidacionDesglose, cambiosDespuesDeAprobar } from '@/lib/liquidacionCierre';

// Forma real de fn_liquidacion_desglose (PostgREST manda numeric como número o texto).
const congeladoRaw = {
  cobros_efectivo: '80.00', gastos: '50.00', devoluciones_dinero: '7.75', reembolsos: '0', esperado: '22.25',
  version: 1, desde: '2026-11-20', hasta: '2026-11-20',
  cobros_por_metodo: { efectivo: 80, transferencia: '120.50' },
  cobros_transferencia: 120.5, cobros_tarjeta: 0, cobros_total: 200.5, cobros_saldos_anteriores: 30,
  dinero_devuelto: 7.75, ventas_contado: 150, ventas_contado_n: 2, ventas_credito: 500, ventas_credito_n: 1,
  efectivo_entregado: 20, diferencia: -2.25, calculado_at: '2026-11-20T23:00:00Z',
};

describe('parseLiquidacionDesglose', () => {
  it('lee el desglose congelado completo', () => {
    const d = parseLiquidacionDesglose(congeladoRaw)!;
    expect(d.esperado).toBe(22.25);
    expect(d.cobrosEfectivo).toBe(80);
    expect(d.cobrosTransferencia).toBe(120.5);
    expect(d.cobrosPorMetodo).toEqual({ efectivo: 80, transferencia: 120.5 });
    expect(d.gastos).toBe(50);
    expect(d.dineroDevuelto).toBe(7.75);
    expect(d.ventasContado).toBe(150);
    expect(d.ventasCreditoN).toBe(1);
    expect(d.cobrosSaldosAnteriores).toBe(30);
    expect(d.diferencia).toBe(-2.25);
    expect(d.calculadoAt).toBe('2026-11-20T23:00:00Z');
  });

  it('sin dinero_devuelto lo arma con devoluciones + reembolsos', () => {
    expect(parseLiquidacionDesglose({ devoluciones_dinero: 7.75, reembolsos: '100' })!.dineroDevuelto).toBe(107.75);
  });

  it('nulo, texto o arreglo no son desglose (aprobada antes de F3 = en vivo)', () => {
    expect(parseLiquidacionDesglose(null)).toBeNull();
    expect(parseLiquidacionDesglose('x')).toBeNull();
    expect(parseLiquidacionDesglose([])).toBeNull();
  });
});

describe('cambiosDespuesDeAprobar', () => {
  const congelado = parseLiquidacionDesglose(congeladoRaw);

  it('sin movimientos posteriores no avisa nada', () => {
    expect(cambiosDespuesDeAprobar(congelado, parseLiquidacionDesglose({ ...congeladoRaw, calculado_at: 'otro' }))).toEqual([]);
  });

  it('una venta de contado y un gasto posteriores se avisan; lo congelado no cambia', () => {
    const vivo = parseLiquidacionDesglose({ ...congeladoRaw, ventas_contado: 200, gastos: 55, esperado: 17.25 });
    const cambios = cambiosDespuesDeAprobar(congelado, vivo);
    expect(cambios.map(c => c.concepto)).toEqual(['Efectivo esperado', 'Gastos', 'Ventas de contado']);
    expect(cambios[0]).toEqual({ concepto: 'Efectivo esperado', congelado: 22.25, actual: 17.25 });
    expect(congelado!.esperado).toBe(22.25);
  });

  it('ignora diferencias menores a un centavo y faltantes', () => {
    const vivo = parseLiquidacionDesglose({ ...congeladoRaw, esperado: 22.2549 });
    expect(cambiosDespuesDeAprobar(congelado, vivo)).toEqual([]);
    expect(cambiosDespuesDeAprobar(congelado, null)).toEqual([]);
    expect(cambiosDespuesDeAprobar(null, congelado)).toEqual([]);
  });
});
