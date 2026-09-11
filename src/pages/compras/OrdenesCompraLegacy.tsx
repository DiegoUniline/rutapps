import { useState, useMemo } from 'react';
import { fetchAllPages } from '@/lib/supabasePaginate';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus, List, Package, ChevronDown, FileSpreadsheet, Trash2 } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { CompraExpandedRow } from './compras/CompraExpandedRow';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { cn, fmtDate, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';
import { getNombreCompra } from '@/lib/productoNombres';
import { toast } from 'sonner';
import { prorratearAjustesCompra } from '@/lib/compraAjustes';

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  borrador: { label: 'Borrador', variant: 'borrador' },
  confirmada: { label: 'Confirmada', variant: 'confirmado' },
  recibida: { label: 'Recibida', variant: 'entregado' },
  pagada: { label: 'Pagada', variant: 'facturado' },
  cancelada: { label: 'Cancelada', variant: 'cancelado' },
};

const COMPRAS_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'numero_factura', header: 'Número de factura', width: 18 },
  { key: 'proveedor', header: 'Proveedor', width: 25 },
  { key: 'proveedor_rfc', header: 'RFC proveedor', width: 16 },
  { key: 'almacen', header: 'Almacén', width: 18 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'fecha_vencimiento', header: 'Vencimiento', format: 'date', width: 12 },
  { key: 'condicion_pago', header: 'Condición', width: 12 },
  { key: 'dias_credito', header: 'Días crédito', format: 'number', width: 12 },
  { key: 'subtotal', header: 'Subtotal', format: 'currency', width: 14 },
  { key: 'iva_total', header: 'IVA', format: 'currency', width: 12 },
  { key: 'total_antes_ajustes', header: 'Total antes ajustes', format: 'currency', width: 18 },
  { key: 'descuento_capturado', header: 'Descuento capturado', format: 'number', width: 18 },
  { key: 'descuento_tipo', header: 'Tipo descuento', width: 14 },
  { key: 'descuento_total', header: 'Descuento aplicado', format: 'currency', width: 18 },
  { key: 'descuento_motivo', header: 'Motivo descuento', width: 28 },
  { key: 'ajuste_total', header: 'Ajuste (+ / −)', format: 'currency', width: 14 },
  { key: 'total', header: 'Total final', format: 'currency', width: 14 },
  { key: 'total_pagado', header: 'Total pagado', format: 'currency', width: 14 },
  { key: 'saldo_pendiente', header: 'Saldo', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
  { key: 'notas', header: 'Notas', width: 30 },
  { key: 'notas_pago', header: 'Notas de pago', width: 30 },
];

const DETALLE_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'numero_factura', header: 'Número de factura', width: 18 },
  { key: 'proveedor', header: 'Proveedor', width: 25 },
  { key: 'proveedor_rfc', header: 'RFC proveedor', width: 16 },
  { key: 'almacen', header: 'Almacén', width: 18 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'codigo', header: 'Código', width: 14 },
  { key: 'producto', header: 'Producto', width: 25 },
  { key: 'cantidad', header: 'Cantidad', format: 'number', width: 12 },
  { key: 'factor_conversion', header: 'Factor conversión', format: 'number', width: 15 },
  { key: 'piezas_total', header: 'Piezas totales', format: 'number', width: 14 },
  { key: 'cantidad_recibida', header: 'Piezas recibidas', format: 'number', width: 15 },
  { key: 'cantidad_pendiente', header: 'Piezas pendientes', format: 'number', width: 15 },
  { key: 'precio_unitario', header: 'Costo unitario bruto', format: 'currency', width: 18 },
  { key: 'subtotal', header: 'Subtotal línea', format: 'currency', width: 14 },
  { key: 'total_bruto_linea', header: 'Total bruto línea', format: 'currency', width: 17 },
  { key: 'descuento_prorrateado', header: 'Descuento prorrateado', format: 'currency', width: 20 },
  { key: 'ajuste_prorrateado', header: 'Ajuste prorrateado', format: 'currency', width: 18 },
  { key: 'total_neto_linea', header: 'Total neto línea', format: 'currency', width: 17 },
  { key: 'costo_unitario_neto', header: 'Costo unitario neto', format: 'currency', width: 18 },
  { key: 'condicion_pago', header: 'Condición', width: 12 },
  { key: 'fecha_vencimiento', header: 'Vencimiento', format: 'date', width: 12 },
  { key: 'total_antes_ajustes', header: 'Total compra antes ajustes', format: 'currency', width: 22 },
  { key: 'descuento_total_compra', header: 'Descuento compra', format: 'currency', width: 18 },
  { key: 'descuento_motivo', header: 'Motivo descuento', width: 28 },
  { key: 'ajuste_total_compra', header: 'Ajuste compra', format: 'currency', width: 16 },
  { key: 'total_compra', header: 'Total final compra', format: 'currency', width: 17 },
  { key: 'saldo_pendiente', header: 'Saldo compra', format: 'currency', width: 15 },
  { key: 'status', header: 'Estado', width: 12 },
];

const totalPagadoCompra = (compra: any) =>
  (compra.pago_compras ?? []).reduce((sum: number, pago: any) => sum + (Number(pago.monto) || 0), 0);

const compraToExport = (compra: any) => {
  const totalAntesAjustes = Number(compra.subtotal ?? 0) + Number(compra.iva_total ?? 0);
  return {
    folio: compra.folio ?? '',
    numero_factura: compra.numero_factura ?? '',
    proveedor: compra.proveedores?.nombre ?? '',
    proveedor_rfc: compra.proveedores?.rfc ?? '',
    almacen: compra.almacenes?.nombre ?? '',
    fecha: compra.fecha,
    fecha_vencimiento: compra.fecha_vencimiento,
    condicion_pago: compra.condicion_pago === 'credito' ? 'Crédito' : 'Contado',
    dias_credito: compra.dias_credito ?? 0,
    subtotal: Number(compra.subtotal) || 0,
    iva_total: Number(compra.iva_total) || 0,
    total_antes_ajustes: totalAntesAjustes,
    descuento_capturado: Number(compra.descuento_extra) || 0,
    descuento_tipo: compra.descuento_extra_tipo === 'porcentaje' ? 'Porcentaje' : 'Monto',
    descuento_total: Number(compra.descuento_total) || 0,
    descuento_motivo: compra.descuento_extra_motivo ?? '',
    ajuste_total: Number(compra.ajuste_total) || 0,
    total: Number(compra.total) || 0,
    total_pagado: totalPagadoCompra(compra),
    saldo_pendiente: Number(compra.saldo_pendiente) || 0,
    status: STATUS_MAP[compra.status]?.label ?? compra.status,
    notas: compra.notas ?? '',
    notas_pago: compra.notas_pago ?? '',
  };
};

const PAGE_SIZE = 80;

const STATIC_FILTER_OPTIONS = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'borrador', label: 'Borrador' },
      { value: 'confirmada', label: 'Confirmada' },
      { value: 'recibida', label: 'Recibida' },
      { value: 'pagada', label: 'Pagada' },
      { value: 'cancelada', label: 'Cancelada' },
    ],
  },
  {
    key: 'condicion_pago',
    label: 'Condición',
    options: [
      { value: 'contado', label: 'Contado' },
      { value: 'credito', label: 'Crédito' },
    ],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'proveedor', label: 'Proveedor' },
  { value: 'condicion_pago', label: 'Condición de pago' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
  { value: 'fecha_anio', label: 'Año' },
  { value: 'fecha_mes', label: 'Mes' },
];

const DETALLE_GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'proveedor', label: 'Proveedor' },
  { value: 'producto', label: 'Producto' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
];

function useCompras(search: string, statusFilter: string[], empresaId?: string) {
  return useQuery({
    queryKey: ['compras', search, statusFilter, empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      let q = supabase
        .from('compras')
        .select('*, proveedores(nombre, rfc), almacenes(nombre), pago_compras(monto), compra_lineas(cantidad, factor_conversion, piezas_loteadas, productos(maneja_lote))')
        .eq('empresa_id', empresaId!)
        .order('fecha', { ascending: false });
      if (statusFilter && statusFilter.length > 0) q = q.in('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((c: any) =>
          (c.folio ?? '').toLowerCase().includes(s) ||
          (c.numero_factura ?? '').toLowerCase().includes(s) ||
          ((c.proveedores as any)?.nombre ?? '').toLowerCase().includes(s)
        );
      }
      return filtered;
    },
  });
}

function LoteadoChip({ compra }: { compra: any }) {
  const lineas = (compra.compra_lineas ?? []).filter((l: any) => l.productos?.maneja_lote);
  if (!lineas.length) return <span className="text-xxs text-muted-foreground">—</span>;
  const total = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0) * (Number(l.factor_conversion) || 1), 0);
  const loteado = lineas.reduce((s: number, l: any) => s + (Number(l.piezas_loteadas) || 0), 0);
  const pct = total > 0 ? Math.round((loteado / total) * 100) : 0;
  return (
    <span className={cn("text-xxs font-semibold px-2 py-0.5 rounded-full tabular-nums",
      pct >= 100 ? "bg-success/10 text-success" : pct > 0 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
      {pct >= 100 ? '100% loteado' : `${pct}%`}
    </span>
  );
}

export default function ComprasPage() {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  useRealtimeInvalidate({
    table: 'compras',
    empresaId: empresa?.id,
    queryKeys: [['compras']],
  });
  const [viewMode, setViewMode] = useState<'compras' | 'detalle'>('compras');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const qc = useQueryClient();
  const { filters, groupBy, groupByLevels, dateFrom: desde, dateTo: hasta, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters, setDates } = useListPreferences('compras');
  const setDesde = (val: string) => setDates(val, hasta);
  const setHasta = (val: string) => setDates(desde, val);

  // Detalle state
  const [searchD, setSearchD] = useState('');
  const [pageD, setPageD] = useState(1);
  const { filters: filtersD, groupBy: groupByD, groupByLevels: groupByLevelsD, dateFrom: desdeD, dateTo: hastaD, setFilter: setFilterD, toggleFilterValue: toggleFilterValueD, setGroupBy: setGroupByD, setGroupByLevel: setGroupByLevelD, clearFilters: clearFiltersD, setDates: setDatesD } = useListPreferences('compras-detalle');
  const setDesdeD = (val: string) => setDatesD(val, hastaD);
  const setHastaD = (val: string) => setDatesD(desdeD, val);

  const statusFilter = filters.status ?? [];
  const { data: compras, isLoading } = useCompras(search, statusFilter, empresa?.id);

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Detalle query
  const { data: lineasRaw, isLoading: isLoadingLineas } = useQuery({
    queryKey: ['compra-lineas-all', empresa?.id],
    enabled: !!empresa?.id && viewMode === 'detalle',
    queryFn: async () => {
      const data = await fetchAllPages<any>((from, to) =>
        supabase
          .from('compra_lineas')
          .select('id, cantidad, cantidad_recibida, factor_conversion, piezas_total, precio_unitario, subtotal, total, producto_id, compra_id, productos(codigo, nombre, nombre_compra), compras!inner(folio, numero_factura, status, fecha, fecha_vencimiento, condicion_pago, dias_credito, subtotal, iva_total, descuento_extra, descuento_extra_tipo, descuento_extra_motivo, descuento_total, ajuste_total, total, saldo_pendiente, notas, proveedor_id, almacen_id, proveedores(nombre, rfc), almacenes(nombre))')
          .eq('compras.empresa_id', empresa!.id)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
      const porCompra = new Map<string, any[]>();
      for (const linea of data) {
        const grupo = porCompra.get(linea.compra_id) ?? [];
        grupo.push(linea);
        porCompra.set(linea.compra_id, grupo);
      }

      return Array.from(porCompra.values()).flatMap(grupo => {
        const compra = grupo[0]?.compras ?? {};
        return prorratearAjustesCompra(
          grupo.map((l: any) => ({ ...l, total: Number(l.total ?? l.subtotal) || 0 })),
          Number(compra.descuento_total) || 0,
          Number(compra.ajuste_total) || 0,
        ).map((l: any) => {
          const cantidad = Number(l.cantidad) || 0;
          const factor = Number(l.factor_conversion) || 1;
          const piezas = Number(l.piezas_total) || cantidad * factor;
          const recibido = Number(l.cantidad_recibida) || 0;
          return {
            linea_id: l.id,
            compra_id: l.compra_id,
            numero_factura: compra.numero_factura ?? '',
            cantidad,
            factor_conversion: factor,
            piezas_total: piezas,
            cantidad_recibida: recibido,
            cantidad_pendiente: Math.max(0, piezas - recibido),
            precio_unitario: Number(l.precio_unitario) || 0,
            subtotal: Number(l.subtotal) || cantidad * (Number(l.precio_unitario) || 0),
            total_bruto_linea: Number(l.total) || 0,
            descuento_prorrateado: l.descuento_prorrateado,
            ajuste_prorrateado: l.ajuste_prorrateado,
            total_neto_linea: l.total_neto_linea,
            costo_unitario_neto: cantidad > 0 ? l.total_neto_linea / cantidad : 0,
            codigo: l.productos?.codigo ?? '',
            producto: getNombreCompra(l.productos),
            folio: compra.folio ?? l.compra_id?.slice(0, 8),
            status: compra.status ?? '',
            fecha: compra.fecha ?? '',
            fecha_vencimiento: compra.fecha_vencimiento ?? '',
            condicion_pago: compra.condicion_pago === 'credito' ? 'Crédito' : 'Contado',
            total_antes_ajustes: Number(compra.subtotal ?? 0) + Number(compra.iva_total ?? 0),
            descuento_total_compra: Number(compra.descuento_total) || 0,
            descuento_motivo: compra.descuento_extra_motivo ?? '',
            ajuste_total_compra: Number(compra.ajuste_total) || 0,
            total_compra: Number(compra.total) || 0,
            saldo_pendiente: Number(compra.saldo_pendiente) || 0,
            proveedor: compra.proveedores?.nombre ?? '—',
            proveedor_rfc: compra.proveedores?.rfc ?? '',
            almacen: compra.almacenes?.nombre ?? '',
          };
        });
      });
    },
  });

  // Build dynamic proveedor / almacen filter options from data
  const proveedorOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of compras ?? []) {
      const pid = (c as any).proveedor_id;
      const pname = (c as any).proveedores?.nombre;
      if (pid && pname) names.set(pid, pname);
    }
    return Array.from(names.entries()).map(([id, nombre]) => ({ value: id, label: nombre })).sort((a, b) => a.label.localeCompare(b.label));
  }, [compras]);

  const almacenOptions = useMemo(() => {
    return (almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre })).sort((a, b) => a.label.localeCompare(b.label));
  }, [almacenes]);

  const FILTER_OPTIONS = useMemo(() => [
    ...STATIC_FILTER_OPTIONS,
    { key: 'proveedor', label: 'Proveedor', options: proveedorOptions },
    { key: 'almacen', label: 'Almacén', options: almacenOptions },
  ], [proveedorOptions, almacenOptions]);

  // Apply client-side filters for condicion_pago, proveedor, almacen and date range
  const filteredCompras = useMemo(() => {
    let list = compras ?? [];
    const condF = filters.condicion_pago;
    if (condF && condF.length > 0) list = list.filter((c: any) => condF.includes(c.condicion_pago));
    const provF = filters.proveedor;
    if (provF && provF.length > 0) list = list.filter((c: any) => provF.includes(c.proveedor_id));
    const almF = filters.almacen;
    if (almF && almF.length > 0) list = list.filter((c: any) => almF.includes(c.almacen_id));
    if (desde) list = list.filter((c: any) => (c.fecha ?? '').slice(0, 10) >= desde);
    if (hasta) list = list.filter((c: any) => (c.fecha ?? '').slice(0, 10) <= hasta);
    return list;
  }, [compras, filters, desde, hasta]);

  const total = filteredCompras.length;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = filteredCompras.slice(from - 1, to);
  const allSelected = pageData.length > 0 && pageData.every((c: any) => selected.has(c.id));
  const toggleAll = () => allSelected ? setSelected(new Set()) : setSelected(new Set(pageData.map((c: any) => c.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleBulkExportCompras = () => {
    if (selected.size === 0) return;
    const sel: any[] = filteredCompras.filter((c: any) => selected.has(c.id));
    exportToExcel({
      fileName: `Compras-seleccion-${sel.length}`,
      title: `Compras seleccionadas (${sel.length})`,
      columns: COMPRAS_COLUMNS,
      data: sel.map(compraToExport),
      totals: { total: sel.reduce((s, c) => s + (c.total ?? 0), 0), saldo_pendiente: sel.reduce((s, c) => s + (c.saldo_pendiente ?? 0), 0) },
    });
    toast.success(`${sel.length} compras exportadas`);
  };

  const handleBulkDeleteCompras = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from('compras').delete().in('id', ids);
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['compras'] });
    setSelected(new Set());
    toast.success(`${ids.length} compra${ids.length !== 1 ? 's' : ''} eliminada${ids.length !== 1 ? 's' : ''}`);
  };


  const totalCompras = filteredCompras.reduce((s, c) => s + ((c as any).total ?? 0), 0);
  const totalSaldo = filteredCompras.reduce((s, c) => s + ((c as any).saldo_pendiente ?? 0), 0);

  const exportData = filteredCompras.map(compraToExport);

  // ─── DETALLE filtering ───────────────────────────────────
  const filteredLineas = useMemo(() => {
    let list = lineasRaw ?? [];
    const statusArr = filtersD.status;
    if (statusArr && statusArr.length > 0) list = list.filter(l => statusArr.includes(l.status));
    if (searchD) {
      const s = searchD.toLowerCase();
      list = list.filter(l =>
        l.folio.toLowerCase().includes(s) ||
        l.numero_factura.toLowerCase().includes(s) ||
        l.producto.toLowerCase().includes(s) ||
        l.codigo.toLowerCase().includes(s) ||
        l.proveedor.toLowerCase().includes(s)
      );
    }
    if (desdeD) list = list.filter(l => (l.fecha ?? '').slice(0, 10) >= desdeD);
    if (hastaD) list = list.filter(l => (l.fecha ?? '').slice(0, 10) <= hastaD);
    return list;
  }, [lineasRaw, searchD, filtersD.status, desdeD, hastaD]);

  const totalD = filteredLineas.length;
  const fromD = Math.min((pageD - 1) * PAGE_SIZE + 1, totalD);
  const toD = Math.min(pageD * PAGE_SIZE, totalD);
  const pageDataD = filteredLineas.slice(fromD - 1, toD);
  const totalCantidadD = filteredLineas.reduce((s, l) => s + (l.cantidad ?? 0), 0);
  const totalSubtotalD = filteredLineas.reduce((s, l) => s + (l.total_neto_linea ?? 0), 0);

  const exportLineas = filteredLineas.map(l => ({
    ...l,
    status: STATUS_MAP[l.status]?.label ?? l.status,
  }));

  const groups = useMemo(() => groupData(pageData, groupBy, (item: any, key) => {
    if (key === 'status') return STATUS_MAP[item.status]?.label ?? item.status;
    if (key === 'proveedor') return item.proveedores?.nombre ?? 'Sin proveedor';
    if (key === 'condicion_pago') return item.condicion_pago === 'credito' ? 'Crédito' : 'Contado';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  }, groupByLevels), [pageData, groupBy, groupByLevels]);

  const groupsD = useMemo(() => groupData(pageDataD, groupByD, (item: any, key) => {
    if (key === 'status') return STATUS_MAP[item.status]?.label ?? item.status;
    if (key === 'proveedor') return item.proveedor;
    if (key === 'producto') return item.producto;
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  }, groupByLevelsD), [pageDataD, groupByD, groupByLevelsD]);

  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-table-border">
            <th className="th-odoo w-8 text-center" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
            </th>
            <th className="th-odoo text-left">Folio</th>
            <th className="th-odoo text-left">Proveedor</th>
            <th className="th-odoo text-left hidden md:table-cell">Almacén</th>
            <th className="th-odoo text-left">Fecha</th>
            <th className="th-odoo text-left hidden lg:table-cell">Factura</th>
            <th className="th-odoo text-left hidden lg:table-cell">Vence</th>
            <th className="th-odoo text-center hidden sm:table-cell">Condición</th>
            <th className="th-odoo text-right">Total</th>
            <th className="th-odoo text-right hidden sm:table-cell">Saldo</th>
            <th className="th-odoo text-center hidden md:table-cell">Loteado</th>
            <th className="th-odoo text-center">Estado</th>
            <th className="th-odoo w-8" />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={13} className="text-center py-12 text-muted-foreground text-sm">No hay compras.</td></tr>
          )}
          {items.map((c: any) => {
            const isExpanded = expandedId === c.id;
            return (
              <>
                <tr
                  key={c.id}
                  className={cn(
                    "border-b border-table-border cursor-pointer transition-colors",
                    isExpanded ? "bg-primary/5" : selected.has(c.id) ? "bg-primary/5" : "hover:bg-table-hover"
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <td className="py-1.5 px-3 text-center w-8" onClick={e => { e.stopPropagation(); toggleOne(c.id); }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="rounded border-input" />
                  </td>
                  <td className="py-1.5 px-3 font-mono text-xs">{c.folio ?? c.id.slice(0, 8)}</td>
                  <td className="py-1.5 px-3 font-medium">{c.proveedores?.nombre ?? '—'}</td>
                  <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">{c.almacenes?.nombre ?? '—'}</td>
                  <td className="py-1.5 px-3">{fmtDate(c.fecha)}</td>
                  <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{c.numero_factura || '—'}</td>
                  <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{c.fecha_vencimiento ? fmtDate(c.fecha_vencimiento) : '—'}</td>
                  <td className="py-1.5 px-3 hidden sm:table-cell text-center">
                    <span className={cn(
                      "text-xxs font-medium px-2 py-0.5 rounded-full",
                      c.condicion_pago === 'credito' ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                    )}>
                      {c.condicion_pago === 'credito' ? 'Crédito' : 'Contado'}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right font-medium">{fmt(c.total ?? 0)}</td>
                  <td className="py-1.5 px-3 text-right hidden sm:table-cell">
                    {(c.saldo_pendiente ?? 0) > 0 ? (
                      <span className="text-destructive font-medium">{fmt(c.saldo_pendiente)}</span>
                    ) : (
                      <span className="text-muted-foreground">{fmt(0)}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-center hidden md:table-cell"><LoteadoChip compra={c} /></td>
                  <td className="py-1.5 px-3 text-center">
                    <StatusChip status={c.status} />
                  </td>
                  <td className="py-1.5 px-2 text-center w-8">
                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </td>
                </tr>
                {isExpanded && (
                  <CompraExpandedRow
                    key={`exp-${c.id}`}
                    compra={c}
                    colSpan={13}
                    fmt={fmt}
                    onCollapse={() => setExpandedId(null)}
                  />
                )}
              </>
            );
          })}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={8} className="py-2 px-3 text-muted-foreground">{items.length} compras</td>
              <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(items.reduce((s: number, c: any) => s + (c.total ?? 0), 0))}</td>
              <td className="py-2 px-3 text-right hidden sm:table-cell tabular-nums text-destructive font-bold">{fmt(items.reduce((s: number, c: any) => s + (c.saldo_pendiente ?? 0), 0))}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  const renderDetalleTable = (items: any[]) => (
    <div className={cn(!groupByD && "bg-card border border-border rounded overflow-x-auto")}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-table-border text-left">
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Factura</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Proveedor</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Producto</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Cantidad</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">P. Unit.</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total neto</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">No hay líneas de detalle.</td></tr>
          )}
          {items.map((l: any, i: number) => (
            <tr
              key={`${l.compra_id}-${l.linea_id}-${i}`}
              className="border-b border-table-border cursor-pointer transition-colors hover:bg-table-hover"
              onClick={() => navigate(`/almacen/compras/${l.compra_id}`)}
            >
              <td className="py-2 px-3 font-mono text-xs font-medium">{l.folio}</td>
              <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.numero_factura || '—'}</td>
              <td className="py-2 px-3">{l.proveedor}</td>
              <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(l.fecha)}</td>
              <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.codigo}</td>
              <td className="py-2 px-3 font-medium">{l.producto}</td>
              <td className="py-2 px-3 text-right font-bold">{fmtNum(l.cantidad)}</td>
              <td className="py-2 px-3 text-right hidden md:table-cell">{fmt(l.precio_unitario)}</td>
              <td className="py-2 px-3 text-right">{fmt(l.total_neto_linea)}</td>
              <td className="py-2 px-3 text-center"><StatusChip status={l.status} /></td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={6} className="py-2 px-3 text-muted-foreground">{items.length} líneas</td>
              <td className="py-2 px-3 text-right font-bold">{fmtNum(items.reduce((s: number, l: any) => s + (l.cantidad ?? 0), 0))}</td>
              <td className="py-2 px-3 text-right hidden md:table-cell">—</td>
              <td className="py-2 px-3 text-right font-bold">{fmt(items.reduce((s: number, l: any) => s + (l.total_neto_linea ?? 0), 0))}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div className="p-3 sm:p-4 space-y-3 min-h-full max-w-full overflow-x-hidden">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Compras <HelpButton title={HELP.compras.title} sections={HELP.compras.sections} /> <VideoHelpButton module="compras" /></h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-card border border-border rounded-lg p-2.5 sm:p-4 min-w-0">
          <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase truncate">Total compras</p>
          <p className="text-base sm:text-2xl font-bold text-foreground truncate">{fmt(totalCompras)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-2.5 sm:p-4 min-w-0">
          <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase truncate">Saldo por pagar</p>
          <p className="text-base sm:text-2xl font-bold text-destructive truncate">{fmt(totalSaldo)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-2.5 sm:p-4 min-w-0">
          <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase truncate">Registros</p>
          <p className="text-base sm:text-2xl font-bold text-foreground truncate">{total}</p>
        </div>
      </div>


      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setViewMode('compras')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
            viewMode === 'compras' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-3.5 w-3.5" /> Por factura
        </button>
        <button
          onClick={() => setViewMode('detalle')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
            viewMode === 'detalle' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Package className="h-3.5 w-3.5" /> Por producto
        </button>
      </div>

      {/* ─── COMPRAS VIEW ─── */}
      {viewMode === 'compras' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <OdooFilterBar
              search={search}
              onSearchChange={val => { setSearch(val); setPage(1); }}
              placeholder="Buscar por folio, factura o proveedor..."
              filterOptions={FILTER_OPTIONS}
              activeFilters={filters}
              onToggleFilter={(key, val) => { toggleFilterValue(key, val); setPage(1); }}
              onSetFilter={(key, vals) => { setFilter(key, vals); setPage(1); }}
              onClearFilters={() => { clearFilters(); setDesde(''); setHasta(''); setPage(1); }}
              groupByOptions={GROUP_BY_OPTIONS}
              activeGroupBy={groupBy}
              onGroupByChange={setGroupBy}
              activeGroupByLevels={groupByLevels}
              onGroupByLevelChange={setGroupByLevel}
              dateFrom={desde}
              dateTo={hasta}
              onDateRangeChange={(f, t) => { setDates(f, t); setPage(1); }}
              onDateFromChange={val => { setDesde(val); setPage(1); }}
              onDateToChange={val => { setHasta(val); setPage(1); }}
            />
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:shrink-0">
              <ExportButton
                onExcel={() => exportToExcel({
                  fileName: 'Compras', title: 'Reporte de Compras',
                  columns: COMPRAS_COLUMNS, data: exportData,
                  totals: { total: totalCompras, saldo_pendiente: totalSaldo },
                })}
                onPDF={() => exportToPDF({
                  fileName: 'Compras', title: 'Reporte de Compras',
                  columns: COMPRAS_COLUMNS, data: exportData,
                  totals: { total: totalCompras, saldo_pendiente: totalSaldo },
                })}
              />
              <button onClick={() => navigate('/almacen/compras/sugeridas')} className="btn-odoo-secondary">
                Sugeridas
              </button>
              <button onClick={() => navigate('/almacen/compras/nueva')} className="btn-odoo-primary">
                <Plus className="h-3.5 w-3.5" /> Nueva compra
              </button>
            </div>
          </div>


          {isLoading ? (
            <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={8} /></div>
          ) : (
            <>
              <GroupedTableWrapper
                groupBy={groupBy}
                groups={groups}
                renderTable={renderTable}
                renderSummary={(items) => (
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {fmt(items.reduce((s: number, c: any) => s + (c.total ?? 0), 0))}
                  </span>
                )}
              />
              {!groupBy && total > 0 && (
                <OdooPagination from={from} to={to} total={total}
                  onPrev={() => setPage(p => Math.max(1, p - 1))}
                  onNext={() => setPage(p => p + 1)}
                />
              )}
            </>
          )}
        </>
      )}

      {/* ─── DETALLE VIEW ─── */}
      {viewMode === 'detalle' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <OdooFilterBar
              search={searchD}
              onSearchChange={val => { setSearchD(val); setPageD(1); }}
              placeholder="Buscar por folio, factura, producto o proveedor..."
              filterOptions={STATIC_FILTER_OPTIONS}
              activeFilters={filtersD}
              onToggleFilter={(key, val) => { toggleFilterValueD(key, val); setPageD(1); }}
              onSetFilter={(key, vals) => { setFilterD(key, vals); setPageD(1); }}
              onClearFilters={() => { clearFiltersD(); setPageD(1); }}
              groupByOptions={DETALLE_GROUP_BY_OPTIONS}
              activeGroupBy={groupByD}
              onGroupByChange={setGroupByD}
              activeGroupByLevels={groupByLevelsD}
              onGroupByLevelChange={setGroupByLevelD}
              dateFrom={desdeD}
              dateTo={hastaD}
              onDateRangeChange={(f, t) => setDatesD(f, t)}
              onDateFromChange={setDesdeD}
              onDateToChange={setHastaD}
            />
            <div className="flex items-center gap-2 shrink-0">
              <ExportButton
                onExcel={() => exportToExcel({ fileName: 'Compras_por_producto', title: 'Compras por producto', columns: DETALLE_COLUMNS, data: exportLineas, totals: { cantidad: totalCantidadD, total_neto_linea: totalSubtotalD } })}
                onPDF={() => exportToPDF({ fileName: 'Compras_por_producto', title: 'Compras por producto', columns: DETALLE_COLUMNS, data: exportLineas, totals: { cantidad: totalCantidadD, total_neto_linea: totalSubtotalD } })}
              />
            </div>
          </div>

          {!isLoadingLineas && totalD > 0 && (
            <div className="flex items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2 flex-wrap">
              <span><strong className="text-foreground">{totalD}</strong> líneas</span>
              <span>Total unidades: <strong className="text-foreground">{fmtNum(totalCantidadD)}</strong></span>
              <span>Total importe: <strong className="text-foreground">{fmt(totalSubtotalD)}</strong></span>
            </div>
          )}


          {isLoadingLineas ? (
            <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={9} /></div>
          ) : (
            <>
              <GroupedTableWrapper groupBy={groupByD} groups={groupsD} renderTable={renderDetalleTable} />
              {!groupByD && totalD > 0 && (
                <OdooPagination from={fromD} to={toD} total={totalD}
                  onPrev={() => setPageD(p => Math.max(1, p - 1))}
                  onNext={() => setPageD(p => p + 1)}
                />
              )}
            </>
          )}
        </>
      )}


      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected.size} compra{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={bulkDeleting} onClick={(e) => { e.preventDefault(); handleBulkDeleteCompras(); }}>
              {bulkDeleting ? 'Eliminando...' : `Eliminar ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkActionsBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        noun="compra"
        actions={[
          { label: 'Exportar', icon: FileSpreadsheet, onClick: handleBulkExportCompras },
          { label: 'Eliminar', icon: Trash2, variant: 'destructive', onClick: () => setBulkDeleteOpen(true) },
        ]}
      />
    </div>
  );
}
