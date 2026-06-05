/**
 * Catalog homologation matcher.
 * Cross-matches external rows against internal productos + equivalencias.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/supabasePaginate';

export type MatchTipo = 'exacto' | 'parcial' | 'duplicado' | 'sin_match' | 'error';

export interface ExternalRow {
  fila: number;
  codigo_externo: string;
  descripcion?: string;
  cantidad?: number;
  precio?: number;
  raw: Record<string, any>;
}

export interface MatchedRow extends ExternalRow {
  producto_id: string | null;
  producto_codigo?: string;
  producto_nombre?: string;
  match_tipo: MatchTipo;
  mensaje?: string;
}

interface ProductoLite {
  id: string;
  codigo: string | null;
  codigo_origen: string | null;
  nombre: string;
}

interface EquivLite {
  producto_id: string;
  codigo_externo: string;
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export async function loadCatalog(empresaId: string) {
  const [productos, equivs] = await Promise.all([
    fetchAllPages<ProductoLite>(
      (from, to) =>
        supabase
          .from('productos')
          .select('id, codigo, codigo_origen, nombre')
          .eq('empresa_id', empresaId)
          .range(from, to) as any,
    ),
    fetchAllPages<EquivLite>(
      (from, to) =>
        supabase
          .from('producto_equivalencias')
          .select('producto_id, codigo_externo')
          .eq('empresa_id', empresaId)
          .range(from, to) as any,
    ),
  ]);

  const byEquiv = new Map<string, ProductoLite>();
  const byCodigoOrigen = new Map<string, ProductoLite>();
  const byCodigo = new Map<string, ProductoLite>();
  const byNombre = new Map<string, ProductoLite>();

  const pIndex = new Map(productos.map(p => [p.id, p]));

  for (const e of equivs) {
    const p = pIndex.get(e.producto_id);
    if (p) byEquiv.set(norm(e.codigo_externo), p);
  }
  for (const p of productos) {
    if (p.codigo_origen) byCodigoOrigen.set(norm(p.codigo_origen), p);
    if (p.codigo) byCodigo.set(norm(p.codigo), p);
    if (p.nombre) byNombre.set(norm(p.nombre), p);
  }

  return { productos, byEquiv, byCodigoOrigen, byCodigo, byNombre };
}

export type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

export function matchRow(row: ExternalRow, catalog: Catalog): MatchedRow {
  const ce = norm(row.codigo_externo);
  if (!ce) {
    return { ...row, producto_id: null, match_tipo: 'error', mensaje: 'codigo_externo vacío' };
  }
  let p = catalog.byEquiv.get(ce);
  if (p) return res(row, p, 'exacto', 'Equivalencia registrada');
  p = catalog.byCodigoOrigen.get(ce);
  if (p) return res(row, p, 'exacto', 'Match por código origen');
  p = catalog.byCodigo.get(ce);
  if (p) return res(row, p, 'exacto', 'Match por código interno');
  // partial by nombre
  if (row.descripcion) {
    const nd = norm(row.descripcion);
    if (nd) {
      p = catalog.byNombre.get(nd);
      if (p) return res(row, p, 'parcial', 'Match por nombre normalizado');
    }
  }
  return { ...row, producto_id: null, match_tipo: 'sin_match', mensaje: 'No se encontró coincidencia' };
}

function res(row: ExternalRow, p: ProductoLite, tipo: MatchTipo, msg: string): MatchedRow {
  return {
    ...row,
    producto_id: p.id,
    producto_codigo: p.codigo ?? undefined,
    producto_nombre: p.nombre,
    match_tipo: tipo,
    mensaje: msg,
  };
}

export function matchAll(rows: ExternalRow[], catalog: Catalog): MatchedRow[] {
  const seen = new Map<string, number>();
  const out: MatchedRow[] = [];
  for (const r of rows) {
    const k = norm(r.codigo_externo);
    if (k && seen.has(k)) {
      out.push({ ...r, producto_id: null, match_tipo: 'duplicado', mensaje: `Duplicado de fila ${seen.get(k)}` });
      continue;
    }
    if (k) seen.set(k, r.fila);
    out.push(matchRow(r, catalog));
  }
  return out;
}

export function summary(rows: MatchedRow[]) {
  const s = { total: rows.length, exacto: 0, parcial: 0, duplicado: 0, sin_match: 0, error: 0 };
  for (const r of rows) s[r.match_tipo]++;
  return s;
}
