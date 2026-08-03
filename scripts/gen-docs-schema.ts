/**
 * Genera docs/02-ESQUEMA-BASE-DE-DATOS.md a partir de src/integrations/supabase/types.ts
 * y docs/03-MAPA-DE-RUTAS.md a partir de src/App.tsx.
 * Uso: bunx tsx scripts/gen-docs-schema.ts   (o bun scripts/gen-docs-schema.ts)
 */
import fs from 'node:fs';

const types = fs.readFileSync('src/integrations/supabase/types.ts', 'utf8');
const lines = types.split('\n');

type Col = { name: string; type: string; nullable: boolean; optionalOnInsert: boolean };
type Rel = { column: string; foreignTable: string; foreignColumn: string };
type Table = { name: string; cols: Col[]; rels: Rel[]; isView: boolean };

function indentOf(l: string) { return l.length - l.trimStart().length; }

function parseSection(header: string, isView: boolean): Table[] {
  const start = lines.findIndex(l => l.trim() === `${header}: {`);
  if (start === -1) return [];
  const baseIndent = indentOf(lines[start]);
  const out: Table[] = [];
  let i = start + 1;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '}' && indentOf(l) === baseIndent) break;
    const m = l.match(/^\s{8}(\w+): \{$/);
    if (m) {
      const tbl: Table = { name: m[1], cols: [], rels: [], isView };
      // Row block
      let j = i + 1;
      let inRow = false, inRels = false;
      const insertOptional = new Set<string>();
      let inInsert = false;
      while (j < lines.length) {
        const t = lines[j];
        if (t.match(/^\s{8}\}$/)) break;
        if (t.match(/^\s{10}Row: \{$/)) { inRow = true; j++; continue; }
        if (t.match(/^\s{10}Insert: \{$/)) { inInsert = true; j++; continue; }
        if (t.match(/^\s{10}Relationships: \[$/)) { inRels = true; j++; continue; }
        if (t.match(/^\s{10}(\}|\])$/)) { inRow = false; inRels = false; inInsert = false; j++; continue; }
        if (inRow) {
          const c = t.trim().match(/^([\w"]+)(\??): (.+)$/);
          if (c) {
            const type = c[3].replace(/\s+$/, '');
            tbl.cols.push({ name: c[1].replace(/"/g, ''), type, nullable: /\| null$/.test(type), optionalOnInsert: false });
          }
        }
        if (inInsert) {
          const c = t.trim().match(/^([\w"]+)(\??):/);
          if (c && c[2] === '?') insertOptional.add(c[1].replace(/"/g, ''));
        }
        if (inRels) {
          const chunk = lines.slice(j, j + 8).join('\n');
          const cm = chunk.match(/columns: \["([^"]+)"\][\s\S]*?referencedRelation: "([^"]+)"[\s\S]*?referencedColumns: \["([^"]+)"\]/);
          if (cm && t.trim() === '{') tbl.rels.push({ column: cm[1], foreignTable: cm[2], foreignColumn: cm[3] });
        }
        j++;
      }
      tbl.cols.forEach(c => { c.optionalOnInsert = insertOptional.has(c.name); });
      out.push(tbl);
      i = j;
    }
    i++;
  }
  return out;
}

const tables = parseSection('Tables', false);
const views = parseSection('Views', true);

// Funciones y enums
const funcs: string[] = [];
{
  const start = lines.findIndex(l => l.trim() === 'Functions: {');
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i++) {
      const m = lines[i].match(/^\s{6}(\w+): \{$/);
      if (lines[i].trim() === '}' && indentOf(lines[i]) === indentOf(lines[start])) break;
      if (m) funcs.push(m[1]);
    }
  }
}
const enums: Record<string, string> = {};
{
  const start = lines.findIndex(l => l.trim() === 'Enums: {');
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === '}' && indentOf(lines[i]) === indentOf(lines[start])) break;
      const m = lines[i].match(/^\s+(\w+):\s*(.+)$/);
      if (m) enums[m[1]] = m[2].replace(/,\s*$/, '');
    }
  }
}

// Quién apunta a quién (relaciones inversas)
const inbound: Record<string, string[]> = {};
for (const t of tables) for (const r of t.rels) {
  (inbound[r.foreignTable] ||= []).push(`\`${t.name}.${r.column}\``);
}

const fmtType = (t: string) => t.replace(/ \| null$/, '').replace(/\s+/g, ' ');

let md = `# 02 · Esquema de la base de datos (autogenerado)

> Generado con \`scripts/gen-docs-schema.ts\` a partir de \`src/integrations/supabase/types.ts\`.
> No editar a mano: regenerar tras cada migración.

**Totales:** ${tables.length} tablas · ${views.length} vistas · ${funcs.length} funciones RPC · ${Object.keys(enums).length} enums.

## Índice de tablas

${tables.map(t => `- [${t.name}](#${t.name.replace(/_/g, '')}) (${t.cols.length} campos)`).join('\n')}

---

`;

for (const t of tables) {
  md += `## ${t.name}\n\n`;
  md += `| Campo | Tipo | Nulo | Obligatorio al insertar | FK |\n|---|---|---|---|---|\n`;
  for (const c of t.cols) {
    const fk = t.rels.filter(r => r.column === c.name).map(r => `→ \`${r.foreignTable}.${r.foreignColumn}\``).join(' ');
    md += `| \`${c.name}\` | ${fmtType(c.type)} | ${c.nullable ? 'sí' : 'no'} | ${c.optionalOnInsert ? '' : '**sí**'} | ${fk} |\n`;
  }
  if (inbound[t.name]?.length) md += `\n**Referenciada por:** ${[...new Set(inbound[t.name])].join(', ')}\n`;
  md += `\n---\n\n`;
}

if (views.length) {
  md += `# Vistas\n\n`;
  for (const v of views) {
    md += `## ${v.name} (vista)\n\n| Campo | Tipo |\n|---|---|\n`;
    for (const c of v.cols) md += `| \`${c.name}\` | ${fmtType(c.type)} |\n`;
    md += `\n`;
  }
}

md += `\n# Funciones / RPC disponibles\n\n${funcs.map(f => `- \`${f}()\``).join('\n')}\n`;
md += `\n# Enums\n\n${Object.entries(enums).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}\n`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/02-ESQUEMA-BASE-DE-DATOS.md', md);

// ---------- Rutas ----------
const app = fs.readFileSync('src/App.tsx', 'utf8');
const imports: Record<string, string> = {};
for (const m of app.matchAll(/import\s+(?:\{\s*default as\s+)?(\w+)\s*\}?\s*from\s+['"]([^'"]+)['"]/g)) imports[m[1]] = m[2];
for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\(['"]([^'"]+)['"]\)\)/g)) imports[m[1]] = m[2];

const rows: string[] = [];
for (const m of app.matchAll(/<Route\s+path="([^"]+)"[^>]*element=\{<?(?:Suspense[\s\S]{0,120}?<)?(\w+)/g)) {
  const [, path, comp] = m;
  rows.push(`| \`${path}\` | \`${comp}\` | ${imports[comp] ? `\`${imports[comp]}\`` : '—'} |`);
}
const seen = new Set<string>();
const uniq = rows.filter(r => !seen.has(r) && seen.add(r));

fs.writeFileSync('docs/03-MAPA-DE-RUTAS.md', `# 03 · Mapa de rutas → componente → archivo (autogenerado)

> Generado con \`scripts/gen-docs-schema.ts\` desde \`src/App.tsx\`.

| Ruta | Componente | Archivo |
|---|---|---|
${uniq.join('\n')}
`);

console.log(`OK: ${tables.length} tablas, ${views.length} vistas, ${funcs.length} funciones, ${uniq.length} rutas`);
