import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Al entregar se pregunta si se cobra; antes, si el pedido no había cargado, el saldo
// parecía 0 y se entregaba sin preguntar.
describe('ruta: entregar espera el saldo antes de preguntar el cobro', () => {
  const src = readFileSync('src/pages/ruta/RutaEntregaDetalle.tsx', 'utf8');
  it('el botón espera a que carguen el pedido y las cuentas del cliente', () => {
    expect(src).toContain('const saldoCargando = (!!pedidoId && ventaCargando) || (!!clienteId && cuentasCargando);');
    expect(src).toContain('if (saldoCargando) return;');
    expect(src).toContain('disabled={saving || saldoCargando}');
  });
  it('con saldo pendiente pregunta: entregar y cobrar o solo entregar', () => {
    expect(src).toContain('¿Vas a cobrar?');
    expect(src).toContain('Entregar y cobrar');
    expect(src).toContain('Solo entregar (cobrar después)');
  });
});

// Ninguna entrega se marca sola: ni al abrirla pagada ni al cobrar el pedido.
describe('ruta: la entrega solo se marca al tocar «Marcar entregado»', () => {
  const det = readFileSync('src/pages/ruta/RutaEntregaDetalle.tsx', 'utf8');
  const cobro = readFileSync('src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts', 'utf8');
  it('abrir el detalle no la marca', () => {
    expect(det).not.toContain('autoMarkedRef');
    expect(det).not.toContain('marcada como entregada automáticamente');
    expect(det.match(/marcarEntregaHechaYSincronizarPedido\(/g)?.length).toBe(1);
  });
  it('cobrar no la marca (salvo «Cobrar y entregar» de contado)', () => {
    expect(cobro).not.toContain('ventasLiquidadas');
    expect(cobro.match(/marcarEntregaHechaYSincronizarPedido\(/g)?.length).toBe(1);
    expect(cobro).toContain('marcarEntregaHechaYSincronizarPedido(entregaPorCobrar.id, venta.id, ahora)');
  });
});

// Si al entregar no se pudo cobrar, queda el botón Cobrar en la entrega ya entregada.
describe('ruta: botón Cobrar en entregas entregadas con saldo', () => {
  it('detalle', () => {
    const det = readFileSync('src/pages/ruta/RutaEntregaDetalle.tsx', 'utf8');
    expect(det).toContain('(ventaSaldo > 0 || totalSaldoPendiente > 0) && (!isClosedState || isDelivered)');
  });
  it('lista', () => {
    const lista = readFileSync('src/pages/ruta/RutaEntregas.tsx', 'utf8');
    expect(lista).toContain('hecho && e._saldo > 0.009 && e.pedido_id');
    expect(lista).toContain('/ruta/ventas/${e.pedido_id}?cobrar=1');
  });
});

// Pedido de contado: no se entrega sin cobrar; la entrega se marca al completar el cobro.
describe('ruta: pedido de contado exige cobro para entregar', () => {
  const det = readFileSync('src/pages/ruta/RutaEntregaDetalle.tsx', 'utf8');
  const cobro = readFileSync('src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts', 'utf8');
  it('la entrega de contado solo ofrece «Cobrar y entregar»', () => {
    expect(det).toContain("const esContado = (venta as any)?.condicion_pago === 'contado';");
    expect(det).toContain('const exigeCobro = esContado && cobroRequerido > 0.009;');
    expect(det).toContain('?cobrar=1&entregar=${id}&minimo=${cobroRequerido}');
    expect(det).toContain('{exigeCobro ? (');
  });
  it('se entrega solo si el cobro cubre lo requerido; parcial queda pendiente', () => {
    expect(cobro).toContain('if (pagado + 0.01 >= entregaPorCobrar.minimo)');
    expect(cobro).toContain('Cobro parcial: la entrega sigue pendiente');
    expect(cobro).toContain("queueOperation('entregas', 'update', { id: entregaPorCobrar.id, status: 'hecho'");
  });
});
