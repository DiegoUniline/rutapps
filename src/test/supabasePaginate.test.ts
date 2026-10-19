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
