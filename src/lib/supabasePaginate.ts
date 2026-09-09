const PAGE_SIZE = 1000;
const DEFAULT_SAFETY_CAP = 200_000;
const DEFAULT_CONCURRENCY = 3;

/**
 * Fetch all rows from a Supabase query, paginating automatically to avoid the 1000-row default limit.
 *
 * IMPORTANT: All listing queries against transactional tables (ventas, venta_lineas, entregas,
 * entrega_lineas, cobros, cobro_aplicaciones, movimientos_inventario, stock_almacen, productos,
 * clientes, visitas, cliente_orden_ruta, compra_lineas, etc.) MUST use this helper instead of
 * a bare `.select(...)`, or rows past 1000 will be silently truncated.
 *
 * The first page is fetched on its own so small queries still issue a single request. When more
 * than 1000 rows exist, subsequent pages are fetched in small concurrent batches. Results are
 * appended in page order, preserving the ordering defined by the caller while avoiding the
 * previous N x network-latency penalty on large historical queries.
 *
 * @param buildQuery  A function that receives (from, to) and returns a Supabase query builder.
 * @param safetyCap   Maximum rows fetched in total (defaults to 200 000).
 * @param concurrency Number of pages fetched concurrently after page 1 (defaults to 3).
 */
export async function fetchAllPages<T = any>(
  buildQuery: (from: number, to: number) => any,
  safetyCap: number = DEFAULT_SAFETY_CAP,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<T[]> {
  const all: T[] = [];
  const parallelism = Math.max(1, Math.floor(concurrency) || 1);

  const fetchPage = async (page: number): Promise<T[]> => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    return (data ?? []) as T[];
  };

  const warnSafetyCap = () => {
    console.warn(
      `[fetchAllPages] safetyCap (${safetyCap}) reached. Truncating result. ` +
      `Consider narrowing the filter or implementing server-side pagination.`,
    );
  };

  // Keep the common/small-query path to one request.
  const firstPage = await fetchPage(0);
  all.push(...firstPage.slice(0, safetyCap));

  if (firstPage.length < PAGE_SIZE) return all;
  if (all.length >= safetyCap) {
    warnSafetyCap();
    return all;
  }

  let nextPage = 1;

  while (all.length < safetyCap) {
    const remainingPages = Math.ceil((safetyCap - all.length) / PAGE_SIZE);
    const batchSize = Math.min(parallelism, remainingPages);
    const pages = await Promise.all(
      Array.from({ length: batchSize }, (_, index) => fetchPage(nextPage + index)),
    );

    // Append in deterministic page order even though requests ran concurrently.
    for (const rows of pages) {
      const remainingRows = safetyCap - all.length;
      if (remainingRows <= 0) {
        warnSafetyCap();
        return all;
      }

      all.push(...rows.slice(0, remainingRows));

      // This page is the end of the result set. Later requests in the same batch were harmless
      // speculative reads and are intentionally ignored.
      if (rows.length < PAGE_SIZE) return all;

      if (all.length >= safetyCap) {
        warnSafetyCap();
        return all;
      }
    }

    nextPage += batchSize;
  }

  return all;
}
