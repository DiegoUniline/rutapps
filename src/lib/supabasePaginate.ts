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

  // Orden estable: sin un ORDER BY único, Postgres puede devolver las páginas en distinto
  // orden entre peticiones (filas repetidas y otras faltantes). Se agrega `id` como desempate;
  // si la tabla/vista no tiene `id` (42703), se repite sin él, como antes.
  let ordenEstable = true;
  const fetchPage = async (page: number): Promise<T[]> => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const intento = async (conOrden: boolean) => {
      const q = buildQuery(from, to);
      return conOrden ? conDesempatePorId(q) : q;
    };
    let { data, error } = await intento(ordenEstable);
    if (error && ordenEstable && page === 0 && esColumnaInexistente(error)) {
      ordenEstable = false;
      ({ data, error } = await intento(false));
    }
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

/** Agrega `id.asc` como último criterio de orden a un builder de PostgREST (si no lo tiene ya). */
export function conDesempatePorId<Q>(q: Q): Q {
  const b = q as any;
  if (!b || typeof b.order !== 'function' || !(b.url instanceof URL)) return q;
  const actual: string = b.url.searchParams.get('order') ?? '';
  if (actual.split(',').some(c => c === 'id' || c.startsWith('id.'))) return q;
  return b.order('id', { ascending: true });
}

function esColumnaInexistente(error: any): boolean {
  return error?.code === '42703' || /column .*id.* does not exist/i.test(String(error?.message ?? ''));
}
