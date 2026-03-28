import { useState, useMemo, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import SearchableSelect from '@/components/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, MessageCircle, FileText, Banknote, Loader2, ShoppingCart, Trash2, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TablePagination } from '@/components/TablePagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { MobileListCard } from '@/components/MobileListCard';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useVentasPaginated, useDeleteVenta } from '@/hooks/useVentas';
import { usePermisos } from '@/hooks/usePermisos';
import { useClientes } from '@/hooks/useClientes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { cn, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { readStoredPageSize, type PageSizeOption } from '@/hooks/useTablePagination';

const VENTAS_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
  { key: 'cliente_nombre', header: 'Cliente', width: 25 },
  { key: 'tipo', header: 'Tipo', width: 14 },
  { key: 'condicion_pago', header: 'Condición', width: 12 },
  { key: 'subtotal', header: 'Subtotal', format: 'currency', width: 14 },
  { key: 'iva_total', header: 'IVA', format: 'currency', width: 12 },
  { key: 'total', header: 'Total', format: 'currency', width: 14 },
  { key: 'saldo_pendiente', header: 'Saldo', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
];

const CONDICION_LABELS: Record<string, string> = {
  contado: 'Contado',
  credito: 'Crédito',
  por_definir: 'Por definir',
};

const TIPO_LABELS: Record<string, string> = {
  pedido: 'Pedido',
  venta_directa: 'Venta directa',
};

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  facturado: 'Facturado',
  cancelado: 'Cancelado',
};

const STATIC_FILTER_OPTIONS = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { value: 'pedido', label: 'Pedido' },
      { value: 'venta_directa', label: 'Venta directa' },
    ],
  },
  {
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'borrador', label: 'Borrador' },
      { value: 'confirmado', label: 'Confirmado' },
      { value: 'entregado', label: 'Entregado' },
      { value: 'facturado', label: 'Facturado' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  {
    key: 'condicion_pago',
    label: 'Condición',
    options: [
      { value: 'contado', label: 'Contado' },
      { value: 'credito', label: 'Crédito' },
      { value: 'por_definir', label: 'Por definir' },
    ],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'condicion_pago', label: 'Condición de pago' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
  { value: 'fecha_anio', label: 'Año' },
  { value: 'fecha_mes', label: 'Mes' },
];

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
  const { profile, empresa } = useAuth();
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
    return [
      ...STATIC_FILTER_OPTIONS,
      { key: 'vendedor', label: 'Vendedor', options: vendedorOpts },
      { key: 'cliente', label: 'Cliente', options: clienteOpts },
    ];
  }, [vendedoresList, clientesList]);

  // WhatsApp state
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waPdfBlob, setWaPdfBlob] = useState<Blob | null>(null);
  const [waPdfName, setWaPdfName] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

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

  const handlePageSizeChange = (size: PageSizeOption) => {
    setPageSize(size);
    setPage(1);
    try { localStorage.setItem('table-page-size', String(size)); } catch {}
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(v => v.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

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

  const renderTableRows = (items: any[]) => (
    <>
      {items.map((v: any) => (
        <tr
          key={v.id}
          className={cn(
            "border-b border-table-border cursor-pointer transition-colors",
            selected.has(v.id) ? "bg-primary/5" : "hover:bg-table-hover"
          )}
          onClick={() => navigate(`/ventas/${v.id}`)}
        >
          <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(v.id); }}>
            <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)} className="rounded border-input" />
          </td>
          <td className="py-2 px-3 font-mono text-xs font-medium">{v.folio || v.id.slice(0, 8)}</td>
          <td className="py-2 px-3">
            <span className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded",
              v.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
            )}>
              {TIPO_LABELS[v.tipo] || v.tipo}
            </span>
          </td>
          <td className="py-2 px-3 max-w-[180px] truncate">{v.clientes?.nombre || (v.cliente_id ? '—' : 'Público en general')}</td>
          <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{v.vendedores?.nombre ?? '—'}</td>
          <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{CONDICION_LABELS[v.condicion_pago] || v.condicion_pago}</td>
          <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(v.fecha)}</td>
          <td className="py-2 px-3 text-right hidden md:table-cell text-muted-foreground tabular-nums">{fmt(v.subtotal)}</td>
          <td className="py-2 px-3 text-right font-medium tabular-nums">{fmt(v.total)}</td>
          <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
            {(v.saldo_pendiente ?? 0) > 0 ? (
              <span className="text-warning font-medium">{fmt(v.saldo_pendiente)}</span>
            ) : (
              <span className="text-muted-foreground">$0.00</span>
            )}
          </td>
          <td className="py-2 px-3 text-center">
            <StatusChip status={v.status} />
          </td>
          <td className="py-2 px-2 text-center w-8">
            {(v.status === 'borrador' || (v.status === 'cancelado' && canDelete)) && (
              <button
                className="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                title="Eliminar"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(v.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  );

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
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Condición</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">Subtotal</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Saldo</th>
            <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
            <th className="py-2 px-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={12} className="text-center py-12 text-muted-foreground">No hay ventas. Crea la primera.</td>
            </tr>
          )}
          {renderTableRows(items)}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td colSpan={8} className="py-2 px-3 text-muted-foreground">{items.length} ventas</td>
              <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(items.reduce((s: number, v: any) => s + (v.total ?? 0), 0))}</td>
              <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums text-warning font-bold">{fmt(items.reduce((s: number, v: any) => s + (v.saldo_pendiente ?? 0), 0))}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Ventas <HelpButton title={HELP.ventas.title} sections={HELP.ventas.sections} /></h1>

      <>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por folio o cliente..."
          filterOptions={FILTER_OPTIONS}
          activeFilters={filters}
          onToggleFilter={(key, val) => { toggleFilterValue(key, val); setPage(1); }}
          onSetFilter={(key, vals) => { setFilter(key, vals); setPage(1); }}
          onClearFilters={() => { clearFilters(); setDateFrom(''); setDateTo(''); setPage(1); }}
          groupByOptions={GROUP_BY_OPTIONS}
          activeGroupBy={groupBy}
          onGroupByChange={setGroupBy}
          activeGroupByLevels={groupByLevels}
          onGroupByLevelChange={setGroupByLevel}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={v => { setDateFrom(v); setPage(1); }}
          onDateToChange={v => { setDateTo(v); setPage(1); }}
        />
        <div className="flex items-center gap-2 shrink-0">
          {!isMobile && (
            <ExportButton
              onExcel={() => exportToExcel({
                fileName: 'Ventas', title: 'Reporte de Ventas',
                columns: VENTAS_COLUMNS,
                data: ventas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })),
                totals: { total: totalVentas, saldo_pendiente: totalSaldo },
              })}
              onPDF={() => exportToPDF({
                fileName: 'Ventas', title: 'Reporte de Ventas',
                columns: VENTAS_COLUMNS,
                data: ventas.map(v => ({ ...v, cliente_nombre: (v.clientes as { nombre?: string } | null)?.nombre || '' })),
                totals: { total: totalVentas, saldo_pendiente: totalSaldo },
              })}
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

      {/* Summary bar */}
      {!isLoading && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
          <span><strong className="text-foreground">{total}</strong> ventas</span>
          <span>Total: <strong className="text-foreground">{fmt(totalVentas)}</strong></span>
          {totalSaldo > 0 && (
            <span>Saldo: <strong className="text-warning">{fmt(totalSaldo)}</strong></span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 10} /></div>
      ) : isMobile ? (
        /* Mobile card list */
        <div className="space-y-2">
          {pageData.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No hay ventas. Crea la primera.</div>
          )}
          {pageData.map((v) => {
            const cliente = clientesList?.find(c => c.id === v.cliente_id);
            const openWa = async (e: React.MouseEvent) => {
              e.stopPropagation();
              setGeneratingPdf(v.id);
              try {
                const { blob, fileName, caption } = await generateVentaPdfById(v.id, empresa?.id);
                setWaPdfBlob(blob);
                setWaPdfName(fileName);
                setWaPhone(cliente?.telefono ?? '');
                setWaMessage(caption);
                setWaOpen(true);
              } catch (err: any) {
                toast.error(err.message || 'Error generando PDF');
              } finally {
                setGeneratingPdf(null);
              }
            };
            return (
              <MobileListCard
                key={v.id}
                title={v.clientes?.nombre || (v.cliente_id ? '—' : 'Público en general')}
                subtitle={`${v.folio || v.id.slice(0, 8)} · ${TIPO_LABELS[v.tipo] || v.tipo}`}
                badge={
                  <div className="flex items-center gap-1">
                    <StatusChip status={v.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <button className="p-1 rounded hover:bg-accent"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/ventas/${v.id}`); }}>
                          <FileText className="h-3.5 w-3.5 mr-2" /> Ver detalle
                        </DropdownMenuItem>
                        {v.status !== 'borrador' && v.saldo_pendiente > 0 && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cobranza`); }}>
                            <Banknote className="h-3.5 w-3.5 mr-2" /> Cobrar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={openWa} disabled={generatingPdf === v.id}>
                          {generatingPdf === v.id ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 mr-2" />}
                          {generatingPdf === v.id ? 'Generando PDF...' : 'WhatsApp'}
                        </DropdownMenuItem>
                        {(v.status === 'borrador' || (v.status === 'cancelado' && canDelete)) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(v.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                }
                onClick={() => navigate(`/ventas/${v.id}`)}
                fields={[
                  { label: 'Fecha', value: fmtDate(v.fecha) },
                  { label: 'Total', value: fmtCurrency(v.total) },
                  { label: 'Condición', value: CONDICION_LABELS[v.condicion_pago] || v.condicion_pago },
                  ...(v.saldo_pendiente > 0 ? [{ label: 'Saldo', value: <span className="text-warning">{fmtCurrency(v.saldo_pendiente)}</span> }] : []),
                ]}
              />
            );
          })}
          {total > 0 && (
            <TablePagination
              from={from} to={to} total={total} page={page} totalPages={totalPages}
              pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
              onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)}
            />
          )}

          <WhatsAppPreviewDialog open={waOpen} onClose={() => { setWaOpen(false); setWaPdfBlob(null); }} phone={waPhone} message={waMessage} empresaId={empresa?.id ?? ''} tipo="venta" pdfBlob={waPdfBlob} pdfFileName={waPdfName} />
        </div>
      ) : (
        /* Desktop table with grouping */
        <>
          <GroupedTableWrapper
            groupBy={groupBy}
            groups={groups}
            renderTable={renderTable}
            renderSummary={(items) => (
              <span className="text-[11px] text-muted-foreground font-medium">
                {fmtCurrency(items.reduce((s: number, v: any) => s + (v.total ?? 0), 0))}
              </span>
            )}
          />
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
      </>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La venta y todas sus líneas serán eliminadas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteVenta.mutateAsync(deleteTarget).then(() => toast.success('Venta eliminada')).catch((err: any) => toast.error(err.message));
                setDeleteTarget(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
