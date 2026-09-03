import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from '@/lib/supabasePaginate';

describe('fetchAllPages', () => {
  it('recupera reglas posteriores al límite de 1000 registros', async () => {
    const rows = Array.from({ length: 1302 }, (_, index) => ({ id: `regla-${index + 1}` }));
    const buildQuery = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    const result = await fetchAllPages(buildQuery);

    expect(result).toHaveLength(1302);
    expect(result.at(-1)?.id).toBe('regla-1302');
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 999);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(buildQuery).toHaveBeenCalledTimes(2);
  });
});
