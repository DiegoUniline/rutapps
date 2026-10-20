import { describe, it, expect } from 'vitest';
import { clienteCoincide, clienteTextoBusqueda } from '@/lib/buscarCliente';

const c = { nombre: 'Abarrotes La Esperanza', codigo: 'C-012', contacto: 'María López' };

describe('búsqueda de clientes', () => {
  it('encuentra por persona de contacto, nombre o código (sin importar mayúsculas)', () => {
    expect(clienteCoincide(c, 'maría')).toBe(true);
    expect(clienteCoincide(c, 'esperanza')).toBe(true);
    expect(clienteCoincide(c, 'c-012')).toBe(true);
    expect(clienteCoincide(c, 'pedro')).toBe(false);
  });

  it('búsqueda vacía muestra todos y acepta campos extra (dirección)', () => {
    expect(clienteCoincide(c, '  ')).toBe(true);
    expect(clienteCoincide({ nombre: 'X' }, 'centro', ['Av. Centro 10'])).toBe(true);
  });

  it('texto para selectores incluye el contacto', () => {
    expect(clienteTextoBusqueda(c)).toContain('María López');
  });
});
