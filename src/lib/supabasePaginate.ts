const PAGE_SIZE = 1000;
const DEFAULT_SAFETY_CAP = 200_000;

/**
 * Fetch all rows from a Supabase query, paginating automatically to avoid the 1000-row default limit.
 *
 * IMPORTANT: All listing queries against transactional tables (ventas, venta_lineas, entregas,
 * entrega_lineas, cobros, cobro_aplicaciones, movimientos_inventario, stock_almacen, productos,
 * clientes, visitas, cliente_orden_ruta, compra_lineas, etc.) MUST use this helper instead of
 * a bare `.select(...)`, or rows past 1000 will be silently truncated.
 *
 * @param buildQuery - A function that receives (from, to) and returns a Supabase query builder.
 * @param safetyCap  - Maximum rows fetched in total (defaults to 200 000). Prevents accidental
 *                     memory blow-ups; emits a console.warn when reached.
 */
export async function fetchAllPages<T = any>(
  buildQuery: (from: number, to: number) => any,
  safetyCap: number = DEFAULT_SAFETY_CAP,
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
    if (all.length >= safetyCap) {
      console.warn(
        `[fetchAllPages] safetyCap (${safetyCap}) reached. Truncating result. ` +
        `Consider narrowing the filter or implementing server-side pagination.`,
      );
      break;
    }
    page++;
  }
  return all;
}
