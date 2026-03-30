import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus, Banknote } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TablePagination } from '@/components/TablePagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { useVentasPaginated, useDeleteVenta } from '@/hooks/useVentas';
import { usePermisos } from '@/hooks/usePermisos';
import { useClientes } from '@/hooks/useClientes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { readStoredPageSize, type PageSizeOption } from '@/hooks/useTablePagination';

import { VENTAS_COLUMNS, CONDICION_LABELS, TIPO_LABELS, STATUS_LABELS, STATIC_FILTER_OPTIONS, GROUP_BY_OPTIONS } from './ventas/ventasConstants';
import { VentasDesktopTable } from './ventas/VentasDesktopTable';
import { VentasMobileList } from './ventas/VentasMobileList';

function useVendedoresForFilter() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('vendedores') as any).select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
}

function getNumericPageSize(ps: PageSizeOption): number {
  return ps === 'all' ? 10000 : ps;
}

export default function VentasListPage() {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { fmt: fmtCurrency } = useCurrency();
  const { hasPermiso } = usePermisos();
  const canDelete = hasPermiso('ventas', 'eliminar');
  const deleteVenta = useDeleteVenta();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(readStoredPageSize);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('ventas');

  const numericPageSize = getNumericPageSize(pageSize);
  const statusFilter = filters.status?.length ? filters.status.join(',') : 'todos';
  const tipoFilter = filters.tipo?.length ? filters.tipo.join(',') : 'todos';
  const condicionFilter = filters.condicion_pago?.length ? filters.condicion_pago.join(',') : 'todos';
  const vendedorFilter = filters.vendedor?.length ? filters.vendedor.join(',') : 'todos';

  const { data: ventasData, isLoading } = useVentasPaginated(search, statusFilter, tipoFilter, page, numericPageSize, condicionFilter, vendedorFilter, dateFrom || undefined, dateTo || undefined);
  const { data: clientesList } = useClientes();
  const { data: vendedoresList } = useVendedoresForFilter();

  const FILTER_OPTIONS = useMemo(() => {
    const vendedorOpts = (vendedoresList ?? []).map((v: any) => ({ value: v.id, label: v.nombre }));
    const clienteOpts = (clientesList ?? []).map(c => ({ value: c.id, label: c.nombre }));
    return [...STATIC_FILTER_OPTIONS, { key: 'vendedor', label: 'Vendedor', options: vendedorOpts }, { key: 'cliente', label: 'Cliente', options: clienteOpts }];
  }, [vendedoresList, clientesList]);

  const ventasRaw = ventasData?.rows ?? [];
  const clienteFilter = filters.cliente;
  const ventas = useMemo(() => {
    if (!clienteFilter || clienteFilter.length === 0) return ventasRaw;
    return ventasRaw.filter(v => clienteFilter.includes(v.cliente_id ?? ''));
  }, [ventasRaw, clienteFilter]);

  const total = (clienteFilter && clienteFilter.length > 0) ? ventas.length : (ventasData?.total ?? 0);
  const from = total === 0 ? 0 : Math.min((page - 1) * numericPageSize + 1, total);
  const to = Math.min(page * numericPageSize, total);
  const totalPages = numericPageSize > 0 ? Math.max(1, Math.ceil(total / numericPageSize)) : 1;
  const pageData = ventas;
  const allSelected = pageData.length > 0 && pageData.every(v => selected.has(v.id));

  const handlePageSizeChange = (size: PageSizeOption) => { setPageSize(size); setPage(1); try { localStorage.setItem('table-page-size', String(size)); } catch {} };
  const toggleAll = () => { allSelected ? setSelected(new Set()) : setSelected(new Set(pageData.map(v => v.id))); };
  const toggleOne = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };

  const fmt = (v: number | null | undefined) => v != null ? fmtCurrency(v) : '—';
  const totalVentas = ventas.reduce((s, v) => s + (v.total ?? 0), 0);
  const totalSaldo = ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);

  const groupLabelFn = (item: any, key: string) => {
    if (key === 'status') return STATUS_LABELS[item.status] ?? item.status;
    if (key === 'tipo') return TIPO_LABELS[item.tipo] ?? item.tipo;
    if (key === 'condicion_pago') return CONDICION_LABELS[item.condicion_pago] ?? item.condicion_pago;
    if (key === 'vendedor') return item.vendedores?.nombre ?? 'Sin vendedor';
    if (key === 'cliente') return item.clientes?.nombre ?? 'Sin cliente';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  };

  const groups = useMemo(() => groupData(pageData, groupBy, groupLabelFn, groupByLevels), [pageData, groupBy, groupByLevels]);

  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
      <VentasDesktopTable
        items={items} selected={selected} allSelected={allSelected} canDelete={canDelete}
        fmt={fmt} onToggleAll={toggleAll} onToggleOne={toggleOne} onDeleteTarget={setDeleteTarget}
      />
    </div>
  );

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Ventas <HelpButton title={HELP.ventas.title} sections={HELP.ventas.sections} /></h1>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search} onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por folio o cliente..."
          filterOptions={FILTER_OPTIONS} activeFilters={filters}
          onToggleFilter={(key, val) => { toggleFilterValue(key, val); setPage(1); }}
          onSetFilter={(key, vals) => { setFilter(key, vals); setPage(1); }}
          onClearFilters={() => { clearFilters(); setDateFrom(''); setDateTo(''); setPage(1); }}
          groupByOptions={GROUP_BY_OPTIONS} activeGroupBy={groupBy} onGroupByChange={setGroupBy}
          activeGroupByLevels={groupByLevels} onGroupByLevelChange={setGroupByLevel}
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={v => { setDateFrom(v); setPage(1); }}
          onDateToChange={v => { setDateTo(v); setPage(1); }}
        />
        <div className="flex items-center gap-2 shrink-0">
          {!isMobile && (
            <ExportButton
              onExcel={() => exportToExcel({ fileName: 'Ventas', title: 'Reporte de Ventas', columns: VENTAS_COLUMNS, data: ventas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })), totals: { total: totalVentas, saldo_pendiente: totalSaldo } })}
              onPDF={() => exportToPDF({ fileName: 'Ventas', title: 'Reporte de Ventas', columns: VENTAS_COLUMNS, data: ventas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })), totals: { total: totalVentas, saldo_pendiente: totalSaldo } })}
            />
          )}
          <button onClick={() => navigate('/finanzas/aplicar-pagos')} className="btn-odoo-secondary shrink-0">
            <Banknote className="h-3.5 w-3.5" /> Aplicar pagos
          </button>
          <button onClick={() => navigate('/ventas/nuevo')} className="btn-odoo-primary shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nueva venta
          </button>
        </div>
      </div>

      {!isLoading && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
          <span><strong className="text-foreground">{total}</strong> ventas</span>
          <span>Total: <strong className="text-foreground">{fmt(totalVentas)}</strong></span>
          {totalSaldo > 0 && <span>Saldo: <strong className="text-warning">{fmt(totalSaldo)}</strong></span>}
        </div>
      )}

      {isLoading ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 10} /></div>
      ) : isMobile ? (
        <div className="space-y-2">
          <VentasMobileList items={pageData} clientesList={clientesList} empresaId={empresa?.id ?? ''} canDelete={canDelete} fmtCurrency={fmtCurrency} onDeleteTarget={setDeleteTarget} />
          {total > 0 && (
            <TablePagination from={from} to={to} total={total} page={page} totalPages={totalPages} pageSize={pageSize} onPageSizeChange={handlePageSizeChange} onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)} />
          )}
        </div>
      ) : (
        <>
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} renderSummary={(items) => (<span className="text-[11px] text-muted-foreground font-medium">{fmtCurrency(items.reduce((s: number, v: any) => s + (v.total ?? 0), 0))}</span>)} />
          {!groupBy && total > 0 && (
            <TablePagination from={from} to={to} total={total} page={page} totalPages={totalPages} pageSize={pageSize} onPageSizeChange={handlePageSizeChange} onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)} />
          )}
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta venta?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. La venta y todas sus líneas serán eliminadas permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (!deleteTarget) return; deleteVenta.mutateAsync(deleteTarget).then(() => toast.success('Venta eliminada')).catch((err: any) => toast.error(err.message)); setDeleteTarget(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
