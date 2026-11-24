import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from '@/lib/supabasePaginate';

const rows = Array.from({ length: 1302 }, (_, index) => ({ id: `regla-${index + 1}` }));
const makeQuery = () => vi.fn(async (from: number, to: number) => ({
  data: rows.slice(from, to + 1),
  error: null,
}));

describe('fetchAllPages', () => {
  it('recupera reglas posteriores al límite de 1000 registros', async () => {
    const buildQuery = makeQuery();

    const result = await fetchAllPages(buildQuery, undefined, 1);

    expect(result).toHaveLength(1302);
    expect(result.at(-1)?.id).toBe('regla-1302');
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 999);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(buildQuery).toHaveBeenCalledTimes(2);
  });

  it('con concurrencia por defecto conserva orden y no duplica filas de lecturas especulativas', async () => {
    const buildQuery = makeQuery();

    const result = await fetchAllPages(buildQuery);

    expect(result).toHaveLength(1302);
    expect(result.map(row => row.id)).toEqual(rows.map(row => row.id));
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 999);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});

// Builder mínimo con la misma API de orden que postgrest-js (url.searchParams + order()).
function builder(filasPorOrden: (orden: string) => any[], error?: any) {
  return (from: number, to: number) => {
    const url = new URL('https://x.supabase.co/rest/v1/stock_almacen');
    const b: any = {
      url,
      order(col: string, { ascending = true } = {}) {
        const prev = url.searchParams.get('order');
        url.searchParams.set('order', `${prev ? prev + ',' : ''}${col}.${ascending ? 'asc' : 'desc'}`);
        return b;
      },
      then(res: any, rej: any) {
        const orden = url.searchParams.get('order') ?? '';
        if (error && orden.includes('id.')) return Promise.resolve({ data: null, error }).then(res, rej);
        return Promise.resolve({ data: filasPorOrden(orden).slice(from, to + 1), error: null }).then(res, rej);
      },
    };
    return b;
  };
}

describe('fetchAllPages orden estable (stock que parpadea 3→0→3)', () => {
  const filas = Array.from({ length: 2500 }, (_, i) => ({ id: `s-${String(i).padStart(5, '0')}` }));

  it('sin orden único el servidor puede mezclar páginas; con desempate por id no se pierde ninguna fila', async () => {
    let llamada = 0;
    // Sin "id" en el orden, cada petición ve un orden físico distinto (como tras UPDATEs).
    const q = builder((orden) => {
      if (orden.includes('id.')) return filas;
      llamada += 1;
      return llamada % 2 ? filas : [...filas].reverse();
    });
    const r = await fetchAllPages<any>(q);
    expect(new Set(r.map(x => x.id)).size).toBe(2500);
  });

  it('respeta el orden del llamador y agrega id solo como desempate', async () => {
    const ordenes: string[] = [];
    const q = builder((orden) => { ordenes.push(orden); return filas; });
    await fetchAllPages<any>((f, t) => (q(f, t) as any).order('nombre'));
    expect(ordenes.every(o => o === 'nombre.asc,id.asc')).toBe(true);
  });

  it('si la tabla no tiene id, repite sin desempate (como antes)', async () => {
    const q = builder(() => filas.slice(0, 10), { code: '42703', message: 'column x.id does not exist' });
    const r = await fetchAllPages<any>(q);
    expect(r).toHaveLength(10);
  });
});
