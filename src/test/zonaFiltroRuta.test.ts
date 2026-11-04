import { describe, it, expect } from 'vitest';
import { clienteEnZona, SIN_ZONA } from '@/components/ruta/ZonaFiltroRuta';

describe('clienteEnZona', () => {
  it('sin filtro entran todos', () => {
    expect(clienteEnZona({ zona_id: 'z1' }, '')).toBe(true);
    expect(clienteEnZona({ zona_id: null }, '')).toBe(true);
  });
  it('filtra por zona y por "sin zona"', () => {
    expect(clienteEnZona({ zona_id: 'z1' }, 'z1')).toBe(true);
    expect(clienteEnZona({ zona_id: 'z2' }, 'z1')).toBe(false);
    expect(clienteEnZona({ zona_id: null }, SIN_ZONA)).toBe(true);
    expect(clienteEnZona({ zona_id: 'z1' }, SIN_ZONA)).toBe(false);
    expect(clienteEnZona(undefined, 'z1')).toBe(false);
  });
});
