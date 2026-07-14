import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus, Banknote, List, Package, FileSpreadsheet, Printer, Trash2, Ban, Lock } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TablePagination } from '@/components/TablePagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { useVentasPaginated, useVentaLineasPaginated, useDeleteVenta } from '@/hooks/useVentas';
import { usePermisos } from '@/hooks/usePermisos';
import { useClientes } from '@/hooks/useClientes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData, dateGroupLabel, dateGroupSortKey } from '@/hooks/useListPreferences';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { readStoredPageSize, type PageSizeOption } from '@/hooks/useTablePagination';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { mergePdfBlobs } from '@/lib/mergePdfs';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { usePinAuth } from '@/hooks/usePinAuth';
import { totalEfectivoVenta, saldoRealVenta } from '@/lib/ventaCerrada';
import { BulkCerrarPedidosDialog } from '@/components/venta/BulkCerrarPedidosDialog';

import { VENTAS_COLUMNS, CONDICION_LABELS, TIPO_LABELS, STATUS_LABELS, STATIC_FILTER_OPTIONS, GROUP_BY_OPTIONS, VENTAS_TABLE_COLUMNS, VENTAS_DEFAULT_COLUMN_VISIBILITY } from './ventas/ventasConstants';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import { ColumnVisibilityMenu } from '@/components/ColumnVisibilityMenu';
import { VentasDesktopTable } from './ventas/VentasDesktopTable';
import { VentasProductosTable } from './ventas/VentasProductosTable';
import { VentasMobileList } from './ventas/VentasMobileList';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { useVendedoresForFilter } from '@/hooks/useFilterOptions';

function getNumericPageSize(ps: PageSizeOption): number {
  return ps === 'all' ? 10000 : ps;
}

export default function VentasListPage() {
  const { empresa } = useAuth();
  // Realtime: refresca lista al haber cambios en ventas/entregas/cobros (otro dispositivo)
  useRealtimeInvalidate({ table: 'ventas', empresaId: empresa?.id, queryKeys: [['ventas']] });
  useRealtimeInvalidate({ table: 'entregas', empresaId: empresa?.id, queryKeys: [['ventas'], ['entregas']] });
  useRealtimeInvalidate({ table: 'cobros', empresaId: empresa?.id, queryKeys: [['ventas'], ['cxc'], ['saldos']] });
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { fmt: fmtCurrency } = useCurrency();
  const { hasPermiso } = usePermisos();
  const canCreate = hasPermiso('ventas', 'crear');
  const canDelete = hasPermiso('ventas', 'eliminar');
  const deleteVenta = useDeleteVenta();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'ventas' | 'productos'>('ventas');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(readStoredPageSize);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkPdfBlob, setBulkPdfBlob] = useState<Blob | null>(null);
  const [bulkPdfName, setBulkPdfName] = useState('');
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);
  const [bulkClosePreview, setBulkClosePreview] = useState<{
    elegibles: Array<{ id: string; folio: string; totalPedido: number; totalEntregado: number; cobrado: number; faltantes: number }>;
    noElegibles: number;
  } | null>(null);
  const [bulkCloseLoading, setBulkCloseLoading] = useState(false);
  const { requestPin, PinDialog } = usePinAuth();
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('ventas');

  const { visible: columnVisibility, toggleColumn, setAll, reset } = useColumnPreferences('ventas', VENTAS_DEFAULT_COLUMN_VISIBILITY);

  const numericPageSize = getNumericPageSize(pageSize);
  const statusFilter = filters.status?.length ? filters.status.join(',') : 'todos';
  const tipoFilter = filters.tipo?.length ? filters.tipo.join(',') : 'todos';
  const condicionFilter = filters.condicion_pago?.length ? filters.condicion_pago.join(',') : 'todos';
  const vendedorFilter = filters.vendedor?.length ? filters.vendedor.join(',') : 'todos';

  const { data: ventasData, isLoading } = useVentasPaginated(search, statusFilter, tipoFilter, page, numericPageSize, condicionFilter, vendedorFilter, dateFrom || undefined, dateTo || undefined, !!groupBy);
  const { data: lineasData, isLoading: isLoadingLineas } = useVentaLineasPaginated(search, statusFilter, tipoFilter, page, numericPageSize, condicionFilter, vendedorFilter, dateFrom || undefined, dateTo || undefined, !!groupBy);
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

  // Active dataset depending on view mode
  const isProductView = viewMode === 'productos';
  const productRows = lineasData?.rows ?? [];

  const total = isProductView
    ? (lineasData?.total ?? 0)
    : (clienteFilter && clienteFilter.length > 0) ? ventas.length : (ventasData?.total ?? 0);
  const from = total === 0 ? 0 : Math.min((page - 1) * numericPageSize + 1, total);
  const to = Math.min(page * numericPageSize, total);
  const totalPages = numericPageSize > 0 ? Math.max(1, Math.ceil(total / numericPageSize)) : 1;
  const pageData = ventas;
  const allSelected = pageData.length > 0 && pageData.every(v => selected.has(v.id));

  const handlePageSizeChange = (size: PageSizeOption) => { setPageSize(size); setPage(1); try { localStorage.setItem('table-page-size', String(size)); } catch {} };
  const toggleAll = () => { allSelected ? setSelected(new Set()) : setSelected(new Set(pageData.map(v => v.id))); };
  const toggleOne = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };

  const selectedVentas = useMemo(() => ventas.filter(v => selected.has(v.id)), [ventas, selected]);

  const handleBulkExport = () => {
    if (selectedVentas.length === 0) return;
    const totalSel = selectedVentas.reduce((s, v) => s + totalEfectivoVenta(v as any), 0);
    const saldoSel = selectedVentas.reduce((s, v) => s + saldoRealVenta(v as any), 0);
    exportToExcel({
      fileName: `Ventas-seleccion-${selectedVentas.length}`,
      title: `Ventas seleccionadas (${selectedVentas.length})`,
      columns: VENTAS_COLUMNS,
      data: selectedVentas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })),
      totals: { total: totalSel, saldo_pendiente: saldoSel },
    });
    toast.success(`${selectedVentas.length} ventas exportadas`);
  };

  const handleBulkPrint = async () => {
    if (selectedVentas.length === 0 || !empresa?.id) return;
    setBulkPrinting(true);
    try {
      const blobs: Blob[] = [];
      for (const v of selectedVentas) {
        try { const { blob } = await generateVentaPdfById(v.id, empresa.id); blobs.push(blob); }
        catch (e) { console.error('PDF venta', v.id, e); }
      }
      if (blobs.length === 0) { toast.error('No se pudo generar ningún PDF'); return; }
      const merged = await mergePdfBlobs(blobs);
      setBulkPdfBlob(merged);
      setBulkPdfName(`Ventas-${blobs.length}.pdf`);
      toast.success(`${blobs.length} documentos combinados`);
    } catch (e: any) {
      toast.error(e.message || 'Error generando PDFs');
    } finally {
      setBulkPrinting(false);
    }
  };

  /**
   * Cancela las entregas activas (asignado/cargado/en_ruta/hecho) de las ventas dadas.
   * Esto dispara los triggers DB que DEVUELVEN STOCK al almacén origen.
   * Procesa una por una para garantizar que el trigger FOR EACH ROW se ejecute correctamente.
   */
  const cancelEntregasAndReturnStock = async (ventaIds: string[]) => {
    const { data: entregas, error: fetchErr } = await (supabase as any)
      .from('entregas')
      .select('id, status')
      .in('pedido_id', ventaIds);
    if (fetchErr) throw fetchErr;
    const activas = (entregas ?? []).filter((e: any) => !['cancelado', 'borrador'].includes(e.status));
    for (const e of activas) {
      // Update individual para que los triggers de reversión de inventario corran fila por fila
      const { error } = await supabase.from('entregas').update({ status: 'cancelado' } as any).eq('id', e.id);
      if (error) throw new Error(`Entrega ${e.id}: ${error.message}`);
    }
    return activas.length;
  };

  const handleBulkDelete = async () => {
    if (selectedVentas.length === 0) return;
    setBulkDeleting(true);
    let ok = 0, fail = 0;
    const errors: string[] = [];
    try {
      const ids = selectedVentas.map(v => v.id);
      // 1) Cancelar entregas activas → triggers DB devuelven stock
      try {
        const restored = await cancelEntregasAndReturnStock(ids);
        if (restored > 0) toast.info(`Stock devuelto de ${restored} entrega(s).`);
      } catch (e: any) {
        errors.push(`Reversión stock: ${e.message}`);
      }
      // 2) Borrar dependencias y luego ventas (una a una para tolerar fallos parciales)
      for (const id of ids) {
        try {
          // entregas (ya canceladas) + sus líneas
          const { data: ents } = await (supabase as any).from('entregas').select('id').eq('pedido_id', id);
          const eIds = (ents ?? []).map((e: any) => e.id);
          if (eIds.length) {
            await supabase.from('entrega_lineas').delete().in('entrega_id', eIds);
            await supabase.from('entregas').delete().in('id', eIds);
          }
          await supabase.from('cobro_aplicaciones').delete().eq('venta_id', id);
          await supabase.from('venta_comisiones').delete().eq('venta_id', id);
          await supabase.from('venta_historial').delete().eq('venta_id', id);
          await supabase.from('promocion_aplicada').delete().eq('venta_id', id);
          await supabase.from('venta_lineas').delete().eq('venta_id', id);
          const { error: delErr } = await supabase.from('ventas').delete().eq('id', id);
          if (delErr) throw delErr;
          ok++;
        } catch (e: any) {
          fail++;
          errors.push(`Venta ${id.slice(0, 8)}: ${e.message}`);
        }
      }
    } finally {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['cobros-desktop'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
      setSelected(new Set());
    }
    if (ok > 0) toast.success(`${ok} venta${ok !== 1 ? 's' : ''} eliminada${ok !== 1 ? 's' : ''}`);
    if (fail > 0) toast.error(`${fail} no se pudieron eliminar. ${errors[0] ?? ''}`);
  };

  const handleBulkCancel = async () => {
    if (selectedVentas.length === 0) return;
    const cancelables = selectedVentas.filter(v => (v as any).status !== 'cancelado');
    if (cancelables.length === 0) {
      toast.info('Las ventas seleccionadas ya están canceladas.');
      setBulkCancelOpen(false);
      return;
    }
    setBulkCancelling(true);
    try {
      const ids = cancelables.map(v => v.id);
      // 1) Cancelar entregas activas → triggers devuelven stock automáticamente
      let stockRestored = 0;
      try {
        stockRestored = await cancelEntregasAndReturnStock(ids);
      } catch (e: any) {
        toast.error(`Algunas entregas no se pudieron revertir: ${e.message}`);
      }
      // 2) Desligar pagos aplicados (los cobros quedan como saldo a favor del cliente)
      await supabase.from('cobro_aplicaciones').delete().in('venta_id', ids);
      // 3) Marcar ventas como canceladas
      const { error } = await supabase.from('ventas').update({ status: 'cancelado' } as any).in('id', ids);
      if (error) throw error;

      toast.success(`${ids.length} venta(s) cancelada(s)${stockRestored > 0 ? ` · stock devuelto de ${stockRestored} entrega(s)` : ''}.`);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['cobros-desktop'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      setSelected(new Set());
      setBulkCancelOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al cancelar');
    } finally {
      setBulkCancelling(false);
    }
  };

  // Cancelar una sola venta desde la lista, exige PIN de autorización
  const handleCancelOne = (id: string) => {
    const venta = ventas.find((v: any) => v.id === id);
    if (!venta) return;
    if ((venta as any).status === 'cancelado') {
      toast.info('La venta ya está cancelada.');
      return;
    }
    requestPin(
      'Cancelar venta',
      `Ingresa tu PIN de autorización para cancelar ${venta.folio || id.slice(0, 8)}.`,
      async () => {
        try {
          // 1) Cancelar entregas activas → triggers devuelven stock
          let stockRestored = 0;
          try {
            stockRestored = await cancelEntregasAndReturnStock([id]);
          } catch (e: any) {
            toast.error(`Algunas entregas no se pudieron revertir: ${e.message}`);
          }
          // 2) Desligar pagos aplicados
          await supabase.from('cobro_aplicaciones').delete().eq('venta_id', id);
          // 3) Marcar venta como cancelada
          const { error } = await supabase.from('ventas').update({ status: 'cancelado' } as any).eq('id', id);
          if (error) throw error;
          toast.success(`Venta cancelada${stockRestored > 0 ? ` · stock devuelto de ${stockRestored} entrega(s)` : ''}.`);
          qc.invalidateQueries({ queryKey: ['ventas'] });
          qc.invalidateQueries({ queryKey: ['entregas'] });
          qc.invalidateQueries({ queryKey: ['cobros-desktop'] });
          qc.invalidateQueries({ queryKey: ['cxc'] });
          qc.invalidateQueries({ queryKey: ['saldos'] });
          qc.invalidateQueries({ queryKey: ['stock_almacen'] });
          qc.invalidateQueries({ queryKey: ['productos'] });
        } catch (e: any) {
          toast.error(e.message || 'Error al cancelar');
        }
      }
    );
  };





  const activeLoading = isProductView ? isLoadingLineas : isLoading;

  const fmt = (v: number | null | undefined) => v != null ? fmtCurrency(v) : '—';
  const totalVentas = ventas.reduce((s, v) => s + totalEfectivoVenta(v as any), 0);
  const totalSaldo = ventas.reduce((s, v) => s + saldoRealVenta(v as any), 0);
  const totalLineas = productRows.reduce((s, r: any) => s + (r.linea_total ?? 0), 0);
  const totalCantidad = productRows.reduce((s, r: any) => s + (r.cantidad ?? 0), 0);

  const groupLabelFn = (item: any, key: string) => {
    if (key === 'status') return STATUS_LABELS[item.status] ?? item.status;
    if (key === 'tipo') return TIPO_LABELS[item.tipo] ?? item.tipo;
    if (key === 'condicion_pago') return CONDICION_LABELS[item.condicion_pago] ?? item.condicion_pago;
    if (key === 'vendedor') return item.vendedores?.nombre ?? item.vendedor_nombre ?? 'Sin vendedor';
    if (key === 'cliente') return item.clientes?.nombre ?? item.cliente_nombre ?? 'Sin cliente';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  };

  const groupSortKeyFn = (item: any, key: string) => {
    if (key.startsWith('fecha')) return dateGroupSortKey(item.fecha, key as any);
    return '';
  };
  const groupSortDir: 'asc' | 'desc' = (groupBy?.startsWith('fecha') || (groupByLevels?.[0]?.startsWith('fecha') ?? false)) ? 'desc' : 'asc';

  const groups = useMemo(() => groupData(pageData, groupBy, groupLabelFn, groupByLevels, groupSortKeyFn, groupSortDir), [pageData, groupBy, groupByLevels, groupSortDir]);
  const productGroups = useMemo(() => groupData(productRows, groupBy, groupLabelFn, groupByLevels, groupSortKeyFn, groupSortDir), [productRows, groupBy, groupByLevels, groupSortDir]);

  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
      <VentasDesktopTable
        items={items} selected={selected} allSelected={allSelected} canDelete={canDelete}
        fmt={fmt} onToggleAll={toggleAll} onToggleOne={toggleOne} onDeleteTarget={setDeleteTarget}
        onCancelTarget={handleCancelOne}
        empresaId={empresa?.id} empresa={empresa} clientesList={clientesList}
        columnVisibility={columnVisibility}
      />
    </div>
  );

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Ventas <HelpButton title={HELP.ventas.title} sections={HELP.ventas.sections} /> <VideoHelpButton module="ventas" /></h1>

      {!isMobile && (
        <div className="border-b border-border -mx-4 px-4 sm:mx-0 sm:px-0">
          <nav className="flex gap-6" role="tablist" aria-label="Vista de ventas">
            <button
              role="tab"
              aria-selected={viewMode === 'ventas'}
              onClick={() => { setViewMode('ventas'); setPage(1); }}
              className={cn(
                "relative inline-flex items-center gap-2 px-1 pb-2.5 pt-1 text-sm font-semibold transition-colors border-b-2 -mb-px",
                viewMode === 'ventas'
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" /> Ventas
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'productos'}
              onClick={() => { setViewMode('productos'); setPage(1); }}
              className={cn(
                "relative inline-flex items-center gap-2 px-1 pb-2.5 pt-1 text-sm font-semibold transition-colors border-b-2 -mb-px",
                viewMode === 'productos'
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <Package className="h-4 w-4" /> Productos
            </button>
          </nav>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search} onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder={isProductView ? "Buscar por producto, código o folio..." : "Buscar por folio o cliente..."}
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
            <ColumnVisibilityMenu
              columns={VENTAS_TABLE_COLUMNS}
              visible={columnVisibility}
              onToggle={toggleColumn}
              onShowAll={() => setAll(true)}
              onReset={reset}
            />
          )}
          {!isMobile && (
            <ExportButton
              onExcel={() => exportToExcel({ fileName: 'Ventas', title: 'Reporte de Ventas', columns: VENTAS_COLUMNS, data: ventas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })), totals: { total: totalVentas, saldo_pendiente: totalSaldo } })}
              onPDF={() => exportToPDF({ fileName: 'Ventas', title: 'Reporte de Ventas', columns: VENTAS_COLUMNS, data: ventas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })), totals: { total: totalVentas, saldo_pendiente: totalSaldo } })}
            />
          )}
          <button onClick={() => navigate('/finanzas/aplicar-pagos')} className="btn-odoo-secondary shrink-0">
            <Banknote className="h-3.5 w-3.5" /> Aplicar pagos
          </button>
          {canCreate && (
            <button onClick={() => navigate('/ventas/nuevo')} className="btn-odoo-primary shrink-0">
              <Plus className="h-3.5 w-3.5" /> Nueva venta
            </button>
          )}
        </div>
      </div>

      {!activeLoading && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
          {isProductView ? (
            <>
              <span><strong className="text-foreground">{total}</strong> líneas</span>
              <span>Cantidad: <strong className="text-foreground">{totalCantidad}</strong></span>
              <span>Total: <strong className="text-foreground">{fmt(totalLineas)}</strong></span>
            </>
          ) : (
            <>
              <span><strong className="text-foreground">{total}</strong> ventas</span>
              <span>Total: <strong className="text-foreground">{fmt(totalVentas)}</strong></span>
              {totalSaldo > 0 && <span>Saldo: <strong className="text-warning">{fmt(totalSaldo)}</strong></span>}
            </>
          )}
        </div>
      )}

      {activeLoading ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 10} /></div>
      ) : isMobile ? (
        <div className="space-y-2">
          <VentasMobileList items={pageData} clientesList={clientesList} empresaId={empresa?.id ?? ''} canDelete={canDelete} fmtCurrency={fmtCurrency} onDeleteTarget={setDeleteTarget} onCancelTarget={handleCancelOne} />
          {total > 0 && (
            <TablePagination from={from} to={to} total={total} page={page} totalPages={totalPages} pageSize={pageSize} onPageSizeChange={handlePageSizeChange} onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)} />
          )}
        </div>
      ) : isProductView ? (
        <>
          <GroupedTableWrapper
            groupBy={groupBy}
            groups={productGroups}
            renderTable={(items) => (
              <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
                <VentasProductosTable items={items} fmt={fmt} />
              </div>
            )}
            renderSummary={(items) => (
              <span className="text-[11px] text-muted-foreground font-medium">
                {fmtCurrency(items.reduce((s: number, r: any) => s + (r.linea_total ?? 0), 0))}
              </span>
            )}
          />
          {!groupBy && total > 0 && (
            <TablePagination from={from} to={to} total={total} page={page} totalPages={totalPages} pageSize={pageSize} onPageSizeChange={handlePageSizeChange} onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)} />
          )}
        </>
      ) : (
        <>
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} renderSummary={(items) => (<span className="text-[11px] text-muted-foreground font-medium">{fmtCurrency(items.reduce((s: number, v: any) => s + totalEfectivoVenta(v), 0))}</span>)} />
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected.size} venta{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Las ventas con pagos aplicados no podrán eliminarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleting}
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
            >
              {bulkDeleting ? 'Eliminando...' : `Eliminar ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentPreviewModal
        open={!!bulkPdfBlob}
        onClose={() => { setBulkPdfBlob(null); setBulkPdfName(''); }}
        pdfBlob={bulkPdfBlob}
        fileName={bulkPdfName}
        empresaId={empresa?.id ?? ''}
      />

      <BulkActionsBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        noun="venta"
        actions={[
          { label: 'Exportar', icon: FileSpreadsheet, onClick: handleBulkExport },
          { label: 'Imprimir PDF', icon: Printer, onClick: handleBulkPrint, loading: bulkPrinting },
          { label: 'Cerrar a lo entregado', icon: Lock, onClick: () => setBulkCloseOpen(true), hidden: !hasPermiso('ventas', 'editar') },
          { label: 'Cancelar', icon: Ban, variant: 'destructive', onClick: () => requestPin(`Cancelar ${selected.size} venta(s)`, 'Ingresa tu PIN de administrador para cancelar las ventas seleccionadas.', () => setBulkCancelOpen(true)), hidden: !canDelete },
          { label: 'Eliminar', icon: Trash2, variant: 'destructive', onClick: () => requestPin(`Eliminar ${selected.size} venta(s)`, 'Esta acción es permanente. Ingresa tu PIN de administrador para continuar.', () => setBulkDeleteOpen(true)), hidden: !canDelete },
        ]}
      />

      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar {selected.size} venta{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Las ventas se marcarán como canceladas y se desligarán los pagos aplicados, restaurando los saldos de los cobros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkCancelling}>No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkCancelling}
              onClick={(e) => { e.preventDefault(); handleBulkCancel(); }}
            >
              {bulkCancelling ? 'Cancelando...' : `Sí, cancelar ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkCerrarPedidosDialog
        open={bulkCloseOpen}
        onOpenChange={setBulkCloseOpen}
        ventaIds={selectedVentas.map(v => v.id)}
        fmt={(n) => fmtCurrency(n)}
        onDone={() => setSelected(new Set())}
      />


      <PinDialog />
    </div>
  );
}
