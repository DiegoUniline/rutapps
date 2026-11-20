/**
 * D-047 · Búsqueda por relevancia antes que por fecha.
 *
 * Con texto de búsqueda, las listas ordenan primero:
 *   0) folio/código idéntico (sin importar mayúsculas) o el mismo número de folio
 *      («2000», «ent-2000» o «ENT-002000» encuentran ENT-2000),
 *   1) folio/código o nombre que EMPIEZA con el texto,
 *   2) el resto (contiene),
 * y dentro de cada grupo se respeta el orden normal de la lista.
 *
 * Espejo exacto de `public.fn_busqueda_relevancia` (migración
 * 20261120233000_d047_busqueda_relevancia.sql). Mantener ambos en sincronía.
 */

export type Relevancia = 0 | 1 | 2 | 3;

type Texto = string | null | undefined;

/** Letras opcionales, separador opcional y un número distinto de cero («2000», «ENT-002000», «ent 2000»). */
const FORMA_FOLIO = /^[A-Za-z]*[^0-9A-Za-z]*0*[1-9][0-9]*$/;

const sinCerosIzq = (s: string) => s.replace(/^0+/, '');

/** Número de folio que se busca (sin ceros a la izquierda) o null si el texto no tiene forma de folio. */
export function numeroFolioBuscado(busqueda: Texto): string | null {
  const s = (busqueda ?? '').trim();
  if (!FORMA_FOLIO.test(s)) return null;
  const m = s.match(/([0-9]+)$/);
  return m ? sinCerosIzq(m[1]) : null;
}

/** Prefijo de letras del texto buscado («ENT» en «ENT-2000»; '' en «2000»). */
function prefijoBuscado(s: string): string {
  return s.match(/^([A-Za-z]*)/)?.[1] ?? '';
}

/**
 * 0 exacto · 1 empieza con · 2 contiene · 3 no coincide.
 * `esFolio=false` (nombres): nunca da 0; idéntico cuenta como «empieza con».
 */
export function relevanciaBusqueda(valor: Texto, busqueda: Texto, esFolio = true): Relevancia {
  const s = (busqueda ?? '').trim();
  if (valor == null || s === '') return 3;
  const v = valor.trim();
  const vl = valor.toLowerCase();
  const sl = s.toLowerCase();
  if (esFolio) {
    if (v.toLowerCase() === sl) return 0;
    const num = numeroFolioBuscado(s);
    if (num && /[0-9]$/.test(v)) {
      const numValor = sinCerosIzq(v.match(/([0-9]+)$/)?.[1] ?? '');
      const pre = prefijoBuscado(s);
      const preValor = v.replace(/[^0-9A-Za-z]*[0-9]+$/, '');
      if (numValor === num && (/^[^A-Za-z]/.test(s) || preValor.toLowerCase() === pre.toLowerCase())) return 0;
    }
  }
  if (vl.startsWith(sl)) return 1;
  if (vl.includes(sl)) return 2;
  return 3;
}

/** Mejor relevancia entre varios folios/códigos y nombres de una fila. */
export function relevanciaDe(busqueda: Texto, folios: readonly Texto[], nombres: readonly Texto[] = []): Relevancia {
  let mejor: Relevancia = 3;
  for (const f of folios) {
    const r = relevanciaBusqueda(f, busqueda, true);
    if (r < mejor) mejor = r;
    if (mejor === 0) return 0;
  }
  for (const n of nombres) {
    const r = relevanciaBusqueda(n, busqueda, false);
    if (r < mejor) mejor = r;
  }
  return mejor;
}

/**
 * Ordena (estable) por relevancia para listas filtradas en el navegador.
 * Sin texto de búsqueda devuelve el mismo arreglo (sin copiar ni reordenar).
 */
export function ordenarPorRelevancia<T>(
  filas: readonly T[],
  busqueda: Texto,
  folios: (fila: T) => readonly Texto[],
  nombres: (fila: T) => readonly Texto[] = () => [],
): T[] {
  if (!(busqueda ?? '').trim()) return filas as T[];
  return filas
    .map((fila, i) => ({ fila, i, r: relevanciaDe(busqueda, folios(fila), nombres(fila)) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.fila);
}

// ─── Listas paginadas en servidor con PostgREST (.range) ─────────────────────

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Valor entre comillas para un filtro `or=(...)` de PostgREST. */
const comillasPostgrest = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Expresión regular (para `imatch`, sin distinguir mayúsculas) que reconoce la
 * coincidencia exacta del grupo 0: folio/código idéntico o mismo número de folio.
 */
export function regexCoincidenciaExacta(busqueda: Texto): string | null {
  const s = (busqueda ?? '').trim();
  if (!s) return null;
  const opciones = [escaparRegex(s)];
  const num = numeroFolioBuscado(s);
  if (num) {
    const pre = prefijoBuscado(s);
    opciones.push(pre && !/^[^A-Za-z]/.test(s)
      ? `${escaparRegex(pre)}[^0-9A-Za-z]*0*${num}`
      : `(.*[^0-9])?0*${num}`);
  }
  return `^\\s*(${opciones.join('|')})\\s*$`;
}

/** Filtro `or` de PostgREST para traer solo las coincidencias exactas (grupo 0) en las columnas dadas. */
export function filtroCoincidenciaExacta(columnas: readonly string[], busqueda: Texto): string | null {
  const re = regexCoincidenciaExacta(busqueda);
  if (!re || columnas.length === 0) return null;
  return columnas.map(c => `${c}.imatch.${comillasPostgrest(re)}`).join(',');
}

interface RespuestaFilas<T> { data: T[] | null; error: unknown }
interface RespuestaPagina<T> extends RespuestaFilas<T> { count: number | null }

/** Máximo de coincidencias exactas que se anteponen (un folio exacto suele ser 1). */
export const MAX_EXACTOS = 50;

/**
 * Página de una lista paginada en servidor que pone primero las coincidencias
 * exactas de folio/código (grupo 0 de D-047) sin duplicarlas en otras páginas.
 *
 * Orden global = [exactos (orden normal)] + [resto (orden normal, sin los exactos)].
 * El total sigue siendo exacto: total = exactos + resto. Sin búsqueda (o sin
 * exactos) es la consulta de siempre.
 *
 * @param consultarExactos  misma consulta con los MISMOS filtros (sin el filtro de
 *                          texto) + `.or(filtro)`; debe limitar a `limite` filas.
 * @param consultarPagina   consulta normal con `count: 'exact'` y `.range(desde, hasta)`;
 *                          si `excluirIds` trae ids, agregar `.not('id', 'in', ...)`.
 */
export async function paginaConExactosPrimero<T extends { id: string }>(opts: {
  busqueda: Texto;
  /** Columnas de folio/código para armar el filtro exacto… */
  columnas?: readonly string[];
  /** …o el filtro `or` ya armado (p. ej. ids de documentos exactos). null = sin exactos. */
  filtro?: string | null;
  page: number; // 1-based
  pageSize: number;
  consultarExactos: (filtro: string, limite: number) => PromiseLike<RespuestaFilas<T>>;
  consultarPagina: (desde: number, hasta: number, excluirIds: string[]) => PromiseLike<RespuestaPagina<T>>;
}): Promise<{ rows: T[]; total: number }> {
  const { page, pageSize } = opts;
  const desde = (page - 1) * pageSize;
  const hasta = page * pageSize - 1;

  const filtro = opts.filtro !== undefined
    ? opts.filtro
    : filtroCoincidenciaExacta(opts.columnas ?? [], opts.busqueda);
  let exactos: T[] = [];
  if (filtro) {
    const r = await opts.consultarExactos(filtro, MAX_EXACTOS);
    if (r.error) throw r.error;
    exactos = r.data ?? [];
  }
  if (exactos.length === 0) {
    const r = await opts.consultarPagina(desde, hasta, []);
    if (r.error) throw r.error;
    return { rows: r.data ?? [], total: r.count ?? 0 };
  }

  const k = exactos.length;
  const ids = exactos.map(e => e.id);
  const deExactos = exactos.slice(Math.min(desde, k), Math.min(hasta + 1, k));
  // El resto se corre k lugares; si la página es solo de exactos se pide igual el rango 0..0 para el conteo.
  const restoDesde = Math.max(0, desde - k);
  const restoHasta = hasta - k;
  const r = await opts.consultarPagina(restoDesde, Math.max(restoDesde, restoHasta), ids);
  if (r.error) throw r.error;
  const resto = restoHasta >= restoDesde ? (r.data ?? []) : [];
  return { rows: [...deExactos, ...resto], total: (r.count ?? 0) + k };
}

/** Lista de ids para `.not('id', 'in', ...)` de PostgREST. */
export const listaIdsPostgrest = (ids: readonly string[]) => `(${ids.join(',')})`;
