#!/usr/bin/env bun
/**
 * Scans the codebase for Supabase queries on transactional tables that may
 * hit the 1000-row default limit (no .range(), no fetchAllPages, no .single/.maybeSingle/.limit).
 *
 * Run: bun scripts/audit-pagination.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TABLES = [
  'venta_lineas', 'entrega_lineas', 'cobro_aplicaciones', 'movimientos_inventario',
  'stock_almacen', 'stock_camion', 'traspaso_lineas', 'traspasos',
  'devolucion_lineas', 'devoluciones', 'merma_lineas', 'mermas',
  'conteo_lineas', 'conteo_entradas', 'carga_lineas', 'compra_lineas',
  'cotizacion_lineas', 'cargas', 'entregas', 'cobros', 'ventas', 'visitas',
  'cliente_orden_ruta', 'producto_presentaciones', 'tarifa_lineas',
  'lista_precios_lineas', 'venta_comisiones', 'venta_historial', 'ajustes_inventario',
  'auditoria_lineas', 'auditoria_escaneos', 'auditorias', 'conteos_fisicos',
  'clientes', 'productos', 'cotizaciones', 'compras', 'pago_compras',
  'caja_movimientos', 'descarga_ruta_lineas', 'gastos',
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry) && !full.includes('integrations/supabase/types')) files.push(full);
  }
  return files;
}

const files = walk('src');
const offenders: Array<{ file: string; line: number; table: string; snippet: string }> = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/\.from\(['"`]([a-z_]+)['"`]\)/);
    if (!m) continue;
    const table = m[1];
    if (!TABLES.includes(table)) continue;
    // Extract chained call — gather next ~15 lines until ; or `})`/`;`
    let chunk = line;
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      chunk += '\n' + lines[j];
      if (/;\s*$/.test(lines[j]) || /^\s*\}\)/.test(lines[j])) break;
    }
    // Skip mutations / scalars / paginated / single
    if (/\.(insert|update|upsert|delete|rpc)\s*\(/.test(chunk)) continue;
    if (/\.range\s*\(/.test(chunk)) continue;
    if (/\.single\s*\(\)/.test(chunk)) continue;
    if (/\.maybeSingle\s*\(\)/.test(chunk)) continue;
    if (/\.limit\s*\(/.test(chunk)) continue;
    if (/count:\s*['"`]exact['"`]\s*,\s*head:\s*true/.test(chunk)) continue;
    if (/fetchAllPages/.test(chunk)) continue;
    if (!/\.select\s*\(/.test(chunk)) continue;
    offenders.push({ file, line: i + 1, table, snippet: chunk.trim().slice(0, 200) });
  }
}

const byFile = new Map<string, typeof offenders>();
for (const o of offenders) {
  if (!byFile.has(o.file)) byFile.set(o.file, []);
  byFile.get(o.file)!.push(o);
}

const sorted = Array.from(byFile.entries()).sort((a, b) => b[1].length - a[1].length);
console.log(`\n${offenders.length} potentially unpaginated queries in ${byFile.size} files:\n`);
for (const [file, list] of sorted) {
  console.log(`${file}  (${list.length})`);
  for (const o of list) console.log(`  L${o.line}  ${o.table}`);
}
