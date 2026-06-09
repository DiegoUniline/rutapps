/**
 * Reportes Personalizados — Constructor genérico de reportes por empresa.
 * Fuente inicial: ventas (a nivel línea de venta).
 *
 * Cada campo define un `key` (estable), `label` UI y `format` para export.
 * El ejecutor obtiene los datos, los aplana y los entrega a exportUtils.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { ExportColumn } from '@/lib/exportUtils';

export type ReporteFuente = 'ventas';

export interface CampoDef {
  key: string;
  label: string;
  format: ExportColumn['format'];
  width?: number;
  /** descripción humana del campo */
  hint?: string;
}

export interface ReporteFiltros {
  fechaDesde?: string; // ISO date
  fechaHasta?: string;
  status?: string[];   // ej. ['pagada','parcial','pendiente','borrador']
  tipo?: string[];     // ej. ['venta','presale','remision']
}

export interface ReporteConfig {
  id?: string;
  empresa_id?: string;
  nombre: string;
  descripcion?: string;
  fuente: ReporteFuente;
  /** lista ordenada de keys de CAMPOS_VENTAS */
  columnas: { key: string; header?: string }[];
  filtros_default?: ReporteFiltros;
}

// ──────────────────────────────────────────────────────────────
// Catálogo de campos disponibles (fuente: ventas)
// ──────────────────────────────────────────────────────────────
export const CAMPOS_VENTAS: CampoDef[] = [
  { key: 'fecha',              label: 'Fecha',                 format: 'date',     width: 12 },
  { key: 'folio',              label: 'Folio',                 format: 'text',     width: 14 },
  { key: 'tipo',               label: 'Tipo',                  format: 'text',     width: 10 },
  { key: 'status',             label: 'Estado',                format: 'text',     width: 12 },
  { key: 'cliente_codigo',     label: 'Código Cliente',        format: 'text',     width: 12 },
  { key: 'cliente',            label: 'Cliente',               format: 'text',     width: 28 },
  { key: 'vendedor',           label: 'Vendedor',              format: 'text',     width: 20 },
  { key: 'codigo',             label: 'EAN / Código',          format: 'text',     width: 16, hint: 'productos.codigo' },
  { key: 'codigo_alterno',     label: 'Código alterno',        format: 'text',     width: 16 },
  { key: 'codigo_sat',         label: 'Código SAT',            format: 'text',     width: 12 },
  { key: 'descripcion',        label: 'Descripción producto',  format: 'text',     width: 32 },
  { key: 'cantidad',           label: 'Cantidad',              format: 'number',   width: 10 },
  { key: 'precio_antes_imp',   label: 'Precio antes de imp.',  format: 'currency', width: 14, hint: 'Precio unitario' },
  { key: 'tasa_iva',           label: 'Tasa IVA',              format: 'percent',  width: 10 },
  { key: 'tasa_ieps',          label: 'Tasa IEPS',             format: 'percent',  width: 10 },
  { key: 'importe_iva_pieza',  label: 'Importe IVA / pieza',   format: 'currency', width: 14 },
  { key: 'importe_ieps_pieza', label: 'Importe IEPS / pieza',  format: 'currency', width: 14 },
  { key: 'importe_iva',        label: 'Importe IVA (línea)',   format: 'currency', width: 14 },
  { key: 'importe_ieps',       label: 'Importe IEPS (línea)',  format: 'currency', width: 14 },
  { key: 'subtotal_linea',     label: 'Subtotal línea',        format: 'currency', width: 14 },
  { key: 'total_linea',        label: 'Total línea',           format: 'currency', width: 14 },
  { key: 'descuento_pct',      label: 'Descuento %',           format: 'percent',  width: 10 },
  { key: 'forma_pago',         label: 'Forma de Pago',         format: 'text',     width: 18, hint: 'Métodos de los cobros aplicados (o condición si no hay cobros)' },
  { key: 'condicion_pago',     label: 'Condición de pago',     format: 'text',     width: 12 },
];

export function getCampos(fuente: ReporteFuente): CampoDef[] {
  if (fuente === 'ventas') return CAMPOS_VENTAS;
  return [];
}

export function buildExportColumns(config: ReporteConfig): ExportColumn[] {
  const all = getCampos(config.fuente);
  const byKey = new Map(all.map(c => [c.key, c]));
  return config.columnas
    .map(c => {
      const def = byKey.get(c.key);
      if (!def) return null;
      return {
        key: def.key,
        header: c.header || def.label,
        format: def.format,
        width: def.width,
      } as ExportColumn;
    })
    .filter(Boolean) as ExportColumn[];
}

// ──────────────────────────────────────────────────────────────
// Ejecutor — fuente: ventas
// ──────────────────────────────────────────────────────────────
const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  deposito: 'Depósito',
};

export async function runReporte(
  config: ReporteConfig,
  filtros: ReporteFiltros,
  empresaId: string,
): Promise<Record<string, any>[]> {
  if (config.fuente !== 'ventas') return [];

  // 1. ventas filtradas
  let ventasQ = supabase
    .from('ventas')
    .select('id, folio, fecha, tipo, status, condicion_pago, cliente_id, vendedor_id')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: true });

  if (filtros.fechaDesde) ventasQ = ventasQ.gte('fecha', filtros.fechaDesde);
  if (filtros.fechaHasta) ventasQ = ventasQ.lte('fecha', filtros.fechaHasta);
  if (filtros.status?.length) ventasQ = ventasQ.in('status', filtros.status as any);
  if (filtros.tipo?.length) ventasQ = ventasQ.in('tipo', filtros.tipo as any);

  const ventas = await fetchAllPages<any>(ventasQ as any);
  if (ventas.length === 0) return [];

  const ventaIds = ventas.map(v => v.id);
  const clienteIds = Array.from(new Set(ventas.map(v => v.cliente_id).filter(Boolean)));
  const vendedorIds = Array.from(new Set(ventas.map(v => v.vendedor_id).filter(Boolean)));

  // 2. catálogos clientes / vendedores
  const [clientesRes, vendedoresRes] = await Promise.all([
    clienteIds.length
      ? supabase.from('clientes').select('id, codigo, nombre').in('id', clienteIds)
      : Promise.resolve({ data: [] as any[] }),
    vendedorIds.length
      ? supabase.from('profiles').select('id, nombre').in('id', vendedorIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const clientesMap = new Map((clientesRes.data || []).map((c: any) => [c.id, c]));
  const vendedoresMap = new Map((vendedoresRes.data || []).map((v: any) => [v.id, v]));

  // 3. líneas (paginadas)
  const lineasQ = supabase
    .from('venta_lineas')
    .select('venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, subtotal, iva_pct, ieps_pct, iva_monto, ieps_monto, total')
    .in('venta_id', ventaIds);
  const lineas = await fetchAllPages<any>(lineasQ as any);

  // 4. productos
  const productoIds = Array.from(new Set(lineas.map(l => l.producto_id).filter(Boolean)));
  const productosRes = productoIds.length
    ? await supabase.from('productos').select('id, codigo, clave_alterna, codigo_sat, nombre, nombre_venta').in('id', productoIds)
    : { data: [] as any[] };
  const productosMap = new Map((productosRes.data || []).map((p: any) => [p.id, p]));

  // 5. forma de pago: cobros aplicados por venta
  const formaPagoMap = new Map<string, string>();
  const needFormaPago = config.columnas.some(c => c.key === 'forma_pago');
  if (needFormaPago) {
    const apliQ = supabase
      .from('cobro_aplicaciones')
      .select('venta_id, cobros!inner(metodo_pago)')
      .in('venta_id', ventaIds);
    const aplicaciones = await fetchAllPages<any>(apliQ as any);
    const tmp = new Map<string, Set<string>>();
    for (const a of aplicaciones) {
      const m = a.cobros?.metodo_pago;
      if (!m) continue;
      const set = tmp.get(a.venta_id) ?? new Set<string>();
      set.add(METODO_LABELS[m] ?? m);
      tmp.set(a.venta_id, set);
    }
    for (const [vid, set] of tmp) {
      formaPagoMap.set(vid, Array.from(set).join(', '));
    }
  }

  // 6. armar filas (una por línea)
  const ventasMap = new Map(ventas.map(v => [v.id, v]));
  const rows: Record<string, any>[] = [];

  for (const l of lineas) {
    const v = ventasMap.get(l.venta_id);
    if (!v) continue;
    const c = clientesMap.get(v.cliente_id);
    const vd = vendedoresMap.get(v.vendedor_id);
    const p = productosMap.get(l.producto_id);
    const cantidad = Number(l.cantidad || 0);

    rows.push({
      fecha: v.fecha,
      folio: v.folio,
      tipo: v.tipo,
      status: v.status,
      cliente_codigo: c?.codigo ?? '',
      cliente: c?.nombre ?? '',
      vendedor: vd?.nombre ?? '',
      codigo: p?.codigo ?? '',
      codigo_alterno: p?.clave_alterna ?? '',
      codigo_sat: p?.codigo_sat ?? '',
      descripcion: l.descripcion || p?.nombre_venta || p?.nombre || '',
      cantidad,
      precio_antes_imp: Number(l.precio_unitario || 0),
      tasa_iva: Number(l.iva_pct || 0),
      tasa_ieps: Number(l.ieps_pct || 0),
      importe_iva_pieza: cantidad > 0 ? Number(l.iva_monto || 0) / cantidad : 0,
      importe_ieps_pieza: cantidad > 0 ? Number(l.ieps_monto || 0) / cantidad : 0,
      importe_iva: Number(l.iva_monto || 0),
      importe_ieps: Number(l.ieps_monto || 0),
      subtotal_linea: Number(l.subtotal || 0),
      total_linea: Number(l.total || 0),
      descuento_pct: Number(l.descuento_pct || 0),
      forma_pago: formaPagoMap.get(v.id) ?? (v.condicion_pago === 'contado' ? 'Contado' : 'Crédito'),
      condicion_pago: v.condicion_pago,
    });
  }

  return rows;
}

// ──────────────────────────────────────────────────────────────
// Export CSV
// ──────────────────────────────────────────────────────────────
function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCSV(opts: { fileName: string; columns: ExportColumn[]; data: Record<string, any>[] }) {
  const { fileName, columns, data } = opts;
  const lines: string[] = [];
  lines.push(columns.map(c => csvEscape(c.header)).join(','));
  for (const row of data) {
    lines.push(columns.map(c => {
      const v = row[c.key];
      if (c.format === 'date' && v) {
        const d = new Date(v);
        return csvEscape(d.toISOString().slice(0, 10));
      }
      return csvEscape(v);
    }).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
