import type { PostgrestFilterBuilder } from '@supabase/supabase-js/dist/module/select-query-parser';

const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a Supabase query, paginating automatically to avoid the 1000-row default limit.
 * @param buildQuery - A function that receives (from, to) and returns a Supabase query builder.
 */
export async function fetchAllPages<T = any>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}
