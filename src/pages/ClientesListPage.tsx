import { useState, useMemo } from 'react';
import { usePermisos } from '@/hooks/usePermisos';
import SearchableSelect from '@/components/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, AlertTriangle, Trash2, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { ImportDialog } from '@/components/ImportDialog';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TablePagination } from '@/components/TablePagination';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { MobileListCard } from '@/components/MobileListCard';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useClientesPaginated } from '@/hooks/useClientes';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData } from '@/hooks/useListPreferences';
import CatalogCRUD from '@/components/CatalogCRUD';
import { cn } from '@/lib/utils';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { readStoredPageSize, type PageSizeOption } from '@/hooks/useTablePagination';
import { ClienteLink } from '@/components/links/EntityLinks';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';

const CLIENTES_COLUMNS: ExportColumn[] = [
  { key: 'codigo', header: 'Código', width: 10 },
  { key: 'nombre', header: 'Nombre', width: 30 },
  { key: 'contacto', header: 'Contacto', width: 20 },
  { key: 'telefono', header: 'Teléfono', width: 14 },
  { key: 'email', header: 'Email', width: 22 },
  { key: 'direccion', header: 'Dirección', width: 30 },
  { key: 'colonia', header: 'Colonia', width: 16 },
  { key: 'credito', header: 'Crédito', width: 8 },
  { key: 'limite_credito', header: 'Límite crédito', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 10 },
  { key: 'gps_lat', header: 'Latitud', format: 'number', width: 14 },
  { key: 'gps_lng', header: 'Longitud', format: 'number', width: 14 },
];

const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIAS_LABEL: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

const STATIC_FILTER_OPTIONS = [
  {
    key: 'credito',
    label: 'Crédito',
    options: [
      { value: 'si', label: 'Con crédito' },
      { value: 'no', label: 'Sin crédito' },
    ],
  },
  {
    key: 'dia_visita',
    label: 'Día de visita',
    options: DIAS_SEMANA.map(d => ({ value: d, label: DIAS_LABEL[d] })),
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'zona', label: 'Zona' },
  { value: 'credito', label: 'Tipo crédito' },
  { value: 'tarifa', label: 'Lista de precios' },
  { value: 'dia_visita', label: 'Día de visita' },
];

function getNumericPageSize(ps: PageSizeOption): number {
  return ps === 'all' ? 10000 : ps;
}

function useDynamicFilterOptions() {
  const { empresa } = useAuth();
  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    networkMode: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const cached = await offlineDb.profiles.where('empresa_id').equals(empresa!.id).toArray();
          return (cached as any[])
            .filter(p => !p.estado || p.estado === 'activo')
            .map(p => ({ id: p.id, nombre: p.nombre }))
            .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
        } catch { return []; }
      };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const c = await readCache(); if (c.length) return c as { id: string; nombre: string }[];
      }
      try {
        const { data, error } = await (supabase.from('profiles') as any).select('id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
        if (error) throw error;
        return (data ?? []) as { id: string; nombre: string }[];
      } catch {
        return await readCache() as { id: string; nombre: string }[];
      }
    },
  });
  const { data: zonas } = useQuery({
    queryKey: ['zonas-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    networkMode: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const cached = await offlineDb.zonas.where('empresa_id').equals(empresa!.id).toArray();
          return (cached as any[])
            .filter(z => z.activo !== false)
            .map(z => ({ id: z.id, nombre: z.nombre }))
            .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
        } catch { return []; }
      };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const c = await readCache(); if (c.length) return c as { id: string; nombre: string }[];
      }
      try {
        const { data, error } = await (supabase.from('zonas') as any).select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
        if (error) throw error;
        return (data ?? []) as { id: string; nombre: string }[];
      } catch {
        return await readCache() as { id: string; nombre: string }[];
      }
    },
  });
  return { vendedores, zonas };
}

function ClientesTable({ forcedStatus, prefsKey }: { forcedStatus: string; prefsKey: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasPermiso } = usePermisos();
  const canCreate = hasPermiso('clientes', 'crear');
  const canDelete = hasPermiso('clientes', 'eliminar');
  const qc = useQueryClient();
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
      if (forcedStatus === 'inactivo') {
        const { error } = await supabase.from('clientes').delete().in('id', ids).eq('empresa_id', empresa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').update({ status: 'inactivo' }).in('id', ids).eq('empresa_id', empresa.id);
        if (error) throw error;
      }
      toast.success(`${ids.length} cliente${ids.length !== 1 ? 's' : ''} ${forcedStatus === 'inactivo' ? 'eliminados' : 'dados de baja'}`);
      setSelected(new Set());
      setConfirmDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['clientes-page'] });
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
      const { error } = await supabase.from('clientes').update({ status: 'activo' }).in('id', ids).eq('empresa_id', empresa.id);
      if (error) throw error;
      toast.success(`${ids.length} cliente${ids.length !== 1 ? 's' : ''} activados`);
      setSelected(new Set());
      setConfirmActivateOpen(false);
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['clientes-page'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al activar');
    } finally {
      setBulkActivating(false);
    }
  };
  const { empresa } = useAuth();
  // Realtime: refresca lista al cambiar clientes desde otro dispositivo
  useRealtimeInvalidate({ table: 'clientes', empresaId: empresa?.id, queryKeys: [['clientes'], ['clientes-page']] });
  const { clientesVisibilidad } = useDataVisibility('clientes');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(readStoredPageSize);
  const [importOpen, setImportOpen] = useState(false);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences(prefsKey);
  const { vendedores, zonas } = useDynamicFilterOptions();

  // Count active clients without vendedor
  const { data: sinVendedorCount } = useQuery({
    queryKey: ['clientes-sin-vendedor', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('clientes')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .is('vendedor_id', null)
        .eq('status', 'activo');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const numericPageSize = getNumericPageSize(pageSize);

  const handlePageSizeChange = (size: PageSizeOption) => {
    setPageSizeState(size);
    setPage(1);
    try { localStorage.setItem('table-page-size', String(size)); } catch {}
  };

  const FILTER_OPTIONS = useMemo(() => [
    ...STATIC_FILTER_OPTIONS,
    { key: 'vendedor', label: 'Vendedor', options: (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre })) },
    { key: 'zona', label: 'Zona', options: (zonas ?? []).map(z => ({ value: z.id, label: z.nombre })) },
  ], [vendedores, zonas]);

  const statusFilter = forcedStatus;
  const vendedorFilter = filters.vendedor?.length ? filters.vendedor.join(',') : 'todos';
  const zonaFilter = filters.zona?.length ? filters.zona.join(',') : 'todos';
  const debouncedSearch = useDebounce(search, 300);
  const { data: clientesData, isLoading } = useClientesPaginated(debouncedSearch, statusFilter, page, numericPageSize, vendedorFilter, zonaFilter, !!groupBy);

  // Client-side filters: credito + dia_visita
  const creditoFilter = filters.credito;
  const diaVisitaFilter = filters.dia_visita;
  const clientesRaw = clientesData?.rows ?? [];
  const clientes = useMemo(() => {
    let rows = clientesRaw;
    if (creditoFilter && creditoFilter.length > 0) {
      rows = rows.filter(c => creditoFilter.includes(c.credito ? 'si' : 'no'));
    }
    if (diaVisitaFilter && diaVisitaFilter.length > 0) {
      rows = rows.filter(c => {
        const dv = (c as any).dia_visita as string[] | null | undefined;
        if (!dv || dv.length === 0) return false;
        return dv.some(d => diaVisitaFilter.includes(d.toLowerCase()));
      });
    }
    return rows;
  }, [clientesRaw, creditoFilter, diaVisitaFilter]);
  const total = clientesData?.total ?? 0;
  const from = total === 0 ? 0 : Math.min((page - 1) * numericPageSize + 1, total);
  const to = Math.min(page * numericPageSize, total);
  const totalPages = numericPageSize > 0 ? Math.max(1, Math.ceil(total / numericPageSize)) : 1;
  const pageData = clientes;
  const allSelected = pageData.length > 0 && pageData.every(c => selected.has(c.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(c => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const groups = useMemo(() => groupData(pageData, groupBy, (item: any, key) => {
    if (key === 'status') return (item.status ?? 'activo').charAt(0).toUpperCase() + (item.status ?? 'activo').slice(1);
    if (key === 'vendedor') return item.vendedores?.nombre ?? 'Sin vendedor';
    if (key === 'zona') return item.zonas?.nombre ?? 'Sin zona';
    if (key === 'credito') return item.credito ? 'Con crédito' : 'Sin crédito';
    if (key === 'tarifa') return item.tarifas?.nombre ?? 'Sin lista';
    if (key === 'dia_visita') {
      const dv = (item.dia_visita as string[] | null | undefined) ?? [];
      if (!dv.length) return 'Sin día';
      return dv.map(d => DIAS_LABEL[d.toLowerCase()] ?? d).join(', ');
    }
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
            <th className="th-odoo text-left">Código</th>
            <th className="th-odoo text-left">Nombre</th>
            <th className="th-odoo text-left hidden md:table-cell">Contacto</th>
            <th className="th-odoo text-left">Días de visita</th>
            <th className="th-odoo text-left hidden lg:table-cell">Teléfono</th>
            <th className="th-odoo text-left hidden lg:table-cell">Zona</th>
            <th className="th-odoo text-left hidden xl:table-cell">Vendedor</th>
            <th className="th-odoo text-left hidden xl:table-cell">Lista de precios</th>
            <th className="th-odoo text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">No hay clientes. Crea el primero.</td>
            </tr>
          )}
          {items.map((c: any) => (
            <tr
              key={c.id}
              className={cn(
                "border-b border-table-border cursor-pointer transition-colors",
                selected.has(c.id) ? "bg-primary/5" : "hover:bg-table-hover"
              )}
              onClick={() => navigate(`/clientes/${c.id}`)}
            >
              <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(c.id); }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="rounded border-input" />
              </td>
              <td className="py-1.5 px-3 font-mono text-xs">{c.codigo ?? '—'}</td>
              <td className="py-1.5 px-3 font-medium"><ClienteLink id={c.id}>{c.nombre}</ClienteLink></td>
              <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">{c.contacto ?? '—'}</td>
              <td className="py-1.5 px-3 text-muted-foreground">
                {c.dia_visita?.length > 0
                  ? c.dia_visita.map((d: string) => (DIAS_LABEL[d.toLowerCase()] ?? d).slice(0, 3)).join(', ')
                  : '—'}
              </td>

              <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{c.telefono ?? '—'}</td>
              <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{c.zonas?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3 hidden xl:table-cell text-muted-foreground">{c.vendedores?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3 hidden xl:table-cell text-muted-foreground">{c.tarifas?.nombre ?? '—'}</td>
              <td className="py-1.5 px-3 text-center">
                <StatusChip status={c.status ?? 'activo'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      {(sinVendedorCount ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>{sinVendedorCount} cliente{sinVendedorCount !== 1 ? 's' : ''} activo{sinVendedorCount !== 1 ? 's' : ''} sin vendedor asignado.</strong>{' '}
            {clientesVisibilidad === 'propios'
              ? 'Con la configuración "Cada usuario ve solo sus clientes", estos clientes no serán visibles para ningún vendedor. Asígnales un vendedor para que aparezcan en su ruta.'
              : 'Se recomienda asignarles un vendedor para una mejor organización.'}
          </span>
        </div>
      )}
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
                  fileName: 'Clientes', title: 'Catálogo de Clientes',
                  columns: CLIENTES_COLUMNS,
                  data: clientes.map(c => ({ ...c, credito: c.credito ? 'Sí' : 'No' })),
                })}
                onPDF={() => exportToPDF({
                  fileName: 'Clientes', title: 'Catálogo de Clientes',
                  columns: CLIENTES_COLUMNS,
                  data: clientes.map(c => ({ ...c, credito: c.credito ? 'Sí' : 'No' })),
                })}
              />
              {canCreate && (
                <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
                  <Upload className="h-3.5 w-3.5" /> Importar
                </button>
              )}
            </>
          )}
          {canCreate && (
            <button onClick={() => navigate('/clientes/nuevo')} className="btn-odoo-primary shrink-0">
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
          )}
        </div>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} type="clientes" />
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {forcedStatus === 'inactivo' ? 'Eliminar definitivamente' : 'Dar de baja clientes'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {forcedStatus === 'inactivo'
                  ? `Se eliminarán permanentemente ${selected.size} cliente${selected.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`
                  : `Se marcarán como inactivos ${selected.size} cliente${selected.size !== 1 ? 's' : ''}. Puedes reactivarlos desde la pestaña Bajas.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkDeleting}
                onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {bulkDeleting ? 'Procesando…' : (forcedStatus === 'inactivo' ? 'Eliminar' : 'Dar de baja')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmActivateOpen} onOpenChange={setConfirmActivateOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reactivar clientes</AlertDialogTitle>
              <AlertDialogDescription>
                Se marcarán como activos {selected.size} cliente{selected.size !== 1 ? 's' : ''}.
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
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 7} /></div>
      ) : isMobile ? (
        <div className="space-y-2">
          {pageData.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No hay clientes. Crea el primero.</div>
          )}
          {pageData.map(c => (
            <MobileListCard
              key={c.id}
              title={c.nombre}
              subtitle={c.codigo ?? undefined}
              badge={<StatusChip status={c.status ?? 'activo'} />}
              onClick={() => navigate(`/clientes/${c.id}`)}
              fields={[
                ...(c.telefono ? [{ label: 'Tel', value: c.telefono }] : []),
                ...(c.contacto ? [{ label: 'Contacto', value: c.contacto }] : []),
                ...((c as any).zonas?.nombre ? [{ label: 'Zona', value: (c as any).zonas.nombre }] : []),
                ...((c as any).vendedores?.nombre ? [{ label: 'Vendedor', value: (c as any).vendedores.nombre }] : []),
                ...((c as any).dia_visita?.length ? [{ label: 'Días de visita', value: ((c as any).dia_visita as string[]).map(d => DIAS_LABEL[d.toLowerCase()] ?? d).join(', ') }] : []),
                ...((c as any).tarifas?.nombre ? [{ label: 'Lista de precios', value: (c as any).tarifas.nombre }] : []),

              ]}
            />
          ))}
          {total > 0 && (
            <TablePagination
              from={from} to={to} total={total} page={page} totalPages={totalPages}
              pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
              onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)}
            />
          )}
        </div>
      ) : (
        <>
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} />
          {!groupBy && total > 0 && (
            <TablePagination
              from={from} to={to} total={total} page={page} totalPages={totalPages}
              pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
              onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)}
            />
          )}
        </>
      )}

      <BulkActionsBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        noun="cliente"
        actions={[
          {
            label: 'Exportar',
            icon: FileSpreadsheet,
            onClick: () => {
              const sel = clientes.filter(c => selected.has(c.id));
              if (sel.length === 0) return;
              exportToExcel({ fileName: `Clientes-seleccion-${sel.length}`, title: `Clientes seleccionados (${sel.length})`, columns: CLIENTES_COLUMNS, data: sel.map(c => ({ ...c, credito: c.credito ? 'Sí' : 'No' })) });
              toast.success(`${sel.length} clientes exportados`);
            },
          },
          forcedStatus === 'inactivo'
            ? { label: 'Activar', icon: CheckCircle2, onClick: () => setConfirmActivateOpen(true), hidden: !canDelete }
            : { label: 'Dar de baja', icon: Trash2, variant: 'destructive', onClick: () => setConfirmDeleteOpen(true), hidden: !canDelete },
          ...(forcedStatus === 'inactivo' ? [{ label: 'Eliminar', icon: Trash2, variant: 'destructive' as const, onClick: () => setConfirmDeleteOpen(true), hidden: !canDelete }] : []),
        ]}
      />
    </div>
  );
}

export default function ClientesListPage() {
  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Clientes <HelpButton title={HELP.clientes.title} sections={HELP.clientes.sections} /> <VideoHelpButton module="clientes" /></h1>
      <OdooTabs
        tabs={[
          { key: 'activos', label: 'Activos', content: <ClientesTable forcedStatus="activo" prefsKey="clientes-activos" /> },
          { key: 'bajas', label: 'Bajas', content: <ClientesTable forcedStatus="inactivo" prefsKey="clientes-bajas" /> },
          { key: 'zonas', label: 'Zonas', content: <CatalogCRUD title="Zonas" tableName="zonas" queryKey="zonas" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
        ]}
      />
    </div>
  );
}
