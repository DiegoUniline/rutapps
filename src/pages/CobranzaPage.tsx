import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, MessageCircle, Printer, Pencil, Ban } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CobroEditDialog } from '@/components/cobranza/CobroEditDialog';
import { toast } from 'sonner';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MobileListCard } from '@/components/MobileListCard';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { OdooFilterBar, type FilterOption, type GroupByOption } from '@/components/OdooFilterBar';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { TablePagination } from '@/components/TablePagination';
import { useTablePagination } from '@/hooks/useTablePagination';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { printTicket } from '@/lib/printTicketUtil';
import { buildCobroTicketData } from '@/lib/cobroTicket';
import { ClienteLink } from '@/components/links/EntityLinks';
import { Link } from 'react-router-dom';
import { useSortableTable, SortableTh } from '@/hooks/useSortableTable';
import { CobranzaTabs } from '@/components/CobranzaTabs';



function useCobros() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cobros-desktop', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobros')
        .select('*, clientes(id, nombre, telefono), cobro_aplicaciones(venta_id, monto_aplicado, ventas(id, folio, tipo))')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useVendedores() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-cobranza', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, nombre')
        .eq('empresa_id', empresa!.id);
      return data ?? [];
    },
  });
}

function buildCobroMessage(cobro: any, fmtMoney: (n: number) => string) {
  const clienteNombre = (cobro.clientes as any)?.nombre ?? '—';
  return `✅ *Recibo de Cobro*\n\n` +
    `Cliente: ${clienteNombre}\n` +
    `Fecha: ${fmtDate(cobro.fecha)}\n` +
    `Método: ${cobro.metodo_pago}\n` +
    (cobro.referencia ? `Referencia: ${cobro.referencia}\n` : '') +
    `\n💰 *Monto: ${fmtMoney(cobro.monto)}*\n\n` +
    `Gracias por su pago.`;
}

const STATUS_COBRO_OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'cancelado', label: 'Cancelado' },
];

const METODO_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

const GROUP_BY_OPTIONS: GroupByOption[] = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
  { value: 'fecha_anio', label: 'Año' },
  { value: 'fecha_mes', label: 'Mes' },
  { value: 'metodo', label: 'Método de pago' },
  { value: 'vendedor', label: 'Vendedor' },
];

export default function CobranzaPage() {
  const { empresa } = useAuth();
  const isMobile = useIsMobile();
  const { fmt: fmtC } = useCurrency();
  const qc = useQueryClient();
  const { data: cobros, isLoading } = useCobros();
  const { data: vendedores } = useVendedores();
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('cobranza');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editCobro, setEditCobro] = useState<any | null>(null);
  const [cancelCobro, setCancelCobro] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelCobro = async () => {
    if (!cancelCobro) return;
    setCancelling(true);
    try {
      const { error } = await supabase.from('cobros').update({ status: 'cancelado' } as any).eq('id', cancelCobro.id);
      if (error) throw error;
      toast.success('Cobro cancelado. Saldos actualizados.');
      qc.invalidateQueries({ queryKey: ['cobros-desktop', empresa?.id] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      setCancelCobro(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al cancelar');
    } finally {
      setCancelling(false);
    }
  };


  const vendedorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendedores ?? []) m.set(v.user_id, v.nombre ?? '');
    return m;
  }, [vendedores]);

  // WhatsApp preview state
  const [waOpen, setWaOpen] = useState(false);
  const [waMessage, setWaMessage] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [waRefId, setWaRefId] = useState<string | undefined>();

  const openWaCobro = (cobro: any) => {
    setWaMessage(buildCobroMessage(cobro, fmtC));
    setWaPhone((cobro.clientes as any)?.telefono ?? '');
    setWaRefId(cobro.id);
    setWaOpen(true);
  };

  const handlePrintCobro = (cobro: any) => {
    if (!empresa) return;
    const ticketData = buildCobroTicketData({
      empresa: {
        nombre: empresa.nombre ?? '',
        rfc: (empresa as any).rfc,
        razon_social: (empresa as any).razon_social,
        direccion: (empresa as any).direccion,
        colonia: (empresa as any).colonia,
        ciudad: (empresa as any).ciudad,
        estado: (empresa as any).estado,
        cp: (empresa as any).cp,
        telefono: (empresa as any).telefono,
        email: (empresa as any).email,
        logo_url: (empresa as any).logo_url,
        moneda: (empresa as any).moneda,
        notas_ticket: (empresa as any).notas_ticket,
        ticket_campos: (empresa as any).ticket_campos,
      },
      cobro: {
        id: cobro.id,
        fecha: cobro.fecha,
        monto: cobro.monto,
        metodo_pago: cobro.metodo_pago,
        referencia: cobro.referencia,
        notas: cobro.notas,
      },
      clienteNombre: (cobro.clientes as any)?.nombre ?? 'Sin cliente',
    });
    printTicket(ticketData, { ticketAncho: (empresa as any).ticket_ancho ?? '80' });
  };

  // Build dynamic filter options
  const clienteOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of cobros ?? []) {
      const n = (c.clientes as any)?.nombre;
      if (n) names.add(n);
    }
    return Array.from(names).sort().map(n => ({ value: n, label: n }));
  }, [cobros]);

  const vendedorFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cobros ?? []) if (c.user_id) ids.add(c.user_id);
    const opts = Array.from(ids).map(id => ({ value: id, label: vendedorMap.get(id) || id.slice(0, 8) })).sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [cobros, vendedorMap]);

  const filterDefs: FilterOption[] = useMemo(() => [
    { key: 'status', label: 'Estado', options: STATUS_COBRO_OPTIONS },
    { key: 'metodo', label: 'Método de pago', options: METODO_OPTIONS },
    { key: 'cliente', label: 'Cliente', options: clienteOptions },
    { key: 'vendedor', label: 'Vendedor', options: vendedorFilterOptions },
  ], [clienteOptions, vendedorFilterOptions]);

  // Apply filters — this is the FULL filtered list used for KPIs
  const filtered = useMemo(() => {
    let list = cobros ?? [];
    const statusF = filters.status;
    if (statusF && statusF.length > 0) list = list.filter(c => statusF.includes((c as any).status ?? 'activo'));
    else list = list.filter(c => (c as any).status !== 'cancelado');
    const metodo = filters.metodo;
    if (metodo && metodo.length > 0) list = list.filter(c => metodo.includes(c.metodo_pago));
    const cliente = filters.cliente;
    if (cliente && cliente.length > 0) list = list.filter(c => cliente.includes((c.clientes as any)?.nombre ?? ''));
    const vendedor = filters.vendedor;
    if (vendedor && vendedor.length > 0) list = list.filter(c => vendedor.includes(c.user_id));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.clientes as any)?.nombre?.toLowerCase().includes(q) || c.referencia?.toLowerCase().includes(q));
    }
    if (dateFrom) list = list.filter(c => c.fecha >= dateFrom);
    if (dateTo) list = list.filter(c => c.fecha <= dateTo);
    return list;
  }, [cobros, filters, search, dateFrom, dateTo]);

  // KPIs use full filtered data
  const totalCobrado = filtered.reduce((s, c) => s + (c.monto ?? 0), 0);

  // Visual pagination — only affects table rendering
  const pagination = useTablePagination(filtered);

  // Reset page on filter change is handled by deps: filtered changes → useTablePagination clamps page

  // Grouping uses paginated items for display
  const groups = useMemo(() => groupData(pagination.paginatedItems, groupBy, (item: any, key: string) => {
    if (key === 'cliente') return (item.clientes as any)?.nombre ?? 'Sin cliente';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    if (key === 'metodo') return item.metodo_pago ?? 'Sin método';
    if (key === 'vendedor') return vendedorMap.get(item.user_id) || 'Sin vendedor';
    return '';
  }, groupByLevels), [pagination.paginatedItems, groupBy, groupByLevels, vendedorMap]);

  const CobrosTable = ({ items }: { items: any[] }) => {
    const getFolios = (r: any): { id: string; folio: string }[] => {
      const apps = (r.cobro_aplicaciones ?? []) as any[];
      return apps
        .map(a => ({ id: a.ventas?.id ?? a.venta_id, folio: a.ventas?.folio ?? (a.venta_id ? String(a.venta_id).slice(0, 8) : '') }))
        .filter(x => x.id);
    };
    const { sorted, sort, toggle } = useSortableTable(items, (r, k) => {
      if (k === 'fecha') return r.fecha ?? '';
      if (k === 'folio') return getFolios(r).map(f => f.folio).join(', ');
      if (k === 'cliente') return (r.clientes as any)?.nombre ?? '';
      if (k === 'vendedor') return vendedorMap.get(r.user_id) || '';
      if (k === 'metodo') return r.metodo_pago ?? '';
      if (k === 'referencia') return r.referencia ?? '';
      if (k === 'estado') return (r as any).status === 'cancelado' ? 'cancelado' : 'activo';
      if (k === 'monto') return r.monto ?? 0;
      return r?.[k];
    });
    return (
      <Table className="bg-card">
        <TableHeader>
          <TableRow>
            <SortableTh sortKey="fecha" sort={sort} onToggle={toggle} className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px]">Fecha</SortableTh>
            <SortableTh sortKey="folio" sort={sort} onToggle={toggle} className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px]">Folio</SortableTh>
            <SortableTh sortKey="cliente" sort={sort} onToggle={toggle} className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px]">Cliente</SortableTh>
            <SortableTh sortKey="vendedor" sort={sort} onToggle={toggle} className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px]">Vendedor</SortableTh>
            <SortableTh sortKey="metodo" sort={sort} onToggle={toggle} className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px]">Método</SortableTh>
            <SortableTh sortKey="referencia" sort={sort} onToggle={toggle} className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px]">Referencia</SortableTh>
            <SortableTh sortKey="estado" sort={sort} onToggle={toggle} align="center" className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px] text-center">Estado</SortableTh>
            <SortableTh sortKey="monto" sort={sort} onToggle={toggle} align="right" className="h-12 px-4 align-middle font-medium text-muted-foreground text-[11px] text-right">Monto</SortableTh>
            <TableHead className="text-[11px] text-center w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(c => {
            const folios = getFolios(c);
            return (
            <TableRow key={c.id} className={(c as any).status === 'cancelado' ? 'opacity-50' : ''}>
              <TableCell className="text-[12px] whitespace-nowrap">{fmtDate(c.fecha)}</TableCell>
              <TableCell className="text-[12px] font-mono">
                {folios.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {folios.map(f => (
                      <Link key={f.id} to={`/ventas/${f.id}`} className="text-primary hover:underline">
                        {f.folio}
                      </Link>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium text-[12px]"><ClienteLink id={(c as any).cliente_id ?? (c.clientes as any)?.id}>{(c.clientes as any)?.nombre ?? '—'}</ClienteLink></TableCell>
              <TableCell className="text-[12px] text-muted-foreground">{vendedorMap.get(c.user_id) || '—'}</TableCell>
              <TableCell className="text-[12px]"><Badge variant="outline">{c.metodo_pago}</Badge></TableCell>
              <TableCell className="text-[12px] text-muted-foreground">{c.referencia ?? '—'}</TableCell>
              <TableCell className="text-[12px] text-center"><StatusChip status={(c as any).status === 'cancelado' ? 'cancelado' : 'activo'} /></TableCell>
              <TableCell className="text-right font-bold text-success tabular-nums">{fmtC(c.monto)}</TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-0.5">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => handlePrintCobro(c)} title="Imprimir ticket">
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-[#25D366] hover:text-[#25D366]/80" onClick={() => openWaCobro(c)} title="Enviar recibo por WhatsApp">
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  {(c as any).status !== 'cancelado' && (
                    <>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={() => setEditCobro(c)} title="Editar cobro">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setCancelCobro(c)} title="Cancelar cobro">
                        <Ban className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>

            </TableRow>
            );
          })}
          {items.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin cobros</TableCell></TableRow>
          )}
        </TableBody>
        {items.length > 0 && (
          <tfoot>
            <TableRow className="bg-card border-t border-border font-semibold">
              <TableCell colSpan={7} className="text-[12px] text-muted-foreground">{items.length} cobros</TableCell>
              <TableCell className="text-right text-[12px] text-success font-bold tabular-nums">{fmtC(items.reduce((s: number, c: any) => s + (c.monto ?? 0), 0))}</TableCell>
              <TableCell />
            </TableRow>
          </tfoot>
        )}
      </Table>
    );
  };

  const renderTable = (items: any[]) => <CobrosTable items={items} />;

  const renderSummary = (items: any[]) => {
    const total = items.reduce((s: number, c: any) => s + (c.monto ?? 0), 0);
    return <span className="text-[11px] font-semibold text-success">{fmtC(total)}</span>;
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <CobranzaTabs />
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Banknote className="h-5 w-5" /> Cobranza
        <HelpButton title={HELP.cobranza.title} sections={HELP.cobranza.sections} />
        <VideoHelpButton module="cobranza" />
      </h1>

      {/* Summary — uses full filtered data, NOT paginated */}
      <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2")}>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total cobrado</p>
          <p className="text-2xl font-bold text-success">{fmtC(totalCobrado)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Cobros</p>
          <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
        </div>
      </div>

      {/* Filter bar */}
      <OdooFilterBar
        search={search}
        onSearchChange={v => { setSearch(v); pagination.resetPage(); }}
        placeholder="Buscar cobro..."
        filterOptions={filterDefs}
        activeFilters={filters}
        onToggleFilter={(k, v) => { toggleFilterValue(k, v); pagination.resetPage(); }}
        onSetFilter={(k, v) => { setFilter(k, v); pagination.resetPage(); }}
        groupByOptions={GROUP_BY_OPTIONS}
        activeGroupBy={groupBy}
        onGroupByChange={setGroupBy}
        activeGroupByLevels={groupByLevels}
        onGroupByLevelChange={setGroupByLevel}
        onClearFilters={() => { clearFilters(); setDateFrom(''); setDateTo(''); pagination.resetPage(); }}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={v => { setDateFrom(v); pagination.resetPage(); }}
        onDateToChange={v => { setDateTo(v); pagination.resetPage(); }}
      />

      {isMobile ? (
        <div className="space-y-2">
          {pagination.paginatedItems.map(c => (
            <MobileListCard
              key={c.id}
              title={(c.clientes as any)?.nombre ?? '—'}
              subtitle={fmtDate(c.fecha)}
              badge={
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{c.metodo_pago}</Badge>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-[#25D366]" onClick={e => { e.stopPropagation(); openWaCobro(c); }}>
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              }
              fields={[
                ...(c.referencia ? [{ label: 'Ref', value: c.referencia }] : []),
                { label: 'Monto', value: <span className="text-success font-bold">{fmtC(c.monto)}</span> },
              ]}
            />
          ))}
          {isLoading && <div className="text-center py-8 text-muted-foreground">Cargando...</div>}
          {!isLoading && filtered.length === 0 && <div className="text-center py-8 text-muted-foreground">Sin cobros</div>}
          {pagination.total > 0 && (
            <TablePagination
              from={pagination.from} to={pagination.to} total={pagination.total}
              page={pagination.page} totalPages={pagination.totalPages}
              pageSize={pagination.pageSize} onPageSizeChange={pagination.setPageSize}
              onFirst={pagination.goFirst} onPrev={pagination.goPrev}
              onNext={pagination.goNext} onLast={pagination.goLast}
            />
          )}
        </div>
      ) : (
        <>
          <GroupedTableWrapper
            groupBy={groupBy}
            groups={groups}
            renderTable={renderTable}
            renderSummary={renderSummary}
          />
          {pagination.total > 0 && (
            <TablePagination
              from={pagination.from} to={pagination.to} total={pagination.total}
              page={pagination.page} totalPages={pagination.totalPages}
              pageSize={pagination.pageSize} onPageSizeChange={pagination.setPageSize}
              onFirst={pagination.goFirst} onPrev={pagination.goPrev}
              onNext={pagination.goNext} onLast={pagination.goLast}
            />
          )}
        </>
      )}

      <WhatsAppPreviewDialog
        open={waOpen}
        onClose={() => setWaOpen(false)}
        message={waMessage}
        phone={waPhone}
        empresaId={empresa?.id ?? ''}
        tipo="recibo_cobro"
        referencia_id={waRefId}
      />
    </div>
  );
}
