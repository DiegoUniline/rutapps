/**
 * Genera src/lib/refresco/lectores.generated.ts: para cada tabla de la BD, qué
 * claves de React Query (primer elemento de `queryKey`) LEEN esa tabla.
 *
 * Lo usa la red de seguridad de refresco (src/lib/refresco/refrescoTrasEscritura.ts):
 * cuando la app escribe en una tabla, se invalidan solo las consultas que la leen,
 * en esta pantalla y en cualquier otra, sin depender de que cada pantalla lo recuerde.
 *
 * Análisis estático aproximado (regex): por cada `queryKey: ['clave', …]` dentro de
 * useQuery/useInfiniteQuery toma el bloque de código siguiente (hasta la próxima
 * queryKey, máx. 6000 caracteres) y recoge:
 *   - `.from('tabla')` y relaciones embebidas del `.select('…, tabla(…)')`
 *   - funciones exportadas que llame (`fetchX(`), resolviendo sus tablas (2 niveles).
 * Los falsos positivos solo cuestan una recarga extra de una consulta visible.
 *
 * Uso: bunx tsx scripts/gen-mapa-refresco.ts   (correr tras agregar consultas nuevas)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const OUT = path.join(SRC, 'lib/refresco/lectores.generated.ts');

const files: string[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.|\.generated\./.test(f)) files.push(p);
  }
})(SRC);

const sources = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));

// ── 0) SQL de las migraciones: qué tablas lee/escribe cada función y qué disparan los triggers.
type FnSql = { lee: Set<string>; escribe: Set<string>; llama: Set<string> };
const fnSql = new Map<string, FnSql>();
const triggers = new Map<string, { tabla: string; fn: string }>(); // nombre trigger@tabla → def
const migraciones = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
for (const f of migraciones) {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8');
  // Funciones (la definición más reciente reemplaza a la anterior).
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z_0-9]+)"?\s*\(/gi)) {
    const desde = m.index ?? 0;
    const tag = /\$([a-z_]*)\$/i.exec(sql.slice(desde, desde + 4000));
    if (!tag) continue;
    const ini = desde + tag.index + tag[0].length;
    const fin = sql.indexOf(tag[0], ini);
    if (fin < 0) continue;
    const body = sql.slice(ini, fin).replace(/--[^\n]*/g, '');
    const def: FnSql = { lee: new Set(), escribe: new Set(), llama: new Set() };
    for (const x of body.matchAll(/\b(?:from|join)\s+(?:public\.)?"?([a-z_][a-z_0-9]*)"?/gi)) def.lee.add(x[1].toLowerCase());
    for (const x of body.matchAll(/\b(?:insert\s+into|delete\s+from)\s+(?:public\.)?"?([a-z_][a-z_0-9]*)"?/gi)) def.escribe.add(x[1].toLowerCase());
    for (const x of body.matchAll(/\bupdate\s+(?:public\.)?"?([a-z_][a-z_0-9]*)"?\s+(?:[a-z_]+\s+)?set\b/gi)) def.escribe.add(x[1].toLowerCase());
    for (const x of body.matchAll(/\b([a-z_][a-z_0-9]*)\s*\(/gi)) def.llama.add(x[1].toLowerCase());
    fnSql.set(m[1].toLowerCase(), def);
  }
  // Triggers creados y borrados, en orden.
  for (const m of sql.matchAll(/(create\s+(?:constraint\s+)?trigger\s+"?([a-z_0-9]+)"?[\s\S]*?\bon\s+(?:public\.)?"?([a-z_0-9]+)"?[\s\S]*?execute\s+(?:function|procedure)\s+(?:public\.)?"?([a-z_0-9]+)"?)|(drop\s+trigger\s+(?:if\s+exists\s+)?"?([a-z_0-9]+)"?\s+on\s+(?:public\.)?"?([a-z_0-9]+)"?)/gi)) {
    if (m[1]) triggers.set(`${m[2]}@${m[3]}`.toLowerCase(), { tabla: m[3].toLowerCase(), fn: m[4].toLowerCase() });
    else triggers.delete(`${m[6]}@${m[7]}`.toLowerCase());
  }
}
// Cierre transitivo de llamadas entre funciones SQL (PERFORM otra_fn(...)).
for (let pass = 0; pass < 4; pass++) {
  for (const def of fnSql.values()) {
    for (const otra of def.llama) {
      const o = fnSql.get(otra);
      if (!o || o === def) continue;
      o.lee.forEach(t => def.lee.add(t));
      o.escribe.forEach(t => def.escribe.add(t));
    }
  }
}

// Llaves foráneas (types.ts): columna → tablas referenciadas, y nombre de FK → tabla.
const TYPES_SRC = fs.readFileSync(path.join(SRC, 'integrations/supabase/types.ts'), 'utf8');
const fkTabla = new Map<string, Set<string>>();
const fkNombre = new Map<string, Set<string>>();
for (const m of TYPES_SRC.matchAll(/foreignKeyName: "([a-z_0-9]+)"\s+columns: \["([a-z_0-9]+)"\]\s+isOneToOne: \w+\s+referencedRelation: "([a-z_0-9]+)"/g)) {
  if (!fkTabla.has(m[2])) fkTabla.set(m[2], new Set());
  fkTabla.get(m[2])!.add(m[3]);
  if (!fkNombre.has(m[1])) fkNombre.set(m[1], new Set());
  fkNombre.get(m[1])!.add(m[3]);
}

/** Nombres de funciones SQL citados como texto en un bloque que llama RPC (.rpc('x'), rpc.bind(...)('x'), rpcPaginado('x')…). */
function rpcsDe(block: string): Set<string> {
  const r = new Set<string>();
  if (!/rpc/i.test(block)) return r;
  for (const m of block.matchAll(/['"`]([a-z_][a-z_0-9]*)['"`]/g)) if (fnSql.has(m[1])) r.add(m[1]);
  return r;
}

function tablasDe(block: string): Set<string> {
  const t = new Set<string>();
  for (const m of block.matchAll(/\bfrom(?:\s+as\s+\w+\))?\(\s*['"`]([a-z_0-9]+)['"`]/g)) t.add(m[1]);
  // Relaciones embebidas en cualquier texto del bloque (el select suele vivir en una constante):
  // `tabla(…)`, `tabla!fk(…)` y `alias:columna_fk(…)` (la columna se resuelve a su tabla con types.ts).
  for (const m of block.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)) {
    for (const e of m[0].matchAll(/(?:([a-z_][a-z_0-9]*)\s*:\s*)?([a-z_][a-z_0-9]*)(?:!([a-z_0-9]+))?\s*\(/g)) {
      t.add(e[2]);
      if (e[1]) fkTabla.get(e[2])?.forEach(x => t.add(x));
      if (e[3]) fkNombre.get(e[3])?.forEach(x => t.add(x));
    }
  }
  // Consultas vía RPC (cualquier forma de llamarla): las tablas que lee la función SQL.
  for (const r of rpcsDe(block)) fnSql.get(r)?.lee.forEach(x => t.add(x));
  return t;
}

// 1) Índice de funciones → tablas que consultan. Las exportadas se resuelven desde cualquier archivo;
//    las locales (function x / const x = async (…) =>) solo dentro de su archivo.
const FN_RE = /(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*[(<]|(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]{0,80})?=>/g;
const exportadas = new Map<string, string>();
const locales = new Map<string, Map<string, string>>(); // archivo → nombre → cuerpo
for (const [file, src] of sources) {
  const hits = [...src.matchAll(FN_RE)];
  const loc = new Map<string, string>();
  hits.forEach((m, i) => {
    const name = m[2] ?? m[4];
    if (!name || /^use[A-Z]/.test(name)) return; // los hooks se analizan por su propia queryKey
    const end = Math.min(src.length, hits[i + 1]?.index ?? src.length, (m.index ?? 0) + 8000);
    const body = src.slice(m.index, end);
    loc.set(name, body);
    if (m[1] || m[3]) exportadas.set(name, body);
  });
  locales.set(file, loc);
}
const tablasFn = new Map<string, Set<string>>(); // cuerpo → tablas (cache)
const tablasDeFn = (body: string) => {
  if (!tablasFn.has(body)) tablasFn.set(body, tablasDe(body));
  return tablasFn.get(body)!;
};
/** Tablas de las funciones que llama un bloque (2 niveles). */
function tablasLlamadas(block: string, file: string, nivel = 0, vistos = new Set<string>()): Set<string> {
  const t = new Set<string>();
  if (nivel > 2) return t;
  for (const m of block.matchAll(/\b([A-Za-z0-9_]+)\s*(?:<[^>()]{0,60}>)?\s*\(|queryFn:\s*([A-Za-z0-9_]+)\b/g)) {
    const nombre = m[1] ?? m[2];
    const body = locales.get(file)?.get(nombre) ?? exportadas.get(nombre);
    if (!body || vistos.has(body)) continue;
    vistos.add(body);
    tablasDeFn(body).forEach(x => t.add(x));
    tablasLlamadas(body, file, nivel + 1, vistos).forEach(x => t.add(x));
  }
  return t;
}

// 2) Consultas: clave → tablas.
const NO_QUERY = /(invalidateQueries|setQueriesData|cancelQueries|getQueriesData|refetchQueries|removeQueries|resetQueries|getQueryData|setQueryData|isFetching)\(\s*\{?\s*$/;
const lectores = new Map<string, Set<string>>(); // tabla → claves
const agregar = (tabla: string, clave: string) => {
  if (!lectores.has(tabla)) lectores.set(tabla, new Set());
  lectores.get(tabla)!.add(clave);
};
for (const [file, src] of sources) {
  const occ = [...src.matchAll(/queryKey:\s*\[\s*['"`]([^'"`$]+)['"`]/g)]
    .map(m => ({ idx: m.index ?? 0, key: m[1], esConsulta: !NO_QUERY.test(src.slice(Math.max(0, (m.index ?? 0) - 60), m.index)) }));
  occ.forEach((o, i) => {
    if (!o.esConsulta) return;
    const end = Math.min(src.length, occ[i + 1]?.idx ?? src.length, o.idx + 6000);
    const block = src.slice(o.idx, end);
    const t = tablasDe(block);
    tablasLlamadas(block, file).forEach(x => t.add(x));
    t.forEach(tabla => agregar(tabla, o.key));
  });
}

// Solo tablas reales (del tipo generado de Supabase) para descartar funciones SQL del select (count(), sum()…).
const tablasReales = new Set([...TYPES_SRC.matchAll(/^ {6}([a-z_0-9]+): \{$/gm)].map(m => m[1]));

const filas = [...lectores.entries()]
  .filter(([t]) => tablasReales.has(t))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([t, ks]) => `  ${t}: [${[...ks].sort().map(k => JSON.stringify(k)).join(', ')}],`);

const lista = (xs: Iterable<string>) => [...xs].filter(t => tablasReales.has(t)).sort().map(t => JSON.stringify(t)).join(', ');

// Triggers: tabla → tablas que sus triggers escriben (transitivo por funciones).
const efectos = new Map<string, Set<string>>();
for (const { tabla, fn } of triggers.values()) {
  const escribe = fnSql.get(fn)?.escribe;
  if (!escribe?.size) continue;
  if (!efectos.has(tabla)) efectos.set(tabla, new Set());
  escribe.forEach(t => { if (t !== tabla) efectos.get(tabla)!.add(t); });
}
const filasEfectos = [...efectos.entries()].filter(([t, s]) => tablasReales.has(t) && s.size)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([t, s]) => `  ${t}: [${lista(s)}],`).filter(l => !l.endsWith('[],'));

// RPC que la app llama: rpc → tablas que escribe (si no escribe nada, es de solo lectura y no se lista).
const rpcsApp = new Set<string>();
for (const src of sources.values()) rpcsDe(src).forEach(r => rpcsApp.add(r));
const filasRpc = [...rpcsApp].sort()
  .map(r => [r, fnSql.get(r)?.escribe ?? new Set<string>()] as const)
  .map(([r, s]) => `  ${r}: [${lista(s)}],`).filter(l => !l.endsWith('[],'));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `// ARCHIVO GENERADO por scripts/gen-mapa-refresco.ts — no editar a mano.
// Regenerar: bunx tsx scripts/gen-mapa-refresco.ts (tras agregar consultas, RPC o triggers).
// Los ajustes manuales (lo que el análisis no detecta) van en refrescoTrasEscritura.ts.

/** tabla → claves de React Query (primer elemento de queryKey) que leen esa tabla. */
export const LECTORES_GENERADOS: Readonly<Record<string, readonly string[]>> = {
${filas.join('\n')}
};

/** tabla → otras tablas que sus triggers escriben (según supabase/migrations). */
export const EFECTOS_TRIGGER_GENERADOS: Readonly<Record<string, readonly string[]>> = {
${filasEfectos.join('\n')}
};

/** RPC llamada por la app → tablas que escribe. Las RPC ausentes son de solo lectura. */
export const ESCRITURAS_RPC_GENERADAS: Readonly<Record<string, readonly string[]>> = {
${filasRpc.join('\n')}
};
`);
console.log(`Escrito ${path.relative(ROOT, OUT)}: ${filas.length} tablas leídas, ${filasEfectos.length} con triggers, ${filasRpc.length} RPC que escriben.`);
