import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Plus, List, Package } from 'lucide-react';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { StatusChip } from '@/components/StatusChip';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { fmtDate, fmtNum, cn } from '@/lib/utils';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';

const TIPO_LABELS: Record<string, string> = {
  almacen_almacen: 'Almacén → Almacén',
  almacen_ruta: 'Almacén → Ruta',
  ruta_almacen: 'Ruta → Almacén',
};

const PAGE_SIZE = 80;

const FILTER_OPTIONS = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'borrador', label: 'Borrador' },
      { value: 'confirmado', label: 'Confirmado' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { value: 'almacen_almacen', label: 'Almacén → Almacén' },
      { value: 'almacen_ruta', label: 'Almacén → Ruta' },
      { value: 'ruta_almacen', label: 'Ruta → Almacén' },
    ],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
  { value: 'fecha_anio', label: 'Año' },
  { value: 'fecha_mes', label: 'Mes' },
];

const TRASPASOS_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 14 },
  { key: 'tipo', header: 'Tipo', width: 20 },
  { key: 'origen', header: 'Origen', width: 20 },
  { key: 'destino', header: 'Destino', width: 20 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'status', header: 'Estado', width: 12 },
];

const DETALLE_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 14 },
  { key: 'tipo', header: 'Tipo', width: 20 },
  { key: 'origen', header: 'Origen', width: 20 },
  { key: 'destino', header: 'Destino', width: 20 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'codigo', header: 'Código', width: 14 },
  { key: 'producto', header: 'Producto', width: 25 },
  { key: 'cantidad', header: 'Cantidad', format: 'number', width: 12 },
  { key: 'status', header: 'Estado', width: 12 },
];

const DETALLE_GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'origen', label: 'Origen' },
  { value: 'destino', label: 'Destino' },
  { value: 'producto', label: 'Producto' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
];

export default function TraspasosListPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const [viewMode, setViewMode] = useState<'traspasos' | 'detalle'>('traspasos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('traspasos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Detalle filter state
  const [searchD, setSearchD] = useState('');
  const [pageD, setPageD] = useState(1);
  const { filters: filtersD, groupBy: groupByD, groupByLevels: groupByLevelsD, setFilter: setFilterD, toggleFilterValue: toggleFilterValueD, setGroupBy: setGroupByD, setGroupByLevel: setGroupByLevelD, clearFilters: clearFiltersD } = useListPreferences('traspasos-detalle');
  const [desdeD, setDesdeD] = useState('');
  const [hastaD, setHastaD] = useState('');

  const { data: traspasos, isLoading } = useQuery({
    queryKey: ['traspasos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traspasos')
        .select('*, almacen_origen:almacenes!traspasos_almacen_origen_id_fkey(nombre), almacen_destino:almacenes!traspasos_almacen_destino_id_fkey(nombre), vendedor_origen:profiles!traspasos_vendedor_origen_id_profiles_fkey(nombre), vendedor_destino:profiles!traspasos_vendedor_destino_id_profiles_fkey(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Detalle: traspaso_lineas with traspaso + product info
  const { data: lineasRaw, isLoading: isLoadingLineas } = useQuery({
    queryKey: ['traspaso-lineas-all', empresa?.id],
    enabled: !!empresa?.id && viewMode === 'detalle',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traspaso_lineas')
        .select('id, cantidad, producto_id, traspaso_id, productos(codigo, nombre), traspasos!inner(folio, tipo, status, fecha, almacen_origen_id, almacen_destino_id, almacenes_origen:almacenes!traspasos_almacen_origen_id_fkey(nombre), almacenes_destino:almacenes!traspasos_almacen_destino_id_fkey(nombre))')
        .eq('traspasos.empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        linea_id: l.id,
        traspaso_id: l.traspaso_id,
        cantidad: l.cantidad,
        codigo: l.productos?.codigo ?? '',
        producto: l.productos?.nombre ?? '',
        folio: l.traspasos?.folio ?? l.traspaso_id?.slice(0, 8),
        tipo: l.traspasos?.tipo ?? '',
        status: l.traspasos?.status ?? '',
        fecha: l.traspasos?.fecha ?? '',
        origen: l.traspasos?.almacenes_origen?.nombre ?? '—',
        destino: l.traspasos?.almacenes_destino?.nombre ?? '—',
      }));
    },
  });

  // ─── TRASPASOS TAB ───────────────────────────────────────
  const getOrigenLabel = (t: any) => t.almacen_origen?.nombre || t.vendedor_origen?.nombre || '—';
  const getDestinoLabel = (t: any) => t.almacen_destino?.nombre || t.vendedor_destino?.nombre || '—';

  const filtered = useMemo(() => {
    let list = traspasos ?? [];
    const statusArr = filters.status;
    if (statusArr && statusArr.length > 0) list = list.filter((t: any) => statusArr.includes(t.status));
    const tipoArr = filters.tipo;
    if (tipoArr && tipoArr.length > 0) list = list.filter((t: any) => tipoArr.includes(t.tipo));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((t: any) =>
        (t.folio ?? '').toLowerCase().includes(s) ||
        getOrigenLabel(t).toLowerCase().includes(s) ||
        getDestinoLabel(t).toLowerCase().includes(s)
      );
    }
    if (desde) list = list.filter((t: any) => (t.fecha ?? '') >= desde);
    if (hasta) list = list.filter((t: any) => (t.fecha ?? '') <= hasta);
    return list;
  }, [traspasos, search, filters.status, filters.tipo, desde, hasta]);

  const total = filtered.length;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = filtered.slice(from - 1, to);
  const allSelected = pageData.length > 0 && pageData.every((t: any) => selected.has(t.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map((t: any) => t.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const groups = useMemo(() => groupData(pageData, groupBy, (item: any, key) => {
    if (key === 'status') return (item.status ?? '').charAt(0).toUpperCase() + (item.status ?? '').slice(1);
    if (key === 'tipo') return TIPO_LABELS[item.tipo] ?? item.tipo ?? 'Sin tipo';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  }, groupByLevels), [pageData, groupBy, groupByLevels]);

  // ─── DETALLE TAB ─────────────────────────────────────────
  const filteredLineas = useMemo(() => {
    let list = lineasRaw ?? [];
    const statusArr = filtersD.status;
    if (statusArr && statusArr.length > 0) list = list.filter(l => statusArr.includes(l.status));
    const tipoArr = filtersD.tipo;
    if (tipoArr && tipoArr.length > 0) list = list.filter(l => tipoArr.includes(l.tipo));
    if (searchD) {
      const s = searchD.toLowerCase();
      list = list.filter(l =>
        l.folio.toLowerCase().includes(s) ||
        l.producto.toLowerCase().includes(s) ||
        l.codigo.toLowerCase().includes(s) ||
        l.origen.toLowerCase().includes(s) ||
        l.destino.toLowerCase().includes(s)
      );
    }
    if (desdeD) list = list.filter(l => (l.fecha ?? '') >= desdeD);
    if (hastaD) list = list.filter(l => (l.fecha ?? '') <= hastaD);
    return list;
  }, [lineasRaw, searchD, filtersD.status, filtersD.tipo, desdeD, hastaD]);

  const totalD = filteredLineas.length;
  const fromD = Math.min((pageD - 1) * PAGE_SIZE + 1, totalD);
  const toD = Math.min(pageD * PAGE_SIZE, totalD);
  const pageDataD = filteredLineas.slice(fromD - 1, toD);
  const totalCantidad = filteredLineas.reduce((s, l) => s + (l.cantidad ?? 0), 0);

  const groupsD = useMemo(() => groupData(pageDataD, groupByD, (item: any, key) => {
    if (key === 'status') return (item.status ?? '').charAt(0).toUpperCase() + (item.status ?? '').slice(1);
    if (key === 'tipo') return TIPO_LABELS[item.tipo] ?? item.tipo ?? 'Sin tipo';
    if (key === 'origen') return item.origen;
    if (key === 'destino') return item.destino;
    if (key === 'producto') return item.producto;
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  }, groupByLevelsD), [pageDataD, groupByD, groupByLevelsD]);

  // ─── EXPORT DATA ─────────────────────────────────────────
  const exportTraspasos = filtered.map(t => ({
    folio: t.folio ?? '',
    tipo: TIPO_LABELS[t.tipo] ?? t.tipo,
    origen: getOrigenLabel(t),
    destino: getDestinoLabel(t),
    fecha: t.fecha,
    status: (t.status ?? '').charAt(0).toUpperCase() + (t.status ?? '').slice(1),
  }));

  const exportLineas = filteredLineas.map(l => ({
    folio: l.folio,
    tipo: TIPO_LABELS[l.tipo] ?? l.tipo,
    origen: l.origen,
    destino: l.destino,
    fecha: l.fecha,
    codigo: l.codigo,
    producto: l.producto,
    cantidad: l.cantidad,
    status: (l.status ?? '').charAt(0).toUpperCase() + (l.status ?? '').slice(1),
  }));

  // ─── RENDER TABLES ───────────────────────────────────────
  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-table-border text-left">
            <th className="py-2 px-3 w-10 text-center">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
            </th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Origen</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Destino</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Fecha</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-12 text-muted-foreground">
                No hay traspasos. Crea el primero.
              </td>
            </tr>
          )}
          {items.map((t: any) => (
            <tr
              key={t.id}
              className={cn(
                "border-b border-table-border cursor-pointer transition-colors",
                selected.has(t.id) ? "bg-primary/5" : "hover:bg-table-hover"
              )}
              onClick={() => navigate(`/almacen/traspasos/${t.id}`)}
            >
              <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(t.id); }}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} className="rounded border-input" />
              </td>
              <td className="py-2 px-3 font-mono text-xs font-medium">{t.folio || t.id.slice(0, 8)}</td>
              <td className="py-2 px-3">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {TIPO_LABELS[t.tipo] || t.tipo}
                </span>
              </td>
              <td className="py-2 px-3">{getOrigenLabel(t)}</td>
              <td className="py-2 px-3">{getDestinoLabel(t)}</td>
              <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{fmtDate(t.fecha)}</td>
              <td className="py-2 px-3 text-center">
                <StatusChip status={t.status} />
              </td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={7} className="py-2 px-3 text-muted-foreground">{items.length} traspasos</td>
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
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Origen</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Destino</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Producto</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Cantidad</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center py-12 text-muted-foreground">No hay líneas de detalle.</td>
            </tr>
          )}
          {items.map((l: any, i: number) => (
            <tr
              key={`${l.traspaso_id}-${l.linea_id}-${i}`}
              className="border-b border-table-border cursor-pointer transition-colors hover:bg-table-hover"
              onClick={() => navigate(`/almacen/traspasos/${l.traspaso_id}`)}
            >
              <td className="py-2 px-3 font-mono text-xs font-medium">{l.folio}</td>
              <td className="py-2 px-3">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {TIPO_LABELS[l.tipo] || l.tipo}
                </span>
              </td>
              <td className="py-2 px-3">{l.origen}</td>
              <td className="py-2 px-3">{l.destino}</td>
              <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(l.fecha)}</td>
              <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.codigo}</td>
              <td className="py-2 px-3 font-medium">{l.producto}</td>
              <td className="py-2 px-3 text-right font-bold">{fmtNum(l.cantidad)}</td>
              <td className="py-2 px-3 text-center"><StatusChip status={l.status} /></td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={7} className="py-2 px-3 text-muted-foreground">{items.length} líneas</td>
              <td className="py-2 px-3 text-right font-bold">{fmtNum(items.reduce((s: number, l: any) => s + (l.cantidad ?? 0), 0))}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Traspasos <HelpButton title={HELP.traspasos.title} sections={HELP.traspasos.sections} /> <VideoHelpButton module="traspasos" /></h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total traspasos</p>
          <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Confirmados</p>
          <p className="text-2xl font-bold text-success">{filtered.filter(t => t.status === 'confirmado').length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Borradores</p>
          <p className="text-2xl font-bold text-warning">{filtered.filter(t => t.status === 'borrador').length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setViewMode('traspasos')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
            viewMode === 'traspasos' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-3.5 w-3.5" /> Traspasos
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

      {/* ─── TRASPASOS VIEW ─── */}
      {viewMode === 'traspasos' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <OdooFilterBar
              search={search}
              onSearchChange={val => { setSearch(val); setPage(1); }}
              placeholder="Buscar por folio, origen o destino..."
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
              dateFrom={desde}
              dateTo={hasta}
              onDateFromChange={setDesde}
              onDateToChange={setHasta}
            />
            <div className="flex items-center gap-2 shrink-0">
              <ExportButton
                onExcel={() => exportToExcel({ fileName: 'Traspasos', title: 'Reporte de Traspasos', columns: TRASPASOS_COLUMNS, data: exportTraspasos })}
                onPDF={() => exportToPDF({ fileName: 'Traspasos', title: 'Reporte de Traspasos', columns: TRASPASOS_COLUMNS, data: exportTraspasos })}
              />
              <button onClick={() => navigate('/almacen/traspasos/nuevo')} className="btn-odoo-primary shrink-0">
                <Plus className="h-3.5 w-3.5" /> Nuevo traspaso
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={7} /></div>
          ) : (
            <>
              <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} />
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
              placeholder="Buscar por folio, producto, origen o destino..."
              filterOptions={FILTER_OPTIONS}
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
                onExcel={() => exportToExcel({ fileName: 'Traspasos_Detalle', title: 'Detalle de Traspasos', columns: DETALLE_COLUMNS, data: exportLineas, totals: { cantidad: totalCantidad } })}
                onPDF={() => exportToPDF({ fileName: 'Traspasos_Detalle', title: 'Detalle de Traspasos', columns: DETALLE_COLUMNS, data: exportLineas, totals: { cantidad: totalCantidad } })}
              />
            </div>
          </div>

          {!isLoadingLineas && totalD > 0 && (
            <div className="flex items-center gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
              <span><strong className="text-foreground">{totalD}</strong> líneas</span>
              <span>Total unidades: <strong className="text-foreground">{fmtNum(totalCantidad)}</strong></span>
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
