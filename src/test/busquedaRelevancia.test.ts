import { describe, expect, it, vi } from 'vitest';
import {
  filtroCoincidenciaExacta,
  numeroFolioBuscado,
  ordenarPorRelevancia,
  paginaConExactosPrimero,
  regexCoincidenciaExacta,
  relevanciaBusqueda,
} from '@/lib/busquedaRelevancia';

// Mismos casos que se probaron contra public.fn_busqueda_relevancia (D-047).
describe('relevanciaBusqueda (espejo de fn_busqueda_relevancia)', () => {
  it.each([
    ['ENT-2000', '2000', true, 0],
    ['ENT-2000', 'ent-2000', true, 0],
    ['ENT-2000', 'ENT-002000', true, 0],
    ['ENT-2000', ' Ent 2000 ', true, 0],
    ['ENT-0002000', '2000', true, 0],
    ['A1-2000', '2000', true, 0],
    ['ABC_1', 'abc_1', true, 0],
    ['ENT-12000', '2000', true, 2],
    ['ENT-20001', '2000', true, 2],
    ['ENT-20001', 'ENT-2000', true, 1],
    ['PED-2000', 'ent-2000', true, 3],
    ['ENT-2000', 'E-2000', true, 3],
    ['ENT-2000', 'XYZ', true, 3],
    ['ENT-2000', '0', true, 2],
    ['ENT-2000', '', true, 3],
    [null, '2000', true, 3],
    ['2000', '2000', false, 1],
    ['Juan 2000', 'juan', false, 1],
    ['Don Juan', 'juan', false, 2],
  ] as const)('%s / «%s» / folio=%s → %i', (valor, busqueda, esFolio, esperado) => {
    expect(relevanciaBusqueda(valor, busqueda, esFolio)).toBe(esperado);
  });

  it('número buscado solo cuando el texto tiene forma de folio', () => {
    expect(numeroFolioBuscado('ENT-002000')).toBe('2000');
    expect(numeroFolioBuscado('2000')).toBe('2000');
    expect(numeroFolioBuscado('Juan')).toBeNull();
    expect(numeroFolioBuscado('A1-2000')).toBeNull();
    expect(numeroFolioBuscado('000')).toBeNull();
  });
});

describe('ordenarPorRelevancia (listas filtradas en el navegador)', () => {
  const filas = [
    { id: 'a', folio: 'ENT-912000', cliente: 'Abarrotes 2000' }, // más nueva
    { id: 'b', folio: 'ENT-20001', cliente: 'Tienda' },
    { id: 'c', folio: 'ENT-12000', cliente: 'Otra' },
    { id: 'd', folio: 'ENT-2000', cliente: 'Vieja' }, // la más vieja: antes quedaba al final
  ];
  const folios = (f: typeof filas[number]) => [f.folio];
  const nombres = (f: typeof filas[number]) => [f.cliente];

  it('«2000»: folio exacto primero y el resto en su orden normal', () => {
    expect(ordenarPorRelevancia(filas, '2000', folios, nombres).map(f => f.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('«ENT-2»: «empieza con» antes que «contiene», estable dentro del grupo', () => {
    expect(ordenarPorRelevancia(filas, 'ENT-2', folios, nombres).map(f => f.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('nombre que empieza con el texto sube al grupo 1', () => {
    expect(ordenarPorRelevancia(filas, 'abarrotes', folios, nombres)[0].id).toBe('a');
  });

  it('sin búsqueda devuelve el mismo arreglo', () => {
    expect(ordenarPorRelevancia(filas, '  ', folios, nombres)).toBe(filas);
  });
});

describe('filtro exacto para PostgREST', () => {
  it('regex: idéntico o mismo número de folio', () => {
    const re = new RegExp(regexCoincidenciaExacta('2000')!, 'i');
    expect(re.test('ENT-2000')).toBe(true);
    expect(re.test('ENT-0002000')).toBe(true);
    expect(re.test('2000')).toBe(true);
    expect(re.test('ENT-12000')).toBe(false);
    expect(re.test('ENT-20001')).toBe(false);
    const conPrefijo = new RegExp(regexCoincidenciaExacta('ent-002000')!, 'i');
    expect(conPrefijo.test('ENT-2000')).toBe(true);
    expect(conPrefijo.test('PED-2000')).toBe(false);
    const literal = new RegExp(regexCoincidenciaExacta('A.B(1)')!, 'i');
    expect(literal.test('a.b(1)')).toBe(true);
    expect(literal.test('axb(1)')).toBe(false);
  });

  it('arma un or= con imatch entre comillas por columna', () => {
    expect(filtroCoincidenciaExacta(['folio'], '  ')).toBeNull();
    const f = filtroCoincidenciaExacta(['codigo', 'clave_alterna'], 'x"1')!;
    expect(f.startsWith('codigo.imatch."')).toBe(true);
    expect(f).toContain(',clave_alterna.imatch."');
    expect(f).toContain('x\\"1');
  });
});

describe('paginaConExactosPrimero (listas paginadas en servidor)', () => {
  type Fila = { id: string };
  // «Servidor» simulado: 10 filas que contienen el texto + 1 exacta (posición 7 por fecha).
  const todas: Fila[] = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}` }));
  const exacta = todas[7];
  const consultarPagina = vi.fn(async (desde: number, hasta: number, excluir: string[]) => {
    const resto = todas.filter(f => !excluir.includes(f.id));
    return { data: resto.slice(desde, hasta + 1), error: null, count: resto.length };
  });
  const base = {
    busqueda: '2000',
    columnas: ['folio'],
    pageSize: 4,
    consultarExactos: async () => ({ data: [exacta], error: null }),
    consultarPagina,
  };

  it('la página 1 trae la coincidencia exacta primero y el total no cambia', async () => {
    const p1 = await paginaConExactosPrimero<Fila>({ ...base, page: 1 });
    expect(p1.rows.map(r => r.id)).toEqual(['r7', 'r0', 'r1', 'r2']);
    expect(p1.total).toBe(11);
  });

  it('las páginas siguientes no repiten la exacta ni se saltan filas', async () => {
    const vistas: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const p = await paginaConExactosPrimero<Fila>({ ...base, page });
      vistas.push(...p.rows.map(r => r.id));
    }
    expect(vistas).toHaveLength(11);
    expect(new Set(vistas).size).toBe(11);
    expect(vistas[0]).toBe('r7');
  });

  it('sin coincidencias exactas es la consulta de siempre', async () => {
    const p = await paginaConExactosPrimero<Fila>({ ...base, consultarExactos: async () => ({ data: [], error: null }), page: 2 });
    expect(p.rows.map(r => r.id)).toEqual(['r4', 'r5', 'r6', 'r7']);
    expect(p.total).toBe(11);
  });

  it('sin búsqueda no consulta exactos', async () => {
    const consultarExactos = vi.fn();
    const p = await paginaConExactosPrimero<Fila>({ ...base, busqueda: '', consultarExactos, page: 1 });
    expect(consultarExactos).not.toHaveBeenCalled();
    expect(p.rows).toHaveLength(4);
  });

  it('propaga errores (no los oculta)', async () => {
    await expect(paginaConExactosPrimero<Fila>({ ...base, consultarExactos: async () => ({ data: null, error: new Error('falla') }), page: 1 }))
      .rejects.toThrow('falla');
  });
});
