/**
 * F1 devoluciones (D-049): destino por renglón, precio de lista del cliente, acciones de
 * dinero sin «Descuento en venta», nota aplicada a la venta, una sola operación en la cola.
 * Los montos replican `_devolucion_linea_monto` (SQL) — la BD es la que guarda.
 */
import { describe, it, expect } from 'vitest';
import {
  destinoSugerido, accionUIaBd, montoDevolucionLinea, lineasParaRpc, resumenDevolucion,
  COLA_REGISTRAR_DEVOLUCION, type DevolucionLineaF1,
} from '@/lib/devolucionGuardado';
import { precioDevolucionCliente } from '@/lib/devolucionPrecio';
import { resolveProductPricing } from '@/lib/priceResolver';
import { buildSalePricingSnapshot } from '@/lib/salePricing';
import { saldosTicketRuta } from '@/lib/ticketSaldoRuta';
import { valorClave } from '@/lib/syncQueue';
import { construirModeloTicket } from '@/lib/ticketModelo';
import { ticketATexto } from '@/lib/ticketLayout';
import { reglaPrecioFijo } from './fixtures/tarifas';
import { ticketEjemplo } from './fixtures/ticketFixtures';

describe('destino sugerido por motivo (solo pre-selecciona)', () => {
  it('dañado / vencido / caducado → merma; el resto vendible', () => {
    expect(destinoSugerido('danado')).toBe('merma');
    expect(destinoSugerido('vencido')).toBe('merma');
    expect(destinoSugerido('caducado')).toBe('merma');
    expect(destinoSugerido('no_vendido')).toBe('vendible');
    expect(destinoSugerido('cambio')).toBe('vendible');
    expect(destinoSugerido(undefined)).toBe('vendible');
  });
  it('respeta «Configurar mermas» de la empresa', () => {
    expect(destinoSugerido('danado', { danado: false })).toBe('vendible');
    expect(destinoSugerido('otro', { otro: true })).toBe('merma');
    expect(destinoSugerido('vencido', { otro: true })).toBe('merma');
  });
});

describe('acciones (D-049)', () => {
  it('«Aplicar a la venta» es una nota de crédito aplicada', () => {
    expect(accionUIaBd('aplicar_venta')).toEqual({ accion: 'nota_credito', aplica_venta: true });
    expect(accionUIaBd('nota_credito')).toEqual({ accion: 'nota_credito', aplica_venta: false });
    expect(accionUIaBd('devolucion_dinero')).toEqual({ accion: 'devolucion_dinero', aplica_venta: false });
    expect(accionUIaBd('reposicion')).toEqual({ accion: 'reposicion', aplica_venta: false });
  });
  it('monto = precio de lista con impuestos × cantidad (mismo redondeo que SQL); reposición sin dinero', () => {
    expect(montoDevolucionLinea(10.5, 3, 'nota_credito')).toBe(31.5);
    expect(montoDevolucionLinea(10.5, 2, 'devolucion_dinero')).toBe(21);
    expect(montoDevolucionLinea(12.333, 0.5, 'aplicar_venta')).toBe(6.17);
    expect(montoDevolucionLinea(50, 1, 'reposicion')).toBe(0);
  });
});

const L = (p: Partial<DevolucionLineaF1>): DevolucionLineaF1 => ({
  producto_id: 'p1', cantidad: 1, motivo: 'no_vendido', destino: 'vendible', accion: 'nota_credito', precio_unitario: 10, ...p,
});

describe('payload único de registrar_devolucion', () => {
  it('cada renglón lleva destino, acción BD, aplica_venta, precio y monto', () => {
    const r = lineasParaRpc([
      L({ accion: 'aplicar_venta', cantidad: 3, precio_unitario: 10.5 }),
      L({ producto_id: 'p2', destino: 'merma', motivo: 'danado', accion: 'reposicion', reemplazo_producto_id: 'p9', reposicion_en_venta: true }),
    ]);
    expect(r[0]).toMatchObject({ producto_id: 'p1', destino: 'vendible', accion: 'nota_credito', aplica_venta: true, precio_unitario: 10.5, monto_credito: 31.5, reposicion_en_venta: false });
    expect(r[1]).toMatchObject({ producto_id: 'p2', destino: 'merma', accion: 'reposicion', aplica_venta: false, monto_credito: 0, reemplazo_producto_id: 'p9', reposicion_en_venta: true });
    expect(r.some(x => x.accion === 'descuento_venta')).toBe(false);
  });
  it('resumen separa nota a favor, nota aplicada y dinero', () => {
    expect(resumenDevolucion([
      L({ accion: 'nota_credito', cantidad: 2 }),
      L({ accion: 'aplicar_venta', cantidad: 3 }),
      L({ accion: 'devolucion_dinero', cantidad: 1, precio_unitario: 7.75 }),
      L({ accion: 'reposicion', cantidad: 5 }),
    ])).toEqual({ nota: 20, notaAplicada: 30, dinero: 7.75 });
  });
  it('la cola identifica la operación por el id de la devolución (idempotente)', () => {
    expect(COLA_REGISTRAR_DEVOLUCION).toBe('rpc:registrar_devolucion');
    expect(valorClave({ p_devolucion: { id: 'dev-1' }, p_lineas: [] }, 'p_devolucion.id')).toBe('dev-1');
    expect(valorClave({ id: 'x' }, 'id')).toBe('x');
    expect(valorClave({}, 'p_devolucion.id')).toBeUndefined();
  });
});

describe('precio de devolución = lista de precios del cliente (mismo resolver que la venta)', () => {
  const prod = { id: 'prod-001', precio_principal: 20, costo: 5, tiene_iva: true, iva_pct: 16 };
  it('con regla: precio final con impuestos igual al de la venta', () => {
    const esperado = buildSalePricingSnapshot(
      { id: 'prod-001', precio_principal: 20, costo: 5, tiene_iva: true, iva_pct: 16, tiene_ieps: false, ieps_pct: 0 },
      resolveProductPricing([reglaPrecioFijo], { id: 'prod-001', precio_principal: 20, costo: 5, tiene_iva: true, iva_pct: 16, tiene_ieps: false, ieps_pct: 0 }, null),
    ).displayPrice;
    expect(precioDevolucionCliente([reglaPrecioFijo], prod, null)).toBe(esperado);
    expect(esperado).toBe(13.92); // 12 sin impuestos + 16 % IVA
  });
  it('sin regla: precio principal (ya con impuestos)', () => {
    expect(precioDevolucionCliente([], prod, null)).toBe(20);
  });
});

describe('ticket de ruta con nota aplicada a la venta', () => {
  it('contado: la nota también paga la venta (no queda saldo)', () => {
    const r = saldosTicketRuta({ condicionPago: 'contado', total: 100, pagos: 70, aplicadoACuentas: 0, saldoAnterior: 0, notaAplicada: 30 });
    expect(r.pagadoEstaVenta).toBe(100);
    expect(r.saldoNuevo).toBe(0);
  });
  it('crédito: la nota baja el saldo de esta venta', () => {
    const r = saldosTicketRuta({ condicionPago: 'credito', total: 100, pagos: 0, aplicadoACuentas: 0, saldoAnterior: 50, notaAplicada: 30 });
    expect(r.pagadoEstaVenta).toBe(30);
    expect(r.saldoNuevo).toBe(120);
  });
  it('la nota mayor que la venta no paga de más', () => {
    const r = saldosTicketRuta({ condicionPago: 'credito', total: 20, pagos: 0, aplicadoACuentas: 0, saldoAnterior: 0, notaAplicada: 30 });
    expect(r.pagadoEstaVenta).toBe(20);
  });
  it('sin nota, igual que antes', () => {
    expect(saldosTicketRuta({ condicionPago: 'credito', total: 500, pagos: 300, aplicadoACuentas: 300, saldoAnterior: 1000 }).saldoNuevo).toBe(1200);
  });
});

describe('ticket: la devolución muestra destino y la nota aplicada', () => {
  it('renglón con «Merma» y «Nota aplicada»', () => {
    const td = { ...ticketEjemplo, devoluciones: [
      { nombre: 'Leche 1L', cantidad: 2, motivo: 'danado', accion: 'aplicar_venta', destino: 'merma', monto: 40 },
      { nombre: 'Pan', cantidad: 1, motivo: 'no_vendido', accion: 'nota_credito', destino: 'vendible', monto: 10 },
    ] };
    const texto = String(ticketATexto(construirModeloTicket(td)));
    expect(texto).toMatch(/Merma/);
    expect(texto).toMatch(/Nota aplicada/);
    expect(texto).toMatch(/Vendible/);
  });
});
