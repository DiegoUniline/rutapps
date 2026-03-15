/**
 * Mass import utilities for Products & Clients
 * - Parses Excel (.xlsx) and CSV files
 * - Auto-creates missing catalog entries (marcas, zonas, etc.)
 * - Upserts by codigo (updates if exists, inserts if not)
 * - Multi-tenant: all records scoped to empresa_id
 */
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────
export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  example?: string;
}

// ─── Product template columns ───────────────────────────────────
export const PRODUCT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'codigo', header: 'Código', required: true, example: 'PROD-0001' },
  { key: 'nombre', header: 'Nombre', required: true, example: 'Refresco Cola 600ml' },
  { key: 'precio_principal', header: 'Precio', example: '18.50' },
  { key: 'costo', header: 'Costo', example: '12.00' },
  { key: 'cantidad', header: 'Stock', example: '100' },
  { key: 'marca', header: 'Marca', example: 'Coca-Cola' },
  { key: 'clasificacion', header: 'Clasificación', example: 'Bebidas' },
  { key: 'proveedor', header: 'Proveedor', example: 'Distribuidora ABC' },
  { key: 'lista', header: 'Lista', example: 'Lista General' },
  { key: 'unidad_venta', header: 'Unidad Venta', example: 'Pieza' },
  { key: 'unidad_compra', header: 'Unidad Compra', example: 'Caja' },
  { key: 'clave_alterna', header: 'Clave Alterna', example: 'RC600' },
  { key: 'tiene_iva', header: 'Tiene IVA (Sí/No)', example: 'Sí' },
  { key: 'status', header: 'Estado', example: 'activo' },
];

// ─── Client template columns ───────────────────────────────────
export const CLIENT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'codigo', header: 'Código', example: 'CLI-0001' },
  { key: 'nombre', header: 'Nombre', required: true, example: 'Tienda Don Pedro' },
  { key: 'contacto', header: 'Contacto', example: 'Pedro García' },
  { key: 'telefono', header: 'Teléfono', example: '55 1234 5678' },
  { key: 'email', header: 'Email', example: 'pedro@correo.com' },
  { key: 'direccion', header: 'Dirección', example: 'Av. Reforma 100' },
  { key: 'colonia', header: 'Colonia', example: 'Centro' },
  { key: 'rfc', header: 'RFC', example: 'GAPE800101XXX' },
  { key: 'zona', header: 'Zona', example: 'Zona Norte' },
  { key: 'vendedor', header: 'Vendedor', example: 'Juan Pérez' },
  { key: 'cobrador', header: 'Cobrador', example: 'María López' },
  { key: 'lista', header: 'Lista', example: 'Lista General' },
  { key: 'credito', header: 'Crédito (Sí/No)', example: 'No' },
  { key: 'limite_credito', header: 'Límite Crédito', example: '5000' },
  { key: 'dias_credito', header: 'Días Crédito', example: '30' },
  { key: 'frecuencia', header: 'Frecuencia', example: 'semanal' },
  { key: 'status', header: 'Estado', example: 'activo' },
];

// ─── Template generation ────────────────────────────────────────
export function downloadTemplate(columns: ImportColumn[], fileName: string) {
  const wb = XLSX.utils.book_new();
  // Header row + example row
  const headers = columns.map(c => c.header);
  const example = columns.map(c => c.example ?? '');
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = columns.map(c => ({ wch: Math.max((c.header?.length ?? 10) + 4, (c.example?.length ?? 8) + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// ─── File parsing ───────────────────────────────────────────────
export async function parseFile(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer);
    const wb = XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws);
  }

  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
}

// ─── Catalog resolver (find or create) ──────────────────────────
type CatalogTable = 'marcas' | 'clasificaciones' | 'proveedores' | 'listas' | 'unidades' | 'zonas' | 'vendedores' | 'cobradores';

async function resolveOrCreate(
  table: CatalogTable,
  nombre: string | undefined | null,
  empresaId: string,
  cache: Map<string, Map<string, string>>,
): Promise<string | null> {
  if (!nombre || !nombre.trim()) return null;
  const key = nombre.trim().toLowerCase();

  // Check cache
  if (!cache.has(table)) cache.set(table, new Map());
  const tableCache = cache.get(table)!;
  if (tableCache.has(key)) return tableCache.get(key)!;

  // Check DB
  const { data: existing } = await (supabase.from(table) as any)
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .ilike('nombre', nombre.trim());

  if (existing && existing.length > 0) {
    tableCache.set(key, existing[0].id);
    return existing[0].id;
  }

  // Create
  const { data: created, error } = await (supabase.from(table) as any)
    .insert({ nombre: nombre.trim(), empresa_id: empresaId })
    .select('id')
    .single();

  if (error) throw new Error(`No se pudo crear ${table}: ${nombre} - ${error.message}`);
  tableCache.set(key, created.id);
  return created.id;
}

// ─── Map header names to keys ───────────────────────────────────
function mapHeaders(row: Record<string, any>, columns: ImportColumn[]): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const col of columns) {
    // Try by header name first, then by key
    const val = row[col.header] ?? row[col.key] ?? undefined;
    if (val !== undefined) mapped[col.key] = val;
  }
  return mapped;
}

function toBool(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const v = val.trim().toLowerCase();
    return v === 'sí' || v === 'si' || v === 'yes' || v === '1' || v === 'true';
  }
  return !!val;
}

// ─── Import Products ───────────────────────────────────────────
export async function importProducts(rows: Record<string, any>[], empresaId: string): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, errors: [] };
  const cache = new Map<string, Map<string, string>>();

  for (let i = 0; i < rows.length; i++) {
    const raw = mapHeaders(rows[i], PRODUCT_IMPORT_COLUMNS);
    const rowNum = i + 2; // +2 for header + 0-index

    try {
      if (!raw.codigo && !raw.nombre) {
        result.errors.push({ row: rowNum, message: 'Código y Nombre vacíos, fila omitida' });
        continue;
      }
      if (!raw.nombre) {
        result.errors.push({ row: rowNum, message: 'Nombre es requerido' });
        continue;
      }

      // Resolve catalogs
      const marca_id = await resolveOrCreate('marcas', raw.marca, empresaId, cache);
      const clasificacion_id = await resolveOrCreate('clasificaciones', raw.clasificacion, empresaId, cache);
      const proveedor_id = await resolveOrCreate('proveedores', raw.proveedor, empresaId, cache);
      const lista_id = await resolveOrCreate('listas', raw.lista, empresaId, cache);
      const unidad_venta_id = await resolveOrCreate('unidades', raw.unidad_venta, empresaId, cache);
      const unidad_compra_id = await resolveOrCreate('unidades', raw.unidad_compra, empresaId, cache);

      const productData: any = {
        empresa_id: empresaId,
        codigo: raw.codigo?.toString().trim() || '',
        nombre: raw.nombre?.toString().trim(),
        precio_principal: raw.precio_principal ? Number(raw.precio_principal) : 0,
        costo: raw.costo ? Number(raw.costo) : 0,
        cantidad: raw.cantidad ? Number(raw.cantidad) : 0,
        clave_alterna: raw.clave_alterna?.toString().trim() || null,
        tiene_iva: raw.tiene_iva ? toBool(raw.tiene_iva) : false,
        status: ['activo', 'inactivo', 'borrador'].includes(raw.status?.toLowerCase?.()) ? raw.status.toLowerCase() : 'activo',
        ...(marca_id && { marca_id }),
        ...(clasificacion_id && { clasificacion_id }),
        ...(proveedor_id && { proveedor_id }),
        ...(lista_id && { lista_id }),
        ...(unidad_venta_id && { unidad_venta_id }),
        ...(unidad_compra_id && { unidad_compra_id }),
      };

      // Check if exists by codigo
      if (productData.codigo) {
        const { data: existing } = await supabase
          .from('productos')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('codigo', productData.codigo)
          .maybeSingle();

        if (existing) {
          const { empresa_id: _, ...updateData } = productData;
          const { error } = await supabase.from('productos').update(updateData).eq('id', existing.id);
          if (error) throw error;
          result.updated++;
        } else {
          const { error } = await supabase.from('productos').insert(productData);
          if (error) throw error;
          result.created++;
        }
      } else {
        const { error } = await supabase.from('productos').insert(productData);
        if (error) throw error;
        result.created++;
      }
    } catch (err: any) {
      result.errors.push({ row: rowNum, message: err.message || 'Error desconocido' });
    }
  }

  return result;
}

// ─── Import Clients ────────────────────────────────────────────
export async function importClients(rows: Record<string, any>[], empresaId: string): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, errors: [] };
  const cache = new Map<string, Map<string, string>>();

  for (let i = 0; i < rows.length; i++) {
    const raw = mapHeaders(rows[i], CLIENT_IMPORT_COLUMNS);
    const rowNum = i + 2;

    try {
      if (!raw.nombre) {
        result.errors.push({ row: rowNum, message: 'Nombre es requerido' });
        continue;
      }

      // Resolve catalogs
      const zona_id = await resolveOrCreate('zonas', raw.zona, empresaId, cache);
      const vendedor_id = await resolveOrCreate('vendedores', raw.vendedor, empresaId, cache);
      const cobrador_id = await resolveOrCreate('cobradores', raw.cobrador, empresaId, cache);
      const lista_id = await resolveOrCreate('listas', raw.lista, empresaId, cache);

      const clientData: any = {
        empresa_id: empresaId,
        nombre: raw.nombre?.toString().trim(),
        codigo: raw.codigo?.toString().trim() || null,
        contacto: raw.contacto?.toString().trim() || null,
        telefono: raw.telefono?.toString().trim() || null,
        email: raw.email?.toString().trim() || null,
        direccion: raw.direccion?.toString().trim() || null,
        colonia: raw.colonia?.toString().trim() || null,
        rfc: raw.rfc?.toString().trim() || null,
        credito: raw.credito ? toBool(raw.credito) : false,
        limite_credito: raw.limite_credito ? Number(raw.limite_credito) : 0,
        dias_credito: raw.dias_credito ? Number(raw.dias_credito) : 0,
        frecuencia: ['diaria', 'semanal', 'quincenal', 'mensual'].includes(raw.frecuencia?.toLowerCase?.()) ? raw.frecuencia.toLowerCase() : 'semanal',
        status: ['activo', 'inactivo', 'suspendido'].includes(raw.status?.toLowerCase?.()) ? raw.status.toLowerCase() : 'activo',
        ...(zona_id && { zona_id }),
        ...(vendedor_id && { vendedor_id }),
        ...(cobrador_id && { cobrador_id }),
        ...(lista_id && { lista_id }),
      };

      // Check if exists by codigo
      if (clientData.codigo) {
        const { data: existing } = await supabase
          .from('clientes')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('codigo', clientData.codigo)
          .maybeSingle();

        if (existing) {
          const { empresa_id: _, ...updateData } = clientData;
          const { error } = await supabase.from('clientes').update(updateData).eq('id', existing.id);
          if (error) throw error;
          result.updated++;
        } else {
          const { error } = await supabase.from('clientes').insert(clientData);
          if (error) throw error;
          result.created++;
        }
      } else {
        const { error } = await supabase.from('clientes').insert(clientData);
        if (error) throw error;
        result.created++;
      }
    } catch (err: any) {
      result.errors.push({ row: rowNum, message: err.message || 'Error desconocido' });
    }
  }

  return result;
}
