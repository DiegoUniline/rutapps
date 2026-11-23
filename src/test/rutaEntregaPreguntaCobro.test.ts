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
  it('cobrar no la marca', () => {
    expect(cobro).not.toContain('marcarEntregaHechaYSincronizarPedido');
    expect(cobro).not.toContain('ventasLiquidadas');
  });
});
