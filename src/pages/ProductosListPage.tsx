import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, CheckCircle2, FileSpreadsheet, Boxes } from 'lucide-react';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermisos } from '@/hooks/usePermisos';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useThumb } from '@/hooks/useThumb';
import { ImportDialog } from '@/components/ImportDialog';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { MobileListCard } from '@/components/MobileListCard';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { MobileProductoQuickForm } from '@/components/MobileProductoQuickForm';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useProductosPaginated } from '@/hooks/useData';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData } from '@/hooks/useListPreferences';
import { cn, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useAllPresentaciones } from '@/hooks/usePresentaciones';
import { ProductoLink } from '@/components/links/EntityLinks';
import { getStockBreakdown } from '@/lib/stockPresentacion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';

const PRODUCTOS_COLUMNS: ExportColumn[] = [
  { key: 'codigo', header: 'Código', width: 12 },
  { key: 'nombre', header: 'Nombre', width: 30 },
  { key: 'precio_principal', header: 'Precio', format: 'currency', width: 14 },
  { key: 'costo', header: 'Costo', format: 'currency', width: 14 },
  { key: 'cantidad', header: 'Stock', format: 'number', width: 10 },
  { key: 'status', header: 'Estado', width: 10 },
];

const PAGE_SIZE_OPTIONS = [10, 50, 80, 200, 500, 0];
const DEFAULT_PAGE_SIZE = 80;
const ALL_PAGE_SIZE = 100000;

const STATIC_FILTER_OPTIONS = [
  {
    key: 'clasificacion',
    label: 'Categoría',
    options: [] as { value: string; label: string }[],
  },
  {
    key: 'marca',
    label: 'Marca',
    options: [] as { value: string; label: string }[],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'clasificacion', label: 'Categoría' },
  { value: 'marca', label: 'Marca' },
  { value: 'proveedor', label: 'Proveedor' },
];

function useProductoFilterOptions() {
  const { empresa } = useAuth();
  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('clasificaciones') as any).select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const { data: marcas } = useQuery({
    queryKey: ['marcas-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('marcas') as any).select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('proveedores') as any).select('id, nombre').eq('empresa_id', empresa!.id).neq('status', 'baja').order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  return { clasificaciones, marcas, proveedores };
}

export default function ProductosListPage() {
  const navigate = useNavigate();
  const thumb = useThumb();
  const isMobile = useIsMobile();
  const { fmt: fmtCurrency } = useCurrency();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const effectivePageSize = pageSize === 0 ? ALL_PAGE_SIZE : pageSize;
  const [importOpen, setImportOpen] = useState(false);
  const [mobileNewOpen, setMobileNewOpen] = useState(false);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('productos');
  const { clasificaciones, marcas, proveedores } = useProductoFilterOptions();
  const { hasPermiso } = usePermisos();
  const canDelete = hasPermiso('productos', 'eliminar');
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const manejaLotes = !!(empresa as any)?.maneja_lotes;
  // Realtime: refresca productos al cambiar desde otro dispositivo (precios, stock)
  useRealtimeInvalidate({ table: 'productos', empresaId: empresa?.id, queryKeys: [['productos']] });
  useRealtimeInvalidate({ table: 'stock_almacen', empresaId: empresa?.id, queryKeys: [['productos']] });
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkActivating, setBulkActivating] = useState(false);
  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false);

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!empresa?.id) {
      toast.error('No se pudo identificar la empresa actual');
      return;
    }
    setBulkDeleting(true);
    try {
      if (statusFilter === 'inactivo') {
        const { error } = await supabase.from('productos').delete().in('id', ids).eq('empresa_id', empresa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('productos').update({ status: 'inactivo' }).in('id', ids).eq('empresa_id', empresa.id);
        if (error) throw error;
      }
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} ${statusFilter === 'inactivo' ? 'eliminados' : 'dados de baja'}`);
      setSelected(new Set());
      setConfirmDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al eliminar');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkActivate = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!empresa?.id) {
      toast.error('No se pudo identificar la empresa actual');
      return;
    }
    setBulkActivating(true);
    try {
      const { error } = await supabase.from('productos').update({ status: 'activo' }).in('id', ids).eq('empresa_id', empresa.id);
      if (error) throw error;
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} activados`);
      setSelected(new Set());
      setConfirmActivateOpen(false);
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al activar');
    } finally {
      setBulkActivating(false);
    }
  };

  const [bulkLote, setBulkLote] = useState(false);
  const handleBulkManejaLote = async (value: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!empresa?.id) { toast.error('No se pudo identificar la empresa actual'); return; }
    setBulkLote(true);
    try {
      const { error } = await supabase.from('productos').update({ maneja_lote: value } as any).in('id', ids).eq('empresa_id', empresa.id);
      if (error) throw error;
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} ${value ? 'ahora manejan lote' : 'ya no manejan lote'}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al actualizar');
    } finally {
      setBulkLote(false);
    }
  };

  const FILTER_OPTIONS = useMemo(() => [
    { key: 'clasificacion', label: 'Categoría', options: (clasificaciones ?? []).map(c => ({ value: c.id, label: c.nombre })) },
    { key: 'marca', label: 'Marca', options: (marcas ?? []).map(m => ({ value: m.id, label: m.nombre })) },
    { key: 'proveedor', label: 'Proveedor', options: (proveedores ?? []).map(p => ({ value: p.id, label: p.nombre })) },
    ...(manejaLotes ? [{ key: 'maneja_lote', label: 'Maneja lote', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }] : []),
  ], [clasificaciones, marcas, proveedores, manejaLotes]);

  const statusFilter = filters.status?.length ? filters.status.join(',') : 'activo';
  const clasificacionFilter = filters.clasificacion?.length ? filters.clasificacion.join(',') : 'todos';
  const marcaFilter = filters.marca?.length ? filters.marca.join(',') : 'todos';
  const proveedorFilter = filters.proveedor?.length ? filters.proveedor.join(',') : 'todos';
  const manejaLoteFilter = filters.maneja_lote?.[0] ?? '';
  const debouncedSearch = useDebounce(search, 300);
  const { data: productosData, isLoading } = useProductosPaginated(debouncedSearch, statusFilter, page, effectivePageSize, clasificacionFilter, marcaFilter, !!groupBy, proveedorFilter, manejaLoteFilter);

  const productos = productosData?.rows ?? [];
  const { data: allPresentaciones } = useAllPresentaciones();
  const presentacionesByProducto = useMemo(() => {
    const map = new Map<string, any[]>();
    (allPresentaciones ?? []).forEach(p => {
      const arr = map.get(p.producto_id) ?? [];
      arr.push(p);
      map.set(p.producto_id, arr);
    });
    return map;
  }, [allPresentaciones]);
  const total = productosData?.total ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = productos;
  const allSelected = pageData.length > 0 && pageData.every(p => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(p => p.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const fmt = (v: number | null | undefined) => v != null ? fmtCurrency(v) : '—';

  const groups = useMemo(() => groupData(pageData, groupBy, (item: any, key) => {
    if (key === 'status') return (item.status ?? 'activo').charAt(0).toUpperCase() + (item.status ?? 'activo').slice(1);
    if (key === 'clasificacion') return item.clasificaciones?.nombre ?? 'Sin categoría';
    if (key === 'marca') return item.marcas?.nombre ?? 'Sin marca';
    if (key === 'proveedor') return item.proveedores?.nombre ?? 'Sin proveedor';
    return '';
  }, groupByLevels), [pageData, groupBy, groupByLevels]);

  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-table-border">
            <th className="th-odoo w-10 text-center">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
            </th>
             <th className="th-odoo w-10">Img</th>
             <th className="th-odoo text-left">Código</th>
             <th className="th-odoo text-left">Nombre</th>
             <th className="th-odoo text-left hidden lg:table-cell">Categoría</th>
             <th className="th-odoo text-left hidden md:table-cell">Marca</th>
             <th className="th-odoo text-left hidden xl:table-cell">Proveedor</th>
             {manejaLotes && <th className="th-odoo text-center hidden lg:table-cell">Lote</th>}
             <th className="th-odoo text-left hidden xl:table-cell">Lista</th>
             <th className="th-odoo text-center hidden xl:table-cell">U. compra</th>
             <th className="th-odoo text-center hidden xl:table-cell">U. venta</th>
             <th className="th-odoo text-center hidden xl:table-cell">Factor</th>
             <th className="th-odoo text-right">Precio</th>
             <th className="th-odoo text-right hidden md:table-cell">Costo</th>
             <th className="th-odoo text-right hidden xl:table-cell">Costo/u</th>
             <th className="th-odoo text-right hidden lg:table-cell">Stock</th>
             <th className="th-odoo text-center hidden sm:table-cell">IVA</th>
             <th className="th-odoo text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={16} className="text-center py-12 text-muted-foreground text-sm">No hay productos. Crea el primero.</td>
            </tr>
          )}
          {items.map((p: any) => (
            <tr
              key={p.id}
              className={cn(
                "border-b border-table-border cursor-pointer transition-colors",
                selected.has(p.id) ? "bg-primary/5" : "hover:bg-table-hover"
              )}
              onClick={() => navigate(`/productos/${p.id}`)}
            >
              <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(p.id); }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded border-input" />
              </td>
              <td className="py-1.5 px-2">
                {p.imagen_url ? (
                  <img src={thumb(p.imagen_url, 64)} alt="" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded bg-secondary flex items-center justify-center text-xxs text-muted-foreground">—</div>
                )}
              </td>
              <td className="py-1.5 px-3 font-mono text-xs">{p.codigo}</td>
              <td className="py-1.5 px-3 font-medium max-w-[240px]">
                <div className="flex items-center gap-1.5 truncate">
                  <ProductoLink id={p.id} className="truncate">{p.nombre}</ProductoLink>
                  {p.es_granel && (
                    <span className="text-xxs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                      Granel
                    </span>
                  )}
                </div>
              </td>
              <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground text-xs">{p.clasificaciones?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground text-xs">{p.marcas?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3 hidden xl:table-cell text-muted-foreground text-xs">{p.proveedores?.nombre ?? '—'}</td>
               {manejaLotes && (
                 <td className="py-1.5 px-3 hidden lg:table-cell text-center">
                   {(p as any).maneja_lote
                     ? <span className="inline-flex items-center gap-1 text-[11px] text-primary"><Boxes className="h-3 w-3" /> Sí</span>
                     : <span className="text-[11px] text-muted-foreground">—</span>}
                 </td>
               )}
               <td className="py-1.5 px-3 hidden xl:table-cell text-muted-foreground text-xs">{p.listas?.nombre ?? '—'}</td>
               <td className="py-1.5 px-3 hidden xl:table-cell text-center text-muted-foreground text-xs">{p.unidades_compra?.abreviatura ?? '—'}</td>
               <td className="py-1.5 px-3 hidden xl:table-cell text-center text-muted-foreground text-xs">{p.unidades_venta?.abreviatura ?? '—'}</td>
               <td className="py-1.5 px-3 hidden xl:table-cell text-center font-mono text-xs">{p.factor_conversion ?? 1}</td>
               <td className="py-1.5 px-3 text-right font-medium tabular-nums">{fmt(p.precio_principal)}</td>
               <td className="py-1.5 px-3 text-right hidden md:table-cell text-muted-foreground tabular-nums">{fmt(p.costo)}</td>
               <td className="py-1.5 px-3 text-right hidden xl:table-cell text-muted-foreground tabular-nums font-mono text-xs">
                 {fmt((p.costo ?? 0) / (p.factor_conversion || 1))}
               </td>
              <td className="py-1.5 px-3 text-right hidden lg:table-cell tabular-nums">
                <span className={cn(
                  "font-medium",
                  (p.cantidad ?? 0) <= 0 ? "text-destructive" : (p.cantidad ?? 0) < (p.min ?? 0) ? "text-warning" : "text-foreground"
                )}>
                  {fmtNum(p.cantidad ?? 0)}
                </span>
                {(() => {
                  const bd = getStockBreakdown(
                    p.cantidad ?? 0,
                    presentacionesByProducto.get(p.id),
                    (p as any).es_granel ? ((p as any).unidad_granel || 'kg') : 'pz',
                  );
                  return bd ? <div className="text-[10px] text-primary font-medium">{bd.texto}</div> : null;
                })()}
              </td>
              <td className="py-1.5 px-3 hidden sm:table-cell text-center">
                {p.tiene_iva ? (
                  <span className="text-xxs font-medium text-success">{p.iva_pct ?? 16}%</span>
                ) : (
                  <span className="text-xxs text-muted-foreground">No</span>
                )}
              </td>
              <td className="py-1.5 px-3 text-center">
                <StatusChip status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Productos <HelpButton title={HELP.productos.title} sections={HELP.productos.sections} /> <VideoHelpButton module="productos" /></h1>

      <div className="flex border-b border-border gap-0 overflow-x-auto -mt-1">
        {[
          { key: 'activo', label: 'Activos' },
          { key: 'inactivo', label: 'Inactivos' },
          { key: 'borrador', label: 'Borradores' },
        ].map(tab => {
          const activeStatus = filters.status?.[0] ?? 'activo';
          return (
            <button
              key={tab.key}
              onClick={() => { setFilter('status', [tab.key]); setPage(1); setSelected(new Set()); }}
              className={cn("odoo-tab whitespace-nowrap", activeStatus === tab.key && "odoo-tab-active")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por nombre o código..."
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
          {/* Bulk actions moved to floating BulkActionsBar */}
          {!isMobile && (
            <>
              <ExportButton
                onExcel={() => exportToExcel({
                  fileName: 'Productos', title: 'Catálogo de Productos',
                  columns: PRODUCTOS_COLUMNS, data: productos ?? [],
                })}
                onPDF={() => exportToPDF({
                  fileName: 'Productos', title: 'Catálogo de Productos',
                  columns: PRODUCTOS_COLUMNS, data: productos ?? [],
                })}
              />
              <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
                <Upload className="h-3.5 w-3.5" /> Importar
              </button>
            </>
          )}
          <button
            onClick={() => isMobile ? setMobileNewOpen(true) : navigate('/productos/nuevo')}
            className="btn-odoo-primary shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo
          </button>
        </div>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} type="productos" />
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{statusFilter === 'inactivo' ? 'Eliminar productos' : 'Dar de baja productos'}</AlertDialogTitle>
              <AlertDialogDescription>
                {statusFilter === 'inactivo'
                  ? `Se eliminarán permanentemente ${selected.size} producto${selected.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`
                  : `Se marcarán como inactivos ${selected.size} producto${selected.size !== 1 ? 's' : ''}. Podrás reactivarlos cambiando el filtro de estado.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkDeleting}
                onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {bulkDeleting ? 'Procesando…' : (statusFilter === 'inactivo' ? 'Eliminar' : 'Dar de baja')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmActivateOpen} onOpenChange={setConfirmActivateOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reactivar productos</AlertDialogTitle>
              <AlertDialogDescription>
                Se marcarán como activos {selected.size} producto{selected.size !== 1 ? 's' : ''}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkActivating}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkActivating}
                onClick={(e) => { e.preventDefault(); handleBulkActivate(); }}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {bulkActivating ? 'Procesando…' : 'Activar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <MobileProductoQuickForm
          open={mobileNewOpen}
          onOpenChange={setMobileNewOpen}
          onCreated={(id) => navigate(`/productos/${id}`)}
        />
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 12} /></div>
      ) : isMobile ? (
        <div className="space-y-2">
          {pageData.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No hay productos. Crea el primero.</div>
          )}
          {pageData.map((p: any) => (
            <MobileListCard
              key={p.id}
              title={p.nombre}
              subtitle={p.codigo}
              badge={<StatusChip status={p.status} />}
              onClick={() => navigate(`/productos/${p.id}`)}
              leading={p.imagen_url ? (
                <img src={thumb(p.imagen_url, 96)} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center text-xs text-muted-foreground shrink-0">—</div>
              )}
              fields={[
                { label: 'Precio', value: fmt(p.precio_principal) },
                { label: 'Stock', value: <span className={cn(
                  "font-medium",
                  (p.cantidad ?? 0) <= 0 ? "text-destructive" : "text-foreground"
                )}>{fmtNum(p.cantidad ?? 0)}</span> },
                ...(p.clasificaciones?.nombre ? [{ label: 'Cat', value: p.clasificaciones.nombre }] : []),
                ...(p.costo ? [{ label: 'Costo', value: fmt(p.costo) }] : []),
              ]}
            />
          ))}
          {total > 0 && (
            <OdooPagination from={from} to={to} total={total} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
          )}
        </div>
      ) : (
        <>
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} />
          {!groupBy && total > 0 && (
            <OdooPagination from={from} to={to} total={total} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
          )}
        </>
      )}

      <BulkActionsBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        noun="producto"
        actions={[
          {
            label: 'Exportar',
            icon: FileSpreadsheet,
            onClick: () => {
              const sel = (productos ?? []).filter(p => selected.has(p.id));
              if (sel.length === 0) return;
              exportToExcel({ fileName: `Productos-seleccion-${sel.length}`, title: `Productos seleccionados (${sel.length})`, columns: PRODUCTOS_COLUMNS, data: sel });
              toast.success(`${sel.length} productos exportados`);
            },
          },
          ...((empresa as any)?.maneja_lotes ? [
            { label: bulkLote ? 'Aplicando…' : 'Maneja lote', icon: Boxes, onClick: () => handleBulkManejaLote(true) },
            { label: 'Quitar lote', icon: Boxes, onClick: () => handleBulkManejaLote(false) },
          ] : []),
          statusFilter === 'inactivo'
            ? { label: 'Activar', icon: CheckCircle2, onClick: () => setConfirmActivateOpen(true), hidden: !canDelete }
            : { label: 'Dar de baja', icon: Trash2, variant: 'destructive', onClick: () => setConfirmDeleteOpen(true), hidden: !canDelete },
          ...(statusFilter === 'inactivo' ? [{ label: 'Eliminar', icon: Trash2, variant: 'destructive' as const, onClick: () => setConfirmDeleteOpen(true), hidden: !canDelete }] : []),
        ]}
      />
    </div>
  );
}
