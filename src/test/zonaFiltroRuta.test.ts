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

import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { useZonaFiltroRuta } from '@/components/ruta/ZonaFiltroRuta';

describe('useZonaFiltroRuta (universal)', () => {
  it('al elegir zona en un lugar, cambia en todos (Clientes, Entregas, CxC, Navegar)', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    const vistos: Record<string, string> = {};
    let setDesdeA: (z: string) => void = () => {};
    const A = () => { const { zona, setZona } = useZonaFiltroRuta(); vistos.a = zona; setDesdeA = setZona; return null; };
    const B = () => { vistos.b = useZonaFiltroRuta().zona; return null; };
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement('div', null, createElement(A), createElement(B))); });
    expect(vistos).toEqual({ a: '', b: '' });
    await act(async () => { setDesdeA('z1'); });
    expect(vistos).toEqual({ a: 'z1', b: 'z1' });
    await act(async () => { setDesdeA(''); });
    expect(vistos).toEqual({ a: '', b: '' });
    act(() => root.unmount());
  });
});
