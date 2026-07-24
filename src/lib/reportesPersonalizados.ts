/**
 * Reportes Personalizados — Constructor genérico de reportes por empresa.
 * Soporta múltiples fuentes de datos. Cada fuente define su catálogo de campos
 * y su ejecutor que arma filas planas para exportar (Excel / CSV / PDF).
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { ExportColumn } from '@/lib/exportUtils';

export type ReporteFuente =
  | 'ventas'
  | 'ventas_folio'
  | 'cobranza'
  | 'inventario'
  | 'compras'
  | 'clientes'
  | 'entregas'
  | 'visitas';

export interface CampoDef {
  key: string;
  label: string;
  format: ExportColumn['format'];
  width?: number;
  hint?: string;
}

export type EntityFilterKey =
  | 'cliente' | 'vendedor' | 'cobrador' | 'almacen' | 'proveedor'
  | 'zona' | 'categoria' | 'marca' | 'lista_precio'
  | 'metodo_pago' | 'condicion_pago' | 'monto' | 'search';

export interface ReporteFiltros {
  fechaDesde?: string;
  fechaHasta?: string;
  status?: string[];
  tipo?: string[];
  clienteIds?: string[];
  vendedorIds?: string[];
  cobradorIds?: string[];
  almacenIds?: string[];
  proveedorIds?: string[];
  zonaIds?: string[];
  categoriaIds?: string[];
  marcaIds?: string[];
  listaPrecioIds?: string[];
  metodoPago?: string[];
  condicionPago?: string[];
  montoMin?: number;
  montoMax?: number;
  search?: string;
}

export interface ReporteConfig {
  id?: string;
  empresa_id?: string;
  nombre: string;
  descripcion?: string;
  fuente: ReporteFuente;
  columnas: { key: string; header?: string }[];
  filtros_default?: ReporteFiltros;
}

// ──────────────────────────────────────────────────────────────
// Catálogos de campos
// ──────────────────────────────────────────────────────────────
export const CAMPOS_VENTAS: CampoDef[] = [
  { key: 'fecha',              label: 'Fecha',                 format: 'date',     width: 12 },
  { key: 'folio',              label: 'Folio',                 format: 'text',     width: 14 },
  { key: 'tipo',               label: 'Tipo',                  format: 'text',     width: 10 },
  { key: 'status',             label: 'Estado',                format: 'text',     width: 12 },
  { key: 'cliente_codigo',     label: 'Código Cliente',        format: 'text',     width: 12 },
  { key: 'cliente',            label: 'Cliente',               format: 'text',     width: 28 },
  { key: 'vendedor',           label: 'Vendedor',              format: 'text',     width: 20 },
  { key: 'codigo',             label: 'EAN / Código',          format: 'text',     width: 16 },
  { key: 'codigo_alterno',     label: 'Código alterno',        format: 'text',     width: 16 },
  { key: 'codigo_sat',         label: 'Código SAT',            format: 'text',     width: 12 },
  { key: 'descripcion',        label: 'Descripción producto',  format: 'text',     width: 32 },
  { key: 'cantidad',           label: 'Cantidad',              format: 'number',   width: 10 },
  { key: 'precio_antes_imp',   label: 'Precio antes de imp.',  format: 'currency', width: 14 },
  { key: 'tasa_iva',           label: 'Tasa IVA',              format: 'percent',  width: 10 },
  { key: 'tasa_ieps',          label: 'Tasa IEPS',             format: 'percent',  width: 10 },
  { key: 'importe_iva_pieza',  label: 'Importe IVA / pieza',   format: 'currency', width: 14 },
  { key: 'importe_ieps_pieza', label: 'Importe IEPS / pieza',  format: 'currency', width: 14 },
  { key: 'importe_iva',        label: 'Importe IVA (línea)',   format: 'currency', width: 14 },
  { key: 'importe_ieps',       label: 'Importe IEPS (línea)',  format: 'currency', width: 14 },
  { key: 'subtotal_linea',     label: 'Subtotal línea',        format: 'currency', width: 14 },
  { key: 'total_linea',        label: 'Total línea',           format: 'currency', width: 14 },
  { key: 'descuento_pct',      label: 'Descuento %',           format: 'percent',  width: 10 },
  { key: 'forma_pago',         label: 'Forma de Pago',         format: 'text',     width: 14 },
  { key: 'metodo_pago',        label: 'Método de pago',        format: 'text',     width: 18 },
  { key: 'condicion_pago',     label: 'Condición de pago',     format: 'text',     width: 12 },
  { key: 'total_venta',        label: 'Total venta',           format: 'currency', width: 14 },
  { key: 'saldo_pendiente',    label: 'Saldo pendiente venta', format: 'currency', width: 14 },
];

export const CAMPOS_COBRANZA: CampoDef[] = [
  { key: 'fecha',          label: 'Fecha cobro',     format: 'date',     width: 12 },
  { key: 'cobro_id',       label: 'ID cobro',        format: 'text',     width: 14 },
  { key: 'metodo_pago',    label: 'Método de pago',  format: 'text',     width: 14 },
  { key: 'referencia',     label: 'Referencia',      format: 'text',     width: 18 },
  { key: 'cliente_codigo', label: 'Código Cliente',  format: 'text',     width: 12 },
  { key: 'cliente',        label: 'Cliente',         format: 'text',     width: 28 },
  { key: 'cobrador',       label: 'Cobrador / Usuario', format: 'text',  width: 20 },
  { key: 'venta_folio',    label: 'Folio venta aplicada', format: 'text', width: 14 },
  { key: 'venta_fecha',    label: 'Fecha venta',     format: 'date',     width: 12 },
  { key: 'monto_aplicado', label: 'Monto aplicado',  format: 'currency', width: 14 },
  { key: 'monto_cobro',    label: 'Monto cobro',     format: 'currency', width: 14 },
  { key: 'status',         label: 'Estado cobro',    format: 'text',     width: 10 },
  { key: 'notas',          label: 'Notas',           format: 'text',     width: 24 },
];

export const CAMPOS_INVENTARIO: CampoDef[] = [
  { key: 'fecha',           label: 'Fecha',           format: 'date',     width: 12 },
  { key: 'tipo',            label: 'Tipo movimiento', format: 'text',     width: 14 },
  { key: 'codigo',          label: 'EAN / Código',    format: 'text',     width: 16 },
  { key: 'codigo_alterno',  label: 'Código alterno',  format: 'text',     width: 16 },
  { key: 'producto',        label: 'Producto',        format: 'text',     width: 32 },
  { key: 'cantidad',        label: 'Cantidad',        format: 'number',   width: 10 },
  { key: 'almacen_origen',  label: 'Almacén origen',  format: 'text',     width: 18 },
  { key: 'almacen_destino', label: 'Almacén destino', format: 'text',     width: 18 },
  { key: 'vendedor_destino',label: 'Vendedor destino',format: 'text',     width: 18 },
  { key: 'referencia_tipo', label: 'Documento',       format: 'text',     width: 14 },
  { key: 'referencia_id',   label: 'ID documento',    format: 'text',     width: 14 },
  { key: 'usuario',         label: 'Usuario',         format: 'text',     width: 18 },
  { key: 'notas',           label: 'Notas',           format: 'text',     width: 24 },
];

export const CAMPOS_COMPRAS: CampoDef[] = [
  { key: 'fecha',          label: 'Fecha',         format: 'date',     width: 12 },
  { key: 'folio',          label: 'Folio',         format: 'text',     width: 14 },
  { key: 'status',         label: 'Estado',        format: 'text',     width: 12 },
  { key: 'proveedor',      label: 'Proveedor',     format: 'text',     width: 28 },
  { key: 'proveedor_rfc',  label: 'RFC proveedor', format: 'text',     width: 14 },
  { key: 'almacen',        label: 'Almacén',       format: 'text',     width: 18 },
  { key: 'codigo',         label: 'EAN / Código',  format: 'text',     width: 16 },
  { key: 'producto',       label: 'Producto',      format: 'text',     width: 32 },
  { key: 'cantidad',       label: 'Cantidad',      format: 'number',   width: 10 },
  { key: 'precio_unitario',label: 'Costo unitario',format: 'currency', width: 14 },
  { key: 'subtotal_linea', label: 'Subtotal línea',format: 'currency', width: 14 },
  { key: 'total_linea',    label: 'Total línea',   format: 'currency', width: 14 },
  { key: 'total_compra',   label: 'Total compra',  format: 'currency', width: 14 },
  { key: 'saldo_pendiente',label: 'Saldo pendiente',format: 'currency',width: 14 },
  { key: 'condicion_pago', label: 'Condición pago',format: 'text',     width: 12 },
];

export const CAMPOS_CLIENTES: CampoDef[] = [
  { key: 'codigo',         label: 'Código',         format: 'text',     width: 12 },
  { key: 'nombre',         label: 'Nombre',         format: 'text',     width: 30 },
  { key: 'rfc',            label: 'RFC',            format: 'text',     width: 14 },
  { key: 'telefono',       label: 'Teléfono',       format: 'text',     width: 14 },
  { key: 'email',          label: 'Email',          format: 'text',     width: 22 },
  { key: 'direccion',      label: 'Dirección',      format: 'text',     width: 28 },
  { key: 'colonia',        label: 'Colonia',        format: 'text',     width: 18 },
  { key: 'cp',             label: 'CP',             format: 'text',     width: 8 },
  { key: 'vendedor',       label: 'Vendedor',       format: 'text',     width: 20 },
  { key: 'cobrador',       label: 'Cobrador',       format: 'text',     width: 20 },
  { key: 'zona',           label: 'Zona',           format: 'text',     width: 16 },
  { key: 'lista_precio',   label: 'Lista de precios',format: 'text',    width: 18 },
  { key: 'credito',        label: 'Crédito',        format: 'text',     width: 10 },
  { key: 'limite_credito', label: 'Límite crédito', format: 'currency', width: 14 },
  { key: 'dias_credito',   label: 'Días crédito',   format: 'number',   width: 10 },
  { key: 'frecuencia',     label: 'Frecuencia',     format: 'text',     width: 12 },
  { key: 'dia_visita',     label: 'Día(s) visita',  format: 'text',     width: 18 },
  { key: 'status',         label: 'Estado',         format: 'text',     width: 10 },
  { key: 'fecha_alta',     label: 'Alta',           format: 'date',     width: 12 },
];

export const CAMPOS_ENTREGAS: CampoDef[] = [
  { key: 'fecha',             label: 'Fecha',             format: 'date',     width: 12 },
  { key: 'folio',             label: 'Folio entrega',     format: 'text',     width: 14 },
  { key: 'status',            label: 'Estado',            format: 'text',     width: 12 },
  { key: 'pedido_folio',      label: 'Folio pedido',      format: 'text',     width: 14 },
  { key: 'cliente_codigo',    label: 'Código Cliente',    format: 'text',     width: 12 },
  { key: 'cliente',           label: 'Cliente',           format: 'text',     width: 28 },
  { key: 'vendedor',          label: 'Vendedor',          format: 'text',     width: 20 },
  { key: 'vendedor_ruta',     label: 'Vendedor ruta',     format: 'text',     width: 20 },
  { key: 'almacen',           label: 'Almacén',           format: 'text',     width: 18 },
  { key: 'orden_entrega',     label: 'Orden',             format: 'number',   width: 8 },
  { key: 'fecha_entrega',     label: 'Fecha entregado',   format: 'date',     width: 12 },
  { key: 'motivo_no_entrega', label: 'Motivo no entrega', format: 'text',     width: 22 },
  { key: 'codigo',            label: 'EAN / Código',      format: 'text',     width: 16 },
  { key: 'producto',          label: 'Producto',          format: 'text',     width: 32 },
  { key: 'cantidad_pedida',   label: 'Cant. pedida',      format: 'number',   width: 10 },
  { key: 'cantidad_entregada',label: 'Cant. entregada',   format: 'number',   width: 10 },
];

export const CAMPOS_VISITAS: CampoDef[] = [
  { key: 'fecha',          label: 'Fecha',         format: 'date',     width: 14 },
  { key: 'tipo',           label: 'Tipo',          format: 'text',     width: 12 },
  { key: 'motivo',         label: 'Motivo',        format: 'text',     width: 22 },
  { key: 'cliente_codigo', label: 'Código Cliente',format: 'text',     width: 12 },
  { key: 'cliente',        label: 'Cliente',       format: 'text',     width: 28 },
  { key: 'usuario',        label: 'Usuario',       format: 'text',     width: 20 },
  { key: 'gps_lat',        label: 'GPS Lat',       format: 'number',   width: 12 },
  { key: 'gps_lng',        label: 'GPS Lng',       format: 'number',   width: 12 },
  { key: 'venta_folio',    label: 'Folio venta',   format: 'text',     width: 14 },
  { key: 'notas',          label: 'Notas',         format: 'text',     width: 24 },
];

export interface FuenteMeta {
  key: ReporteFuente;
  label: string;
  description: string;
  campos: CampoDef[];
  /** Status options válidos en filtros */
  statusOptions?: string[];
  /** Tipos válidos en filtros */
  tipoOptions?: string[];
  /** Filtros adicionales por entidad */
  entityFilters?: EntityFilterKey[];
}

const CAMPOS_VENTAS_FOLIO: CampoDef[] = [
  { key: 'fecha',             label: 'Fecha',                format: 'date',     width: 12 },
  { key: 'folio',             label: 'Folio',                format: 'text',     width: 14 },
  { key: 'cliente_codigo',    label: 'Código Cliente',       format: 'text',     width: 12 },
  { key: 'cliente',           label: 'Cliente',              format: 'text',     width: 28 },
  { key: 'vendedor',          label: 'Vendedor',             format: 'text',     width: 20 },
  { key: 'tipo',              label: 'Tipo',                 format: 'text',     width: 10 },
  { key: 'status',            label: 'Estado',               format: 'text',     width: 12 },
  { key: 'condicion_pago',    label: 'Condición de pago',    format: 'text',     width: 12 },
  { key: 'forma_pago',        label: 'Forma de Pago',        format: 'text',     width: 14 },
  { key: 'metodo_pago',       label: 'Método de pago',       format: 'text',     width: 18 },
  { key: 'fecha_vencimiento', label: 'Fecha de vencimiento', format: 'date',     width: 14 },
  { key: 'total_venta',       label: 'Total venta',          format: 'currency', width: 14 },
  { key: 'abonado',           label: 'Abonado',              format: 'currency', width: 14 },
  { key: 'saldo_pendiente',   label: 'Saldo pendiente',      format: 'currency', width: 14 },
];

export const FUENTES: FuenteMeta[] = [
  { key: 'ventas',     label: 'Ventas (líneas)',       description: 'Una fila por línea de venta.',  campos: CAMPOS_VENTAS,    statusOptions: ['borrador','confirmado','entregado','facturado','cancelado'], tipoOptions: ['pedido','venta_directa','saldo_inicial'], entityFilters: ['cliente','vendedor','categoria','marca','condicion_pago','monto','search'] },
  { key: 'ventas_folio', label: 'Ventas (por folio)',  description: 'Una fila por venta/folio — cuentas por cobrar (con abonado y vencimiento).', campos: CAMPOS_VENTAS_FOLIO, statusOptions: ['borrador','confirmado','entregado','facturado','cancelado'], tipoOptions: ['pedido','venta_directa','saldo_inicial'], entityFilters: ['cliente','vendedor','condicion_pago','monto','search'] },
  { key: 'cobranza',   label: 'Cobranza (aplicaciones)', description: 'Una fila por aplicación de cobro a venta.', campos: CAMPOS_COBRANZA, statusOptions: ['activo','cancelado'], entityFilters: ['cliente','cobrador','metodo_pago','monto','search'] },
  { key: 'inventario', label: 'Inventario (movimientos)', description: 'Kardex: una fila por movimiento.', campos: CAMPOS_INVENTARIO, tipoOptions: ['entrada','salida','ajuste','traspaso','venta','compra','devolucion','merma'], entityFilters: ['almacen','categoria','marca','search'] },
  { key: 'compras',    label: 'Compras (líneas)',      description: 'Una fila por línea de compra.', campos: CAMPOS_COMPRAS, statusOptions: ['borrador','pendiente','recibida','pagada','cancelada'], entityFilters: ['proveedor','almacen','condicion_pago','monto','search'] },
  { key: 'clientes',   label: 'Clientes (catálogo)',   description: 'Una fila por cliente.', campos: CAMPOS_CLIENTES, statusOptions: ['activo','inactivo'], entityFilters: ['vendedor','cobrador','zona','lista_precio','search'] },
  { key: 'entregas',   label: 'Entregas / Rutas',      description: 'Una fila por línea de entrega.', campos: CAMPOS_ENTREGAS, statusOptions: ['borrador','asignado','cargado','hecho','no_entregado','cancelado'], entityFilters: ['cliente','vendedor','almacen','search'] },
  { key: 'visitas',    label: 'Visitas a clientes',    description: 'Una fila por visita registrada.', campos: CAMPOS_VISITAS, entityFilters: ['cliente','vendedor','search'] },
];

export function getFuenteMeta(f: ReporteFuente): FuenteMeta {
  return FUENTES.find(x => x.key === f) ?? FUENTES[0];
}

export function getCampos(fuente: ReporteFuente): CampoDef[] {
  return getFuenteMeta(fuente).campos;
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
// Ejecutor
// ──────────────────────────────────────────────────────────────
const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  deposito: 'Depósito',
};

async function loadMap<T extends { id: string }>(table: string, ids: string[], cols: string): Promise<Map<string, any>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from(table as any).select(cols).in('id', ids);
  return new Map((data || []).map((r: any) => [r.id, r]));
}

export async function runReporte(
  config: ReporteConfig,
  filtros: ReporteFiltros,
  empresaId: string,
): Promise<Record<string, any>[]> {
  switch (config.fuente) {
    case 'ventas':     return runVentas(config, filtros, empresaId);
    case 'ventas_folio': return runVentasFolio(filtros, empresaId);
    case 'cobranza':   return runCobranza(filtros, empresaId);
    case 'inventario': return runInventario(filtros, empresaId);
    case 'compras':    return runCompras(filtros, empresaId);
    case 'clientes':   return runClientes(filtros, empresaId);
    case 'entregas':   return runEntregas(filtros, empresaId);
    case 'visitas':    return runVisitas(filtros, empresaId);
    default: return [];
  }
}

// ─── Ventas ────────────────────────────────────────────────────
async function runVentas(config: ReporteConfig, filtros: ReporteFiltros, empresaId: string) {
  // Pre-filtro por categoría/marca: resolver lista de producto_id
  let allowedProductoIds: string[] | null = null;
  if (filtros.categoriaIds?.length || filtros.marcaIds?.length) {
    const prods = await fetchAllPages<any>((from, to) => {
      let pq = supabase.from('productos').select('id').eq('empresa_id', empresaId).range(from, to);
      if (filtros.categoriaIds?.length) pq = pq.in('clasificacion_id', filtros.categoriaIds);
      if (filtros.marcaIds?.length) pq = pq.in('marca_id', filtros.marcaIds);
      return pq;
    });
    allowedProductoIds = prods.map(p => p.id);
    if (!allowedProductoIds.length) return [];
  }

  const ventas = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('ventas')
      .select('id, folio, fecha, tipo, status, condicion_pago, cliente_id, vendedor_id, total, saldo_pendiente')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
    if (filtros.status?.length) q = q.in('status', filtros.status as any);
    if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo as any);
    if (filtros.clienteIds?.length) q = q.in('cliente_id', filtros.clienteIds);
    if (filtros.vendedorIds?.length) q = q.in('vendedor_id', filtros.vendedorIds);
    if (filtros.condicionPago?.length) q = q.in('condicion_pago', filtros.condicionPago as any);
    if (typeof filtros.montoMin === 'number') q = q.gte('total', filtros.montoMin);
    if (typeof filtros.montoMax === 'number') q = q.lte('total', filtros.montoMax);
    if (filtros.search?.trim()) q = q.ilike('folio', `%${filtros.search.trim()}%`);
    return q;
  });
  if (!ventas.length) return [];

  const ventaIds = ventas.map(v => v.id);
  const clienteIds = Array.from(new Set(ventas.map(v => v.cliente_id).filter(Boolean)));
  const vendedorIds = Array.from(new Set(ventas.map(v => v.vendedor_id).filter(Boolean)));

  const [clientesMap, vendedoresMap] = await Promise.all([
    loadMap('clientes', clienteIds, 'id, codigo, nombre'),
    loadMap('profiles', vendedorIds, 'id, nombre'),
  ]);

  let lineas = await fetchAllPages<any>((from, to) =>
    supabase
      .from('venta_lineas')
      .select('venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, subtotal, iva_pct, ieps_pct, iva_monto, ieps_monto, total')
      .in('venta_id', ventaIds)
      .range(from, to)
  );
  if (allowedProductoIds) {
    const set = new Set(allowedProductoIds);
    lineas = lineas.filter(l => set.has(l.producto_id));
  }

  const productoIds = Array.from(new Set(lineas.map(l => l.producto_id).filter(Boolean)));
  const productosMap = await loadMap('productos', productoIds, 'id, codigo, clave_alterna, codigo_sat, nombre, nombre_venta');

  const metodoPagoMap = new Map<string, string>();
  if (config.columnas.some(c => c.key === 'metodo_pago' || c.key === 'forma_pago')) {
    const aplicaciones = await fetchAllPages<any>((from, to) =>
      supabase.from('cobro_aplicaciones').select('venta_id, cobros!inner(metodo_pago, status)').in('venta_id', ventaIds).neq('cobros.status', 'cancelado').range(from, to)
    );
    const tmp = new Map<string, Set<string>>();
    for (const a of aplicaciones) {
      const m = a.cobros?.metodo_pago; if (!m) continue;
      const set = tmp.get(a.venta_id) ?? new Set<string>();
      set.add(METODO_LABELS[m] ?? m);
      tmp.set(a.venta_id, set);
    }
    for (const [vid, set] of tmp) metodoPagoMap.set(vid, Array.from(set).join(', '));
  }

  const ventasMap = new Map(ventas.map(v => [v.id, v]));
  const rows: Record<string, any>[] = [];
  for (const l of lineas) {
    const v = ventasMap.get(l.venta_id); if (!v) continue;
    const c = clientesMap.get(v.cliente_id);
    const vd = vendedoresMap.get(v.vendedor_id);
    const p = productosMap.get(l.producto_id);
    const cantidad = Number(l.cantidad || 0);
    rows.push({
      fecha: v.fecha, folio: v.folio, tipo: v.tipo, status: v.status,
      cliente_codigo: c?.codigo ?? '', cliente: c?.nombre ?? '', vendedor: vd?.nombre ?? '',
      codigo: p?.codigo ?? '', codigo_alterno: p?.clave_alterna ?? '', codigo_sat: p?.codigo_sat ?? '',
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
      forma_pago: v.condicion_pago === 'contado' ? 'Contado' : v.condicion_pago === 'credito' ? 'Crédito' : 'Por definir',
      metodo_pago: metodoPagoMap.get(v.id) ?? '',
      condicion_pago: v.condicion_pago,
      total_venta: Number(v.total || 0),
      saldo_pendiente: Number(v.saldo_pendiente || 0),
    });
  }
  return rows;
}

// ─── Ventas por folio (cuentas por cobrar) ─────────────────────
// Una fila por venta (no por línea): fecha, cliente, folio, tipo, vencimiento,
// total, abonado (Σ cobros aplicados) y saldo. Para monitoreo de crédito.
async function runVentasFolio(filtros: ReporteFiltros, empresaId: string) {
  const ventas = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('ventas')
      .select('id, folio, fecha, tipo, status, condicion_pago, dias_credito, cliente_id, vendedor_id, total, saldo_pendiente')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
    if (filtros.status?.length) q = q.in('status', filtros.status as any);
    if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo as any);
    if (filtros.clienteIds?.length) q = q.in('cliente_id', filtros.clienteIds);
    if (filtros.vendedorIds?.length) q = q.in('vendedor_id', filtros.vendedorIds);
    if (filtros.condicionPago?.length) q = q.in('condicion_pago', filtros.condicionPago as any);
    if (typeof filtros.montoMin === 'number') q = q.gte('total', filtros.montoMin);
    if (typeof filtros.montoMax === 'number') q = q.lte('total', filtros.montoMax);
    if (filtros.search?.trim()) q = q.ilike('folio', `%${filtros.search.trim()}%`);
    return q;
  });
  if (!ventas.length) return [];

  const ventaIds = ventas.map(v => v.id);
  const clienteIds = Array.from(new Set(ventas.map(v => v.cliente_id).filter(Boolean)));
  const vendedorIds = Array.from(new Set(ventas.map(v => v.vendedor_id).filter(Boolean)));
  const [clientesMap, vendedoresMap] = await Promise.all([
    loadMap('clientes', clienteIds, 'id, codigo, nombre'),
    loadMap('profiles', vendedorIds, 'id, nombre'),
  ]);

  // Abonado (Σ cobros aplicados no cancelados) + método de pago por venta.
  const apps = await fetchAllPages<any>((from, to) =>
    supabase.from('cobro_aplicaciones')
      .select('venta_id, monto_aplicado, cobros!inner(metodo_pago, status)')
      .in('venta_id', ventaIds)
      .neq('cobros.status', 'cancelado')
      .range(from, to)
  );
  const abonadoMap = new Map<string, number>();
  const metodoMap = new Map<string, Set<string>>();
  for (const a of apps) {
    abonadoMap.set(a.venta_id, (abonadoMap.get(a.venta_id) ?? 0) + Number(a.monto_aplicado || 0));
    const m = a.cobros?.metodo_pago;
    if (m) { const s = metodoMap.get(a.venta_id) ?? new Set<string>(); s.add(METODO_LABELS[m] ?? m); metodoMap.set(a.venta_id, s); }
  }

  return ventas.map(v => {
    const c = clientesMap.get(v.cliente_id);
    const vd = vendedoresMap.get(v.vendedor_id);
    const dias = Number(v.dias_credito) || 0;
    let venc: string | null = null;
    if (v.condicion_pago === 'credito' && dias > 0 && v.fecha) {
      const d = new Date(v.fecha + 'T00:00:00');
      d.setDate(d.getDate() + dias);
      venc = d.toISOString().slice(0, 10);
    }
    return {
      fecha: v.fecha, folio: v.folio, tipo: v.tipo, status: v.status,
      cliente_codigo: c?.codigo ?? '', cliente: c?.nombre ?? '', vendedor: vd?.nombre ?? '',
      condicion_pago: v.condicion_pago,
      forma_pago: v.condicion_pago === 'contado' ? 'Contado' : v.condicion_pago === 'credito' ? 'Crédito' : 'Por definir',
      metodo_pago: metodoMap.has(v.id) ? Array.from(metodoMap.get(v.id)!).join(', ') : '',
      fecha_vencimiento: venc,
      total_venta: Number(v.total || 0),
      abonado: abonadoMap.get(v.id) ?? 0,
      saldo_pendiente: Number(v.saldo_pendiente || 0),
    };
  });
}

// ─── Cobranza ──────────────────────────────────────────────────
async function runCobranza(filtros: ReporteFiltros, empresaId: string) {
  const cobros = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('cobros')
      .select('id, fecha, monto, metodo_pago, referencia, notas, status, user_id, cliente_id')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
    if (filtros.status?.length) q = q.in('status', filtros.status);
    if (filtros.clienteIds?.length) q = q.in('cliente_id', filtros.clienteIds);
    if (filtros.cobradorIds?.length) q = q.in('user_id', filtros.cobradorIds);
    if (filtros.metodoPago?.length) q = q.in('metodo_pago', filtros.metodoPago as any);
    if (typeof filtros.montoMin === 'number') q = q.gte('monto', filtros.montoMin);
    if (typeof filtros.montoMax === 'number') q = q.lte('monto', filtros.montoMax);
    if (filtros.search?.trim()) {
      const s = filtros.search.trim();
      q = q.or(`referencia.ilike.%${s}%,notas.ilike.%${s}%`);
    }
    return q;
  });
  if (!cobros.length) return [];
  const cobroIds = cobros.map(c => c.id);
  const clienteIds = Array.from(new Set(cobros.map(c => c.cliente_id).filter(Boolean)));
  const userIds = Array.from(new Set(cobros.map(c => c.user_id).filter(Boolean)));

  const [clientesMap, usersMap, apps] = await Promise.all([
    loadMap('clientes', clienteIds, 'id, codigo, nombre'),
    loadMap('profiles', userIds, 'id, nombre'),
    fetchAllPages<any>((from, to) =>
      supabase.from('cobro_aplicaciones').select('cobro_id, venta_id, monto_aplicado').in('cobro_id', cobroIds).range(from, to)
    ),
  ]);
  const ventaIds = Array.from(new Set(apps.map(a => a.venta_id).filter(Boolean)));
  const ventasMap = await loadMap('ventas', ventaIds, 'id, folio, fecha');

  const cobrosMap = new Map(cobros.map(c => [c.id, c]));
  const rows: Record<string, any>[] = [];
  for (const a of apps) {
    const c = cobrosMap.get(a.cobro_id); if (!c) continue;
    const cl = clientesMap.get(c.cliente_id);
    const u = usersMap.get(c.user_id);
    const v = ventasMap.get(a.venta_id);
    rows.push({
      fecha: c.fecha, cobro_id: c.id.slice(0,8), metodo_pago: METODO_LABELS[c.metodo_pago] ?? c.metodo_pago,
      referencia: c.referencia ?? '', cliente_codigo: cl?.codigo ?? '', cliente: cl?.nombre ?? '',
      cobrador: u?.nombre ?? '', venta_folio: v?.folio ?? '', venta_fecha: v?.fecha ?? '',
      monto_aplicado: Number(a.monto_aplicado || 0), monto_cobro: Number(c.monto || 0),
      status: c.status, notas: c.notas ?? '',
    });
  }
  // si un cobro no tiene aplicaciones (ej. anticipo), aún incluirlo
  const usados = new Set(apps.map(a => a.cobro_id));
  for (const c of cobros) {
    if (usados.has(c.id)) continue;
    const cl = clientesMap.get(c.cliente_id);
    const u = usersMap.get(c.user_id);
    rows.push({
      fecha: c.fecha, cobro_id: c.id.slice(0,8), metodo_pago: METODO_LABELS[c.metodo_pago] ?? c.metodo_pago,
      referencia: c.referencia ?? '', cliente_codigo: cl?.codigo ?? '', cliente: cl?.nombre ?? '',
      cobrador: u?.nombre ?? '', venta_folio: '', venta_fecha: '',
      monto_aplicado: 0, monto_cobro: Number(c.monto || 0),
      status: c.status, notas: c.notas ?? '',
    });
  }
  return rows;
}

// ─── Inventario ────────────────────────────────────────────────
async function runInventario(filtros: ReporteFiltros, empresaId: string) {
  let allowedProductoIds: string[] | null = null;
  if (filtros.categoriaIds?.length || filtros.marcaIds?.length) {
    const prods = await fetchAllPages<any>((from, to) => {
      let pq = supabase.from('productos').select('id').eq('empresa_id', empresaId).range(from, to);
      if (filtros.categoriaIds?.length) pq = pq.in('clasificacion_id', filtros.categoriaIds);
      if (filtros.marcaIds?.length) pq = pq.in('marca_id', filtros.marcaIds);
      return pq;
    });
    allowedProductoIds = prods.map(p => p.id);
    if (!allowedProductoIds.length) return [];
  }
  const movs = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('movimientos_inventario')
      .select('fecha, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, vendedor_destino_id, referencia_tipo, referencia_id, notas, user_id')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
    if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo as any);
    if (allowedProductoIds) q = q.in('producto_id', allowedProductoIds);
    if (filtros.almacenIds?.length) q = q.or(`almacen_origen_id.in.(${filtros.almacenIds.join(',')}),almacen_destino_id.in.(${filtros.almacenIds.join(',')})`);
    if (filtros.search?.trim()) q = q.ilike('notas', `%${filtros.search.trim()}%`);
    return q;
  });
  if (!movs.length) return [];
  const productoIds = Array.from(new Set(movs.map(m => m.producto_id).filter(Boolean)));
  const almacenIds = Array.from(new Set(movs.flatMap(m => [m.almacen_origen_id, m.almacen_destino_id]).filter(Boolean)));
  const userIds = Array.from(new Set(movs.flatMap(m => [m.user_id, m.vendedor_destino_id]).filter(Boolean)));
  const [productosMap, almacenesMap, usersMap] = await Promise.all([
    loadMap('productos', productoIds, 'id, codigo, clave_alterna, nombre'),
    loadMap('almacenes', almacenIds, 'id, nombre'),
    loadMap('profiles', userIds, 'id, nombre'),
  ]);
  return movs.map(m => {
    const p = productosMap.get(m.producto_id);
    return {
      fecha: m.fecha, tipo: m.tipo,
      codigo: p?.codigo ?? '', codigo_alterno: p?.clave_alterna ?? '', producto: p?.nombre ?? '',
      cantidad: Number(m.cantidad || 0),
      almacen_origen: almacenesMap.get(m.almacen_origen_id)?.nombre ?? '',
      almacen_destino: almacenesMap.get(m.almacen_destino_id)?.nombre ?? '',
      vendedor_destino: usersMap.get(m.vendedor_destino_id)?.nombre ?? '',
      referencia_tipo: m.referencia_tipo ?? '', referencia_id: m.referencia_id ? String(m.referencia_id).slice(0,8) : '',
      usuario: usersMap.get(m.user_id)?.nombre ?? '', notas: m.notas ?? '',
    };
  });
}

// ─── Compras ───────────────────────────────────────────────────
async function runCompras(filtros: ReporteFiltros, empresaId: string) {
  const compras = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('compras')
      .select('id, fecha, folio, status, proveedor_id, almacen_id, total, saldo_pendiente, condicion_pago')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
    if (filtros.status?.length) q = q.in('status', filtros.status);
    if (filtros.proveedorIds?.length) q = q.in('proveedor_id', filtros.proveedorIds);
    if (filtros.almacenIds?.length) q = q.in('almacen_id', filtros.almacenIds);
    if (filtros.condicionPago?.length) q = q.in('condicion_pago', filtros.condicionPago as any);
    if (typeof filtros.montoMin === 'number') q = q.gte('total', filtros.montoMin);
    if (typeof filtros.montoMax === 'number') q = q.lte('total', filtros.montoMax);
    if (filtros.search?.trim()) q = q.ilike('folio', `%${filtros.search.trim()}%`);
    return q;
  });
  if (!compras.length) return [];
  const compraIds = compras.map(c => c.id);
  const provIds = Array.from(new Set(compras.map(c => c.proveedor_id).filter(Boolean)));
  const almIds = Array.from(new Set(compras.map(c => c.almacen_id).filter(Boolean)));
  const [provMap, almMap, lineas] = await Promise.all([
    loadMap('proveedores', provIds, 'id, nombre, rfc'),
    loadMap('almacenes', almIds, 'id, nombre'),
    fetchAllPages<any>((from, to) =>
      supabase.from('compra_lineas').select('compra_id, producto_id, cantidad, precio_unitario, subtotal, total').in('compra_id', compraIds).range(from, to)
    ),
  ]);
  const productoIds = Array.from(new Set(lineas.map(l => l.producto_id).filter(Boolean)));
  const productosMap = await loadMap('productos', productoIds, 'id, codigo, nombre');
  const comprasMap = new Map(compras.map(c => [c.id, c]));
  return lineas.map(l => {
    const c = comprasMap.get(l.compra_id); if (!c) return null;
    const p = productosMap.get(l.producto_id);
    const prov = provMap.get(c.proveedor_id);
    return {
      fecha: c.fecha, folio: c.folio ?? '', status: c.status,
      proveedor: prov?.nombre ?? '', proveedor_rfc: prov?.rfc ?? '',
      almacen: almMap.get(c.almacen_id)?.nombre ?? '',
      codigo: p?.codigo ?? '', producto: p?.nombre ?? '',
      cantidad: Number(l.cantidad || 0),
      precio_unitario: Number(l.precio_unitario || 0),
      subtotal_linea: Number(l.subtotal || 0),
      total_linea: Number(l.total || 0),
      total_compra: Number(c.total || 0),
      saldo_pendiente: Number(c.saldo_pendiente || 0),
      condicion_pago: c.condicion_pago,
    };
  }).filter(Boolean) as Record<string, any>[];
}

// ─── Clientes ──────────────────────────────────────────────────
async function runClientes(filtros: ReporteFiltros, empresaId: string) {
  const clientes = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('clientes')
      .select('id, codigo, nombre, rfc, telefono, email, direccion, colonia, cp, vendedor_id, cobrador_id, zona_id, lista_precio_id, credito, limite_credito, dias_credito, frecuencia, dia_visita, status, fecha_alta')
      .eq('empresa_id', empresaId)
      .order('nombre', { ascending: true })
      .range(from, to);
    if (filtros.status?.length) q = q.in('status', filtros.status as any);
    if (filtros.vendedorIds?.length) q = q.in('vendedor_id', filtros.vendedorIds);
    if (filtros.cobradorIds?.length) q = q.in('cobrador_id', filtros.cobradorIds);
    if (filtros.zonaIds?.length) q = q.in('zona_id', filtros.zonaIds);
    if (filtros.listaPrecioIds?.length) q = q.in('lista_precio_id', filtros.listaPrecioIds);
    if (filtros.search?.trim()) {
      const s = filtros.search.trim();
      q = q.or(`nombre.ilike.%${s}%,codigo.ilike.%${s}%,rfc.ilike.%${s}%,telefono.ilike.%${s}%`);
    }
    return q;
  });
  if (!clientes.length) return [];
  const vendIds = Array.from(new Set(clientes.flatMap(c => [c.vendedor_id, c.cobrador_id]).filter(Boolean)));
  const zonaIds = Array.from(new Set(clientes.map(c => c.zona_id).filter(Boolean)));
  const listaIds = Array.from(new Set(clientes.map(c => c.lista_precio_id).filter(Boolean)));
  const [profMap, zonasMap, listasMap] = await Promise.all([
    loadMap('profiles', vendIds, 'id, nombre'),
    loadMap('zonas', zonaIds, 'id, nombre'),
    loadMap('tarifas', listaIds, 'id, nombre'),
  ]);
  return clientes.map(c => ({
    codigo: c.codigo ?? '', nombre: c.nombre, rfc: c.rfc ?? '',
    telefono: c.telefono ?? '', email: c.email ?? '',
    direccion: c.direccion ?? '', colonia: c.colonia ?? '', cp: c.cp ?? '',
    vendedor: profMap.get(c.vendedor_id)?.nombre ?? '',
    cobrador: profMap.get(c.cobrador_id)?.nombre ?? '',
    zona: zonasMap.get(c.zona_id)?.nombre ?? '',
    lista_precio: listasMap.get(c.lista_precio_id)?.nombre ?? '',
    credito: c.credito ? 'Sí' : 'No',
    limite_credito: Number(c.limite_credito || 0),
    dias_credito: Number(c.dias_credito || 0),
    frecuencia: c.frecuencia ?? '',
    dia_visita: Array.isArray(c.dia_visita) ? c.dia_visita.join(', ') : '',
    status: c.status ?? '',
    fecha_alta: c.fecha_alta ?? '',
  }));
}

// ─── Entregas ──────────────────────────────────────────────────
async function runEntregas(filtros: ReporteFiltros, empresaId: string) {
  const entregas = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('entregas')
      .select('id, folio, fecha, status, pedido_id, cliente_id, vendedor_id, vendedor_ruta_id, almacen_id, orden_entrega, fecha_entrega, motivo_no_entrega')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
    if (filtros.status?.length) q = q.in('status', filtros.status as any);
    if (filtros.clienteIds?.length) q = q.in('cliente_id', filtros.clienteIds);
    if (filtros.vendedorIds?.length) q = q.or(`vendedor_id.in.(${filtros.vendedorIds.join(',')}),vendedor_ruta_id.in.(${filtros.vendedorIds.join(',')})`);
    if (filtros.almacenIds?.length) q = q.in('almacen_id', filtros.almacenIds);
    if (filtros.search?.trim()) q = q.ilike('folio', `%${filtros.search.trim()}%`);
    return q;
  });
  if (!entregas.length) return [];
  const entregaIds = entregas.map(e => e.id);
  const clienteIds = Array.from(new Set(entregas.map(e => e.cliente_id).filter(Boolean)));
  const vendIds = Array.from(new Set(entregas.flatMap(e => [e.vendedor_id, e.vendedor_ruta_id]).filter(Boolean)));
  const almIds = Array.from(new Set(entregas.map(e => e.almacen_id).filter(Boolean)));
  const pedidoIds = Array.from(new Set(entregas.map(e => e.pedido_id).filter(Boolean)));
  const [clientesMap, profMap, almMap, ventasMap, lineas] = await Promise.all([
    loadMap('clientes', clienteIds, 'id, codigo, nombre'),
    loadMap('profiles', vendIds, 'id, nombre'),
    loadMap('almacenes', almIds, 'id, nombre'),
    loadMap('ventas', pedidoIds, 'id, folio'),
    fetchAllPages<any>((from, to) =>
      supabase.from('entrega_lineas').select('entrega_id, producto_id, cantidad_pedida, cantidad_entregada').in('entrega_id', entregaIds).range(from, to)
    ),
  ]);
  const productoIds = Array.from(new Set(lineas.map(l => l.producto_id).filter(Boolean)));
  const productosMap = await loadMap('productos', productoIds, 'id, codigo, nombre');
  const entregasMap = new Map(entregas.map(e => [e.id, e]));
  return lineas.map(l => {
    const e = entregasMap.get(l.entrega_id); if (!e) return null;
    const cl = clientesMap.get(e.cliente_id);
    const p = productosMap.get(l.producto_id);
    return {
      fecha: e.fecha, folio: e.folio ?? '', status: e.status,
      pedido_folio: ventasMap.get(e.pedido_id)?.folio ?? '',
      cliente_codigo: cl?.codigo ?? '', cliente: cl?.nombre ?? '',
      vendedor: profMap.get(e.vendedor_id)?.nombre ?? '',
      vendedor_ruta: profMap.get(e.vendedor_ruta_id)?.nombre ?? '',
      almacen: almMap.get(e.almacen_id)?.nombre ?? '',
      orden_entrega: Number(e.orden_entrega || 0),
      fecha_entrega: e.fecha_entrega ?? '',
      motivo_no_entrega: e.motivo_no_entrega ?? '',
      codigo: p?.codigo ?? '', producto: p?.nombre ?? '',
      cantidad_pedida: Number(l.cantidad_pedida || 0),
      cantidad_entregada: Number(l.cantidad_entregada || 0),
    };
  }).filter(Boolean) as Record<string, any>[];
}

// ─── Visitas ───────────────────────────────────────────────────
async function runVisitas(filtros: ReporteFiltros, empresaId: string) {
  const visitas = await fetchAllPages<any>((from, to) => {
    let q = supabase
      .from('visitas')
      .select('fecha, tipo, motivo, cliente_id, user_id, gps_lat, gps_lng, venta_id, notas')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: true })
      .range(from, to);
    if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
    if (filtros.fechaHasta) q = q.lte('fecha', filtros.fechaHasta + 'T23:59:59');
    if (filtros.tipo?.length) q = q.in('tipo', filtros.tipo);
    if (filtros.clienteIds?.length) q = q.in('cliente_id', filtros.clienteIds);
    if (filtros.vendedorIds?.length) q = q.in('user_id', filtros.vendedorIds);
    if (filtros.search?.trim()) {
      const s = filtros.search.trim();
      q = q.or(`motivo.ilike.%${s}%,notas.ilike.%${s}%`);
    }
    return q;
  });
  if (!visitas.length) return [];
  const clienteIds = Array.from(new Set(visitas.map(v => v.cliente_id).filter(Boolean)));
  const userIds = Array.from(new Set(visitas.map(v => v.user_id).filter(Boolean)));
  const ventaIds = Array.from(new Set(visitas.map(v => v.venta_id).filter(Boolean)));
  const [clientesMap, usersMap, ventasMap] = await Promise.all([
    loadMap('clientes', clienteIds, 'id, codigo, nombre'),
    loadMap('profiles', userIds, 'id, nombre'),
    loadMap('ventas', ventaIds, 'id, folio'),
  ]);
  return visitas.map(v => {
    const cl = clientesMap.get(v.cliente_id);
    return {
      fecha: v.fecha, tipo: v.tipo, motivo: v.motivo ?? '',
      cliente_codigo: cl?.codigo ?? '', cliente: cl?.nombre ?? '',
      usuario: usersMap.get(v.user_id)?.nombre ?? '',
      gps_lat: v.gps_lat ?? '', gps_lng: v.gps_lng ?? '',
      venta_folio: ventasMap.get(v.venta_id)?.folio ?? '',
      notas: v.notas ?? '',
    };
  });
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

export function exportToCSV(opts: { fileName: string; columns: ExportColumn[]; data: Record<string, any>[]; groups?: ReporteGroup[] }) {
  const { fileName, columns, data, groups } = opts;
  const lines: string[] = [];
  lines.push(columns.map(c => csvEscape(c.header)).join(','));

  const renderRow = (row: Record<string, any>) => columns.map(c => {
    const v = row[c.key];
    if (c.format === 'date' && v) {
      const s = String(v);
      const hasTime = /T\d{2}:\d{2}/.test(s);
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        if (hasTime) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mi = String(d.getMinutes()).padStart(2, '0');
          return csvEscape(`${dd}/${mm}/${yyyy} ${hh}:${mi}`);
        }
        return csvEscape(`${dd}/${mm}/${yyyy}`);
      }
    }
    return csvEscape(v);
  }).join(',');

  if (groups && groups.length) {
    for (const g of groups) {
      lines.push(csvEscape(`# ${g.label} (${g.rows.length})`));
      for (const row of g.rows) lines.push(renderRow(row));
      lines.push(columns.map((c, i) => {
        if (i === 0) return csvEscape(`Subtotal ${g.label}`);
        if (c.key in g.subtotals) return csvEscape(g.subtotals[c.key]);
        return '';
      }).join(','));
    }
  } else {
    for (const row of data) lines.push(renderRow(row));
  }

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────────────
// Agrupación de filas (para exportar agrupado por X)
// ──────────────────────────────────────────────────────────────
export interface ReporteGroup {
  key: string;
  label: string;
  rows: Record<string, any>[];
  subtotals: Record<string, number>;
}

export interface GroupByOption {
  key: string;
  label: string;
}

/** Devuelve los campos que pueden usarse para agrupar (todos los del catálogo, no solo los seleccionados). */
export function getGroupableOptions(
  columns: ExportColumn[],
  allCampos?: CampoDef[]
): GroupByOption[] {
  const opts: GroupByOption[] = [{ key: '', label: 'Sin agrupar' }];
  const seen = new Set<string>();
  const push = (key: string, label: string, format?: CampoDef['format']) => {
    if (seen.has(key)) return;
    if (format === 'currency' || format === 'percent' || format === 'number') return;
    seen.add(key);
    opts.push({ key, label });
    if (format === 'date') opts.push({ key: `${key}__mes`, label: `${label} (mes)` });
  };
  // Primero columnas seleccionadas (con header personalizado si existe)
  for (const c of columns) push(c.key, c.header, c.format);
  // Luego el resto del catálogo de la fuente
  if (allCampos) for (const c of allCampos) push(c.key, c.label, c.format);
  return opts;
}

const fmtGroupLabel = (val: any, format?: ExportColumn['format'], suffix?: 'mes'): string => {
  if (val === null || val === undefined || val === '') return '(Sin valor)';
  if (format === 'date') {
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return String(val);
    if (suffix === 'mes') {
      return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return String(val);
};

const groupKeyOf = (val: any, format?: ExportColumn['format'], suffix?: 'mes'): string => {
  if (val === null || val === undefined || val === '') return '__null__';
  if (format === 'date') {
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return String(val);
    if (suffix === 'mes') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(val);
};

/** Agrupa filas por una columna. groupBy puede ser 'campo' o 'campo__mes' para fecha mensual. */
export function groupRows(
  rows: Record<string, any>[],
  columns: ExportColumn[],
  groupBy: string
): { groups: ReporteGroup[]; totals: Record<string, number> } {
  const [baseKey, suffix] = groupBy.split('__') as [string, 'mes' | undefined];
  const col = columns.find(c => c.key === baseKey);
  const format: ExportColumn['format'] | undefined = col?.format ?? (suffix === 'mes' ? 'date' : undefined);
  const map = new Map<string, ReporteGroup>();
  const numericKeys = columns.filter(c => c.format === 'currency' || c.format === 'number').map(c => c.key);
  const totals: Record<string, number> = {};

  for (const r of rows) {
    const k = groupKeyOf(r[baseKey], format, suffix);
    let g = map.get(k);
    if (!g) {
      g = { key: k, label: fmtGroupLabel(r[baseKey], format, suffix), rows: [], subtotals: {} };
      map.set(k, g);
    }
    g.rows.push(r);
    for (const nk of numericKeys) {
      const n = Number(r[nk]) || 0;
      g.subtotals[nk] = (g.subtotals[nk] ?? 0) + n;
      totals[nk] = (totals[nk] ?? 0) + n;
    }
  }

  const groups = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));
  return { groups, totals };
}

