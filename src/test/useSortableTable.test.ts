import { describe, it, expect } from 'vitest';
import { ordenarFilas, siguienteOrden, aplicarOrdenConsulta } from '@/hooks/useSortableTable';

describe('orden universal de tablas', () => {
  const filas = [{ n: 'beto', v: 10 }, { n: 'Álvaro', v: 2 }, { n: null, v: null }, { n: 'carlos', v: 1 }, { n: 'A10', v: 3 }, { n: 'A2', v: 4 }];

  it('A→Z en español, natural y vacíos al final', () => {
    expect(ordenarFilas(filas, { key: 'n', dir: 'asc' }).map(f => f.n)).toEqual(['A2', 'A10', 'Álvaro', 'beto', 'carlos', null]);
  });
  it('Z→A deja vacíos al final', () => {
    expect(ordenarFilas(filas, { key: 'n', dir: 'desc' }).map(f => f.n)).toEqual(['carlos', 'beto', 'Álvaro', 'A10', 'A2', null]);
  });
  it('números', () => {
    expect(ordenarFilas(filas, { key: 'v', dir: 'asc' }).map(f => f.v)).toEqual([1, 2, 3, 4, 10, null]);
  });
  it('sin orden devuelve la misma lista', () => {
    expect(ordenarFilas(filas, { key: null, dir: 'asc' })).toBe(filas);
  });
  it('ciclo A→Z, Z→A, sin orden', () => {
    let s = siguienteOrden({ key: null, dir: 'asc' }, 'n');
    expect(s).toEqual({ key: 'n', dir: 'asc' });
    s = siguienteOrden(s, 'n');
    expect(s).toEqual({ key: 'n', dir: 'desc' });
    expect(siguienteOrden(s, 'n')).toEqual({ key: null, dir: 'asc' });
    expect(siguienteOrden(s, 'otra')).toEqual({ key: 'otra', dir: 'asc' });
  });
  it('consulta: columna mapeada + desempate id; sin mapear usa el orden por omisión', () => {
    const llamadas: any[] = [];
    const q: any = { order: (c: string, o: any) => { llamadas.push([c, o]); return q; } };
    aplicarOrdenConsulta(q, { key: 'cliente', dir: 'desc' }, { cliente: 'nombre' });
    expect(llamadas).toEqual([['nombre', { ascending: false, nullsFirst: false }], ['id', { ascending: true }]]);
    llamadas.length = 0;
    aplicarOrdenConsulta(q, { key: 'x', dir: 'asc' }, { cliente: 'nombre' }, { columna: 'nombre', asc: true });
    expect(llamadas).toEqual([['nombre', { ascending: true }], ['id', { ascending: true }]]);
  });
});
