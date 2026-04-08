import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus, List, Package } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { cn, fmtDate, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  borrador: { label: 'Borrador', variant: 'borrador' },
  confirmada: { label: 'Confirmada', variant: 'confirmado' },
  recibida: { label: 'Recibida', variant: 'entregado' },
  pagada: { label: 'Pagada', variant: 'facturado' },
  cancelada: { label: 'Cancelada', variant: 'cancelado' },
};

const COMPRAS_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'proveedor', header: 'Proveedor', width: 25 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'condicion_pago', header: 'Condición', width: 12 },
  { key: 'subtotal', header: 'Subtotal', format: 'currency', width: 14 },
  { key: 'iva_total', header: 'IVA', format: 'currency', width: 12 },
  { key: 'total', header: 'Total', format: 'currency', width: 14 },
  { key: 'saldo_pendiente', header: 'Saldo', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
];

const DETALLE_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'proveedor', header: 'Proveedor', width: 25 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'codigo', header: 'Código', width: 14 },
  { key: 'producto', header: 'Producto', width: 25 },
  { key: 'cantidad', header: 'Cantidad', format: 'number', width: 12 },
  { key: 'precio_unitario', header: 'P. Unit.', format: 'currency', width: 14 },
  { key: 'subtotal', header: 'Subtotal', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
];

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

function useCompras(search: string, statusFilter: string, empresaId?: string) {
  return useQuery({
    queryKey: ['compras', search, statusFilter, empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      let q = supabase
        .from('compras')
        .select('*, proveedores(nombre), almacenes(nombre)')
        .eq('empresa_id', empresaId!)
        .order('fecha', { ascending: false });
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((c: any) =>
          (c.folio ?? '').toLowerCase().includes(s) ||
          ((c.proveedores as any)?.nombre ?? '').toLowerCase().includes(s)
        );
      }
      return filtered;
    },
  });
}

export default function ComprasPage() {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const [viewMode, setViewMode] = useState<'compras' | 'detalle'>('compras');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('compras');

  // Detalle state
  const [searchD, setSearchD] = useState('');
  const [pageD, setPageD] = useState(1);
  const { filters: filtersD, groupBy: groupByD, groupByLevels: groupByLevelsD, setFilter: setFilterD, toggleFilterValue: toggleFilterValueD, setGroupBy: setGroupByD, setGroupByLevel: setGroupByLevelD, clearFilters: clearFiltersD } = useListPreferences('compras-detalle');
  const [desdeD, setDesdeD] = useState('');
  const [hastaD, setHastaD] = useState('');

  const statusFilter = filters.status?.length ? filters.status.join(',') : 'todos';
  const { data: compras, isLoading } = useCompras(search, statusFilter, empresa?.id);

  // Detalle query
  const { data: lineasRaw, isLoading: isLoadingLineas } = useQuery({
    queryKey: ['compra-lineas-all', empresa?.id],
    enabled: !!empresa?.id && viewMode === 'detalle',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compra_lineas')
        .select('id, cantidad, precio_unitario, subtotal, total, producto_id, compra_id, productos(codigo, nombre), compras!inner(folio, status, fecha, proveedor_id, proveedores(nombre))')
        .eq('compras.empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        linea_id: l.id,
        compra_id: l.compra_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        subtotal: l.subtotal ?? l.cantidad * l.precio_unitario,
        codigo: l.productos?.codigo ?? '',
        producto: l.productos?.nombre ?? '',
        folio: l.compras?.folio ?? l.compra_id?.slice(0, 8),
        status: l.compras?.status ?? '',
        fecha: l.compras?.fecha ?? '',
        proveedor: l.compras?.proveedores?.nombre ?? '—',
      }));
    },
  });

  // Build dynamic proveedor filter options from data
  const proveedorOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of compras ?? []) {
      const pid = (c as any).proveedor_id;
      const pname = (c as any).proveedores?.nombre;
      if (pid && pname) names.set(pid, pname);
    }
    return Array.from(names.entries()).map(([id, nombre]) => ({ value: id, label: nombre })).sort((a, b) => a.label.localeCompare(b.label));
  }, [compras]);

  const FILTER_OPTIONS = useMemo(() => [
    ...STATIC_FILTER_OPTIONS,
    { key: 'proveedor', label: 'Proveedor', options: proveedorOptions },
  ], [proveedorOptions]);

  // Apply client-side filters for condicion_pago and proveedor
  const filteredCompras = useMemo(() => {
    let list = compras ?? [];
    const condF = filters.condicion_pago;
    if (condF && condF.length > 0) list = list.filter((c: any) => condF.includes(c.condicion_pago));
    const provF = filters.proveedor;
    if (provF && provF.length > 0) list = list.filter((c: any) => provF.includes(c.proveedor_id));
    return list;
  }, [compras, filters]);

  const total = filteredCompras.length;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = filteredCompras.slice(from - 1, to);

  const totalCompras = filteredCompras.reduce((s, c) => s + ((c as any).total ?? 0), 0);
  const totalSaldo = filteredCompras.reduce((s, c) => s + ((c as any).saldo_pendiente ?? 0), 0);

  const exportData = filteredCompras.map((c: any) => ({
    folio: c.folio ?? '',
    proveedor: c.proveedores?.nombre ?? '',
    fecha: c.fecha,
    condicion_pago: c.condicion_pago === 'credito' ? 'Crédito' : 'Contado',
    subtotal: c.subtotal ?? 0,
    iva_total: c.iva_total ?? 0,
    total: c.total ?? 0,
    saldo_pendiente: c.saldo_pendiente ?? 0,
    status: STATUS_MAP[c.status]?.label ?? c.status,
  }));

  // ─── DETALLE filtering ───────────────────────────────────
  const filteredLineas = useMemo(() => {
    let list = lineasRaw ?? [];
    const statusArr = filtersD.status;
    if (statusArr && statusArr.length > 0) list = list.filter(l => statusArr.includes(l.status));
    if (searchD) {
      const s = searchD.toLowerCase();
      list = list.filter(l =>
        l.folio.toLowerCase().includes(s) ||
        l.producto.toLowerCase().includes(s) ||
        l.codigo.toLowerCase().includes(s) ||
        l.proveedor.toLowerCase().includes(s)
      );
    }
    if (desdeD) list = list.filter(l => (l.fecha ?? '') >= desdeD);
    if (hastaD) list = list.filter(l => (l.fecha ?? '') <= hastaD);
    return list;
  }, [lineasRaw, searchD, filtersD.status, desdeD, hastaD]);

  const totalD = filteredLineas.length;
  const fromD = Math.min((pageD - 1) * PAGE_SIZE + 1, totalD);
  const toD = Math.min(pageD * PAGE_SIZE, totalD);
  const pageDataD = filteredLineas.slice(fromD - 1, toD);
  const totalCantidadD = filteredLineas.reduce((s, l) => s + (l.cantidad ?? 0), 0);
  const totalSubtotalD = filteredLineas.reduce((s, l) => s + (l.subtotal ?? 0), 0);

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
            <th className="th-odoo text-left">Folio</th>
            <th className="th-odoo text-left">Proveedor</th>
            <th className="th-odoo text-left hidden md:table-cell">Almacén</th>
            <th className="th-odoo text-left">Fecha</th>
            <th className="th-odoo text-center hidden sm:table-cell">Condición</th>
            <th className="th-odoo text-right">Total</th>
            <th className="th-odoo text-right hidden sm:table-cell">Saldo</th>
            <th className="th-odoo text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No hay compras.</td></tr>
          )}
          {items.map((c: any) => (
            <tr
              key={c.id}
              className="border-b border-table-border cursor-pointer hover:bg-table-hover transition-colors"
              onClick={() => navigate(`/almacen/compras/${c.id}`)}
            >
              <td className="py-1.5 px-3 font-mono text-xs">{c.folio ?? c.id.slice(0, 8)}</td>
              <td className="py-1.5 px-3 font-medium">{c.proveedores?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">{c.almacenes?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3">{fmtDate(c.fecha)}</td>
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
              <td className="py-1.5 px-3 text-center">
                <StatusChip status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={5} className="py-2 px-3 text-muted-foreground">{items.length} compras</td>
              <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(items.reduce((s: number, c: any) => s + (c.total ?? 0), 0))}</td>
              <td className="py-2 px-3 text-right hidden sm:table-cell tabular-nums text-destructive font-bold">{fmt(items.reduce((s: number, c: any) => s + (c.saldo_pendiente ?? 0), 0))}</td>
              <td />
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
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Proveedor</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Producto</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Cantidad</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">P. Unit.</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Subtotal</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No hay líneas de detalle.</td></tr>
          )}
          {items.map((l: any, i: number) => (
            <tr
              key={`${l.compra_id}-${l.linea_id}-${i}`}
              className="border-b border-table-border cursor-pointer transition-colors hover:bg-table-hover"
              onClick={() => navigate(`/almacen/compras/${l.compra_id}`)}
            >
              <td className="py-2 px-3 font-mono text-xs font-medium">{l.folio}</td>
              <td className="py-2 px-3">{l.proveedor}</td>
              <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(l.fecha)}</td>
              <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.codigo}</td>
              <td className="py-2 px-3 font-medium">{l.producto}</td>
              <td className="py-2 px-3 text-right font-bold">{fmtNum(l.cantidad)}</td>
              <td className="py-2 px-3 text-right hidden md:table-cell">{fmt(l.precio_unitario)}</td>
              <td className="py-2 px-3 text-right">{fmt(l.subtotal)}</td>
              <td className="py-2 px-3 text-center"><StatusChip status={l.status} /></td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={5} className="py-2 px-3 text-muted-foreground">{items.length} líneas</td>
              <td className="py-2 px-3 text-right font-bold">{fmtNum(items.reduce((s: number, l: any) => s + (l.cantidad ?? 0), 0))}</td>
              <td className="py-2 px-3 text-right hidden md:table-cell">—</td>
              <td className="py-2 px-3 text-right font-bold">{fmt(items.reduce((s: number, l: any) => s + (l.subtotal ?? 0), 0))}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Compras <HelpButton title={HELP.compras.title} sections={HELP.compras.sections} /> <VideoHelpButton module="compras" /></h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total compras</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalCompras)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo por pagar</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalSaldo)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Registros</p>
          <p className="text-2xl font-bold text-foreground">{total}</p>
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
          <List className="h-3.5 w-3.5" /> Compras
        </button>
        <button
          onClick={() => setViewMode('detalle')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
            viewMode === 'detalle' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Package className="h-3.5 w-3.5" /> Detalle productos
        </button>
      </div>

      {/* ─── COMPRAS VIEW ─── */}
      {viewMode === 'compras' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <OdooFilterBar
              search={search}
              onSearchChange={val => { setSearch(val); setPage(1); }}
              placeholder="Buscar por folio o proveedor..."
              filterOptions={FILTER_OPTIONS}
              activeFilters={filters}
              onToggleFilter={(key, val) => { toggleFilterValue(key, val); setPage(1); }}
              onSetFilter={(key, vals) => { setFilter(key, vals); setPage(1); }}
              onClearFilters={() => { clearFilters(); setPage(1); }}
              groupByOptions={GROUP_BY_OPTIONS}
              activeGroupBy={groupBy}
              onGroupByChange={setGroupBy}
              activeGroupByLevels={groupByLevels}
              onGroupByLevelChange={setGroupByLevel}
            />
            <div className="flex items-center gap-2 shrink-0">
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
              <button onClick={() => navigate('/almacen/compras/nueva')} className="btn-odoo-primary shrink-0">
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
              placeholder="Buscar por folio, producto o proveedor..."
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
              onDateFromChange={setDesdeD}
              onDateToChange={setHastaD}
            />
            <div className="flex items-center gap-2 shrink-0">
              <ExportButton
                onExcel={() => exportToExcel({ fileName: 'Compras_Detalle', title: 'Detalle de Compras', columns: DETALLE_COLUMNS, data: exportLineas, totals: { cantidad: totalCantidadD, subtotal: totalSubtotalD } })}
                onPDF={() => exportToPDF({ fileName: 'Compras_Detalle', title: 'Detalle de Compras', columns: DETALLE_COLUMNS, data: exportLineas, totals: { cantidad: totalCantidadD, subtotal: totalSubtotalD } })}
              />
            </div>
          </div>

          {!isLoadingLineas && totalD > 0 && (
            <div className="flex items-center gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
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
    </div>
  );
}
