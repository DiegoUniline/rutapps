import { describe, expect, it } from 'vitest';
import { buildReporteComisionVenta, estadoCuentaVenta, type ComisionVentaSource } from '@/lib/reporteComisionesVentas';

const sale = (overrides: Partial<ComisionVentaSource> = {}): ComisionVentaSource => ({
  id: 'venta-1', folio: 'V-001', fecha: '2026-09-07', total: 1000,
  saldo_pendiente: 250, status: 'confirmado', requiere_factura: true,
  cliente_id: 'cliente-1', vendedor_id: 'vendedor-1',
  clientes: { nombre: 'Cliente Uno', rfc: 'abc010101abc', zonas: { nombre: 'Ruta Norte' } },
  vendedores: { nombre: 'Vendedora Uno' }, venta_comisiones: [], ...overrides,
});

describe('reporte de comisiones por venta', () => {
  it('incluye una venta con regla de comisión en cero', () => {
    const row = buildReporteComisionVenta(sale());
    expect(row.comision).toBe(0);
    expect(row.estadoComision).toBe('sin_comision');
    expect(row.total).toBe(1000);
  });

  it('consolida comisiones por venta sin duplicar el total', () => {
    const row = buildReporteComisionVenta(sale({ venta_comisiones: [
      { comision_monto: 20, pagada: false, pago_comision_id: null },
      { comision_monto: 30, pagada: true, pago_comision_id: 'pago-1' },
    ] }));
    expect(row.comision).toBe(50);
    expect(row.comisionPendiente).toBe(20);
    expect(row.comisionPagada).toBe(30);
    expect(row.estadoComision).toBe('parcial');
    expect(row.total).toBe(1000);
  });

  it('distingue una comisión incluida en un recibo', () => {
    const row = buildReporteComisionVenta(sale({ venta_comisiones: [
      { comision_monto: 75.25, pagada: false, pago_comision_id: 'recibo-1' },
    ] }));
    expect(row.comisionEnRecibo).toBe(75.25);
    expect(row.estadoComision).toBe('en_recibo');
  });

  it('una cancelación no suma venta, saldo ni comisión', () => {
    const row = buildReporteComisionVenta(sale({
      status: 'cancelado', saldo_pendiente: 250,
      venta_comisiones: [{ comision_monto: 100, pagada: false, pago_comision_id: null }],
    }));
    expect(row.estadoCuenta).toBe('cancelada');
    expect(row.estadoComision).toBe('cancelada');
    expect(row.total).toBe(0);
    expect(row.saldo).toBe(0);
    expect(row.comision).toBe(0);
  });

  it('usa requiere_factura como regla fiscal y normaliza el RFC', () => {
    const row = buildReporteComisionVenta(sale());
    expect(row.requiereFactura).toBe(true);
    expect(row.rfc).toBe('ABC010101ABC');
  });

  it('calcula adeudo y liquidación con tolerancia de un centavo', () => {
    expect(estadoCuentaVenta('confirmado', 0.01)).toBe('liquidada');
    expect(estadoCuentaVenta('entregado', 0.02)).toBe('adeudo');
    expect(estadoCuentaVenta('cancelado', 100)).toBe('cancelada');
  });
});
