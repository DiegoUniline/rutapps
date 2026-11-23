import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Entregas móviles en el mismo orden de ruta que la pestaña Clientes.
describe('ruta: entregas ordenadas como los clientes', () => {
  const src = readFileSync('src/pages/ruta/RutaEntregas.tsx', 'utf8');
  it('usa cliente_orden_ruta del vendedor y del día', () => {
    expect(src).toContain('useClienteOrdenRuta(vendedorId, diaHoy)');
    expect(src).toContain('ordenMap.get(e.cliente_id)');
  });
  it('respaldo: clientes.orden (también en la vista desde servidor)', () => {
    expect(src).toContain("a._cliente?.orden ?? 9999");
    expect(src).toContain("dia_visita, zona_id, orden'");
  });
});
