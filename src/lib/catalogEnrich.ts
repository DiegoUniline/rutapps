/**
 * Client-side enrichment for productos/clientes rows.
 *
 * WHY: los LEFT JOIN LATERAL de PostgREST (zonas(nombre), listas(nombre),
 * vendedores(nombre), cobradores(nombre), tarifas(nombre), unidades(...))
 * en las queries de listas/prefetch se convierten en múltiples subqueries
 * por fila en Postgres. En tablas con miles de filas esto dispara el CPU
 * de la BD (slow queries #4 y #8 en pg_stat_statements).
 *
 * FIX: se pide sólo el `id` foráneo desde Postgres y se resuelve el
 * `nombre` en el cliente usando los catálogos pequeños ya cacheados por
 * `useBootstrapPrefetch` (['vendedores', eid], ['cobradores', eid],
 * ['zonas', eid], ['listas', eid], ['unidades', eid], y las tarifas via
 * ['tarifas-select', eid]).
 *
 * Los objetos anidados generados aquí (`{ nombre }`) preservan la forma
 * previa `cliente.zonas?.nombre`, `producto.unidades_venta?.abreviatura`,
 * etc., para que ningún componente/reporte cambie de forma. Si el catálogo
 * aún no está en cache, `nombre` queda como cadena vacía y el UI verá lo
 * mismo que antes cuando la relación era null.
 */
import type { QueryClient } from '@tanstack/react-query';

type CatalogRow = { id: string; nombre?: string | null; abreviatura?: string | null };

function toMap(rows: unknown): Map<string, CatalogRow> {
  const m = new Map<string, CatalogRow>();
  if (Array.isArray(rows)) {
    for (const r of rows as CatalogRow[]) {
      if (r?.id) m.set(r.id, r);
    }
  }
  return m;
}

function readCatalog(qc: QueryClient, key: readonly unknown[]): Map<string, CatalogRow> {
  return toMap(qc.getQueryData(key));
}

/** Enrich clientes rows with joined-name look-alikes resolved from cache. */
export function enrichClientes<T extends {
  zona_id?: string | null;
  lista_id?: string | null;
  vendedor_id?: string | null;
  cobrador_id?: string | null;
  tarifa_id?: string | null;
}>(rows: T[], qc: QueryClient, empresaId: string): T[] {
  const zonas = readCatalog(qc, ['zonas', empresaId]);
  const listas = readCatalog(qc, ['listas', empresaId]);
  const vendedores = readCatalog(qc, ['vendedores', empresaId]);
  const cobradores = readCatalog(qc, ['cobradores', empresaId]);
  // Tarifas: bootstrap las guarda como ['tarifas-select', eid]; algunos hooks
  // también las almacenan como ['tarifas', eid]. Probamos ambos.
  const tarifas = (() => {
    const a = readCatalog(qc, ['tarifas-select', empresaId]);
    if (a.size > 0) return a;
    return readCatalog(qc, ['tarifas', empresaId]);
  })();

  return rows.map((row) => {
    const enriched: Record<string, unknown> = { ...row };
    if (row.zona_id) enriched.zonas = { nombre: zonas.get(row.zona_id)?.nombre ?? '' };
    else enriched.zonas = null;
    if (row.lista_id) enriched.listas = { nombre: listas.get(row.lista_id)?.nombre ?? '' };
    else enriched.listas = null;
    if (row.vendedor_id) enriched.vendedores = { nombre: vendedores.get(row.vendedor_id)?.nombre ?? '' };
    else enriched.vendedores = null;
    if (row.cobrador_id) enriched.cobradores = { nombre: cobradores.get(row.cobrador_id)?.nombre ?? '' };
    else enriched.cobradores = null;
    if (row.tarifa_id) enriched.tarifas = { nombre: tarifas.get(row.tarifa_id)?.nombre ?? '' };
    else enriched.tarifas = null;
    return enriched as T;
  });
}

/** Enrich productos rows with unidades_venta / unidades_compra look-alikes. */
export function enrichProductos<T extends {
  unidad_venta_id?: string | null;
  unidad_compra_id?: string | null;
}>(rows: T[], qc: QueryClient, empresaId: string): T[] {
  // Unidades no llevan empresa_id en la key del prefetch (['unidades', eid]).
  const unidades = readCatalog(qc, ['unidades', empresaId]);
  return rows.map((row) => {
    const enriched: Record<string, unknown> = { ...row };
    if (row.unidad_venta_id) {
      const u = unidades.get(row.unidad_venta_id);
      enriched.unidades_venta = u
        ? { nombre: u.nombre ?? '', abreviatura: u.abreviatura ?? '' }
        : { nombre: '', abreviatura: '' };
    } else {
      enriched.unidades_venta = null;
    }
    if (row.unidad_compra_id) {
      const u = unidades.get(row.unidad_compra_id);
      enriched.unidades_compra = u
        ? { nombre: u.nombre ?? '', abreviatura: u.abreviatura ?? '' }
        : { nombre: '', abreviatura: '' };
    } else {
      enriched.unidades_compra = null;
    }
    return enriched as T;
  });
}
