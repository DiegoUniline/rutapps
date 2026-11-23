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
