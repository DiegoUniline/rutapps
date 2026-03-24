import { useState, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import SearchableSelect from '@/components/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, MessageCircle, FileText, Banknote, Loader2, ShoppingCart } from 'lucide-react';

import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { MobileListCard } from '@/components/MobileListCard';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useVentasPaginated } from '@/hooks/useVentas';
import { useClientes } from '@/hooks/useClientes';
import { useIsMobile } from '@/hooks/use-mobile';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { cn, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';

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

const PAGE_SIZE = 80;

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

export default function VentasListPage() {
  const { profile, empresa } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { fmt: fmtCurrency } = useCurrency();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  
  const { data: ventasData, isLoading } = useVentasPaginated(search, statusFilter, tipoFilter, page, PAGE_SIZE);
  const { data: clientesList } = useClientes();

  // WhatsApp state
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waPdfBlob, setWaPdfBlob] = useState<Blob | null>(null);
  const [waPdfName, setWaPdfName] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  const ventas = ventasData?.rows ?? [];
  const total = ventasData?.total ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = ventas;
  const allSelected = pageData.length > 0 && pageData.every(v => selected.has(v.id));

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

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Ventas <HelpButton title={HELP.ventas.title} sections={HELP.ventas.sections} /></h1>

      <>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por folio o cliente..."
        >
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todos los tipos' },
              { value: 'pedido', label: 'Pedido' },
              { value: 'venta_directa', label: 'Venta directa' },
            ]}
            value={tipoFilter}
            onChange={val => { setTipoFilter(val); setPage(1); }}
            placeholder="Tipo..."
          />
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todos los estados' },
              { value: 'borrador', label: 'Borrador' },
              { value: 'confirmado', label: 'Confirmado' },
              { value: 'entregado', label: 'Entregado' },
              { value: 'facturado', label: 'Facturado' },
              { value: 'cancelado', label: 'Cancelado' },
            ]}
            value={statusFilter}
            onChange={val => { setStatusFilter(val); setPage(1); }}
            placeholder="Estado..."
          />
        </OdooFilterBar>
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
          <button onClick={() => navigate('/ventas/nuevo')} className="btn-odoo-primary shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nueva venta
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {!isLoading && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
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
                title={v.clientes?.nombre ?? '—'}
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
            <OdooPagination from={from} to={to} total={total} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
          )}

          <WhatsAppPreviewDialog open={waOpen} onClose={() => { setWaOpen(false); setWaPdfBlob(null); }} phone={waPhone} message={waMessage} empresaId={empresa?.id ?? ''} tipo="venta" pdfBlob={waPdfBlob} pdfFileName={waPdfName} />
        </div>
      ) : (
        /* Desktop table */
        <div className="bg-card border border-border rounded overflow-x-auto">
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
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-muted-foreground">No hay ventas. Crea la primera.</td>
                </tr>
              )}
              {pageData.map((v: any) => (
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
                  <td className="py-2 px-3 max-w-[180px] truncate">{v.clientes?.nombre ?? '—'}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && (
            <OdooPagination from={from} to={to} total={total} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
          )}
        </div>
      )}
      </>
    </div>
  );
}
