import { useState, useMemo, useEffect } from 'react';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, MessageCircle, Printer, Pencil, Ban, X, Trash2 } from 'lucide-react';
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
import { usePinAuth } from '@/hooks/usePinAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';



function useCobros() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cobros-desktop', empresa?.id],
    enabled: !!empresa?.id,
    networkMode: 'always',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const cached = await offlineDb.cobros
            .where('empresa_id').equals(empresa!.id).toArray();
          return cached as any[];
        } catch { return [] as any[]; }
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await readCache();
        return cached;
      }

      try {
        const { data, error } = await supabase
          .from('cobros')
          .select('*, clientes(id, nombre, telefono), cobro_aplicaciones(venta_id, monto_aplicado, ventas(id, folio, tipo))')
          .eq('empresa_id', empresa!.id)
          .order('fecha', { ascending: false });
        if (error) throw error;
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          // Limpieza total: registros viejos sin empresa_id o de otra sesión
          // quedaban "fantasma" en la lista aunque el servidor ya no los tenga.
          await offlineDb.cobros.clear();
          if (data && data.length > 0) await offlineDb.cobros.bulkPut(data as any[]);
        } catch { /* cache best-effort */ }

        return data ?? [];
      } catch (err) {
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            const { offlineDb } = await import('@/lib/offlineDb');
            await offlineDb.cobros.clear();
          } catch { /* cache best-effort */ }
          return [];
        }
        const cached = await readCache();
        if (cached.length > 0) return cached;
        throw err;
      }
    },
  });
}

// Re-exported shared hook (offline-first) for filter dropdowns.
import { useVendedoresForFilter as useVendedoresFilter } from '@/hooks/useFilterOptions';
function useVendedores() {
  const q = useVendedoresFilter();
  // CobranzaPage expects records with user_id+nombre; map accordingly.
  return {
    ...q,
    data: (q.data ?? []).map(v => ({ user_id: v.user_id ?? v.id, nombre: v.nombre })),
  };
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
  // Realtime: refresca cobranza al haber pagos o cambios de ventas en otro dispositivo
  useRealtimeInvalidate({ table: 'cobros', empresaId: empresa?.id, queryKeys: [['cobros-desktop'], ['cxc'], ['saldos']] });
  useRealtimeInvalidate({ table: 'ventas', empresaId: empresa?.id, queryKeys: [['cobros-desktop'], ['cxc'], ['saldos']] });
  const isMobile = useIsMobile();
  const { fmt: fmtC } = useCurrency();
  const qc = useQueryClient();
  const { data: cobros, isLoading } = useCobros();
  const { data: vendedores } = useVendedores();
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!empresa?.id) return;
    qc.invalidateQueries({ queryKey: ['cobros-desktop', empresa.id] });
  }, [empresa?.id, qc]);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!empresa?.id || isLoading || (cobros?.length ?? 0) > 0) return;
    import('@/lib/offlineDb')
      .then(({ offlineDb }) => offlineDb.cobros.clear())
      .catch(() => undefined);
  }, [empresa?.id, isLoading, cobros?.length]);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('cobranza');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editCobro, setEditCobro] = useState<any | null>(null);
  const [cancelCobro, setCancelCobro] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { requestPin, PinDialog } = usePinAuth();


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

  // KPIs use full filtered data (cancelled excluded from money totals)
  const totalCobrado = filtered.reduce((s, c) => s + ((c as any).status !== 'cancelado' ? (c.monto ?? 0) : 0), 0);

  // Visual pagination — only affects table rendering
  const pagination = useTablePagination(filtered);

  // Reset page on filter change is handled by deps: filtered changes → useTablePagination clamps page

  // Grouping uses ALL filtered items (not paginated) so groups reflect the full result set
  const groupSource = groupBy ? filtered : pagination.paginatedItems;
  const groups = useMemo(() => groupData(groupSource, groupBy, (item: any, key: string) => {
    if (key === 'cliente') return (item.clientes as any)?.nombre ?? 'Sin cliente';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    if (key === 'metodo') return item.metodo_pago ?? 'Sin método';
    if (key === 'vendedor') return vendedorMap.get(item.user_id) || 'Sin vendedor';
    return '';
  }, groupByLevels), [groupSource, groupBy, groupByLevels, vendedorMap]);

  const CobrosTable = ({ items, selected, onToggleOne }: { items: any[]; selected?: Set<string>; onToggleOne?: (id: string) => void }) => {
    const sel = selected ?? new Set<string>();
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
            {onToggleOne && (
              <TableHead className="w-10 text-center">
                <input
                  type="checkbox"
                  className="rounded border-input h-4 w-4"
                  checked={items.length > 0 && items.every(c => sel.has(c.id))}
                  onChange={() => {
                    const allInGroupSelected = items.every(c => sel.has(c.id));
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      items.forEach(c => {
                        if (allInGroupSelected) next.delete(c.id);
                        else next.add(c.id);
                      });
                      return next;
                    });
                  }}
                />
              </TableHead>
            )}
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
            const isSel = sel.has(c.id);
            return (
            <TableRow key={c.id} className={cn((c as any).status === 'cancelado' ? 'opacity-50' : '', isSel ? 'bg-primary/5' : '')}>
              {onToggleOne && (
                <TableCell className="w-10 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-input h-4 w-4"
                    checked={isSel}
                    onChange={() => onToggleOne(c.id)}
                  />
                </TableCell>
              )}
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
            <TableRow><TableCell colSpan={onToggleOne ? 10 : 9} className="text-center py-8 text-muted-foreground">Sin cobros</TableCell></TableRow>
          )}
        </TableBody>
        {items.length > 0 && (
          <tfoot>
            <TableRow className="bg-card border-t border-border font-semibold">
              <TableCell colSpan={onToggleOne ? 8 : 7} className="text-[12px] text-muted-foreground">{items.length} cobros</TableCell>
              <TableCell className="text-right text-[12px] text-success font-bold tabular-nums">{fmtC(items.reduce((s: number, c: any) => s + ((c as any).status !== 'cancelado' ? (c.monto ?? 0) : 0), 0))}</TableCell>
              <TableCell />
            </TableRow>
          </tfoot>
        )}
      </Table>
    );
  };

  // ─── Multi-select state ──────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cancelManyOpen, setCancelManyOpen] = useState(false);
  const [cancellingMany, setCancellingMany] = useState(false);

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = pagination.paginatedItems.map((c: any) => c.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleCancelMany = async () => {
    const ids = Array.from(selectedIds);
    const activeIds = ids.filter(id => {
      const c = (cobros ?? []).find((c: any) => c.id === id);
      return c && (c as any).status !== 'cancelado';
    });
    if (activeIds.length === 0) { setCancelManyOpen(false); return; }
    setCancellingMany(true);
    try {
      const { error } = await supabase.from('cobros').update({ status: 'cancelado' } as any).in('id', activeIds);
      if (error) throw error;
      toast.success(`${activeIds.length} cobro(s) cancelado(s). Saldos actualizados.`);
      qc.invalidateQueries({ queryKey: ['cobros-desktop', empresa?.id] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      setSelectedIds(new Set());
      setCancelManyOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al cancelar');
    } finally {
      setCancellingMany(false);
    }
  };

  const handlePrintMany = () => {
    for (const id of selectedIds) {
      const c = (cobros ?? []).find((c: any) => c.id === id);
      if (c) handlePrintCobro(c);
    }
  };

  const handleWaMany = () => {
    const selectedCobros = (cobros ?? []).filter((c: any) => selectedIds.has(c.id));
    if (selectedCobros.length === 0) return;
    if (selectedCobros.length === 1) {
      openWaCobro(selectedCobros[0]);
      return;
    }
    openWaCobro(selectedCobros[0]);
    toast.info(`Se abrió WhatsApp para el primer cobro seleccionado. Enviarás ${selectedCobros.length} recibos uno por uno.`);
  };

  const handleDeleteCancelledMany = () => {
    const selectedCancelled = (cobros ?? []).filter((c: any) => selectedIds.has(c.id) && (c as any).status === 'cancelado');
    if (selectedCancelled.length === 0) {
      toast.error('Solo se pueden eliminar cobros cancelados. Cancela primero los seleccionados.');
      return;
    }
    requestPin(
      `Eliminar ${selectedCancelled.length} cobro(s) cancelado(s)`,
      'Esta acción es permanente. Ingresa tu PIN de administrador para continuar.',
      async () => {
        try {
          const ids = selectedCancelled.map(c => c.id);
          // Delete applications first to avoid FK issues, then the cobros
          await supabase.from('cobro_aplicaciones').delete().in('cobro_id', ids);
          const { error } = await supabase.from('cobros').delete().in('id', ids);
          if (error) throw error;
          toast.success(`${ids.length} cobro(s) eliminado(s) permanentemente.`);
          qc.invalidateQueries({ queryKey: ['cobros-desktop', empresa?.id] });
          qc.invalidateQueries({ queryKey: ['ventas'] });
          qc.invalidateQueries({ queryKey: ['cxc'] });
          qc.invalidateQueries({ queryKey: ['saldos'] });
          setSelectedIds(new Set());
        } catch (e: any) {
          toast.error(e.message || 'Error al eliminar');
        }
      }
    );
  };

  const renderTable = (items: any[]) => <CobrosTable items={items} selected={selectedIds} onToggleOne={toggleSelectOne} />;

  const renderSummary = (items: any[]) => {
    const total = items.reduce((s: number, c: any) => s + ((c as any).status !== 'cancelado' ? (c.monto ?? 0) : 0), 0);
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

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-primary">{selectedIds.size} seleccionado(s)</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground hover:text-foreground" onClick={handlePrintMany}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-[#25D366] hover:text-[#25D366]/80" onClick={handleWaMany}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={() => setCancelManyOpen(true)}>
            <Ban className="h-4 w-4" /> Cancelar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={handleDeleteCancelledMany} title="Solo cobros cancelados — requiere PIN admin">
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-2">
          {pagination.paginatedItems.map(c => (
            <MobileListCard
              key={c.id}
              title={(c.clientes as any)?.nombre ?? '—'}
              subtitle={fmtDate(c.fecha)}
              leading={
                <input
                  type="checkbox"
                  className="rounded border-input h-4 w-4"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleSelectOne(c.id)}
                />
              }
              badge={
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{c.metodo_pago}</Badge>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-[#25D366]" onClick={e => { e.stopPropagation(); openWaCobro(c); }}>
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  {(c as any).status !== 'cancelado' && (
                    <>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={e => { e.stopPropagation(); setEditCobro(c); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); setCancelCobro(c); }}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    </>
                  )}
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

      <CobroEditDialog open={!!editCobro} onClose={() => setEditCobro(null)} cobro={editCobro} />

      <AlertDialog open={!!cancelCobro} onOpenChange={(v) => !v && setCancelCobro(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cobro</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará el cobro por {cancelCobro ? fmtC(cancelCobro.monto) : ''} y se restaurará el saldo pendiente de la(s) venta(s) asociadas. Esta acción se puede deshacer creando un nuevo cobro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelCobro} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? 'Cancelando...' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelManyOpen} onOpenChange={(v) => !v && setCancelManyOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {selectedIds.size} cobro(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelarán los cobros seleccionados y se restaurarán los saldos pendientes de las ventas asociadas. Esta acción se puede deshacer creando nuevos cobros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingMany}>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelMany} disabled={cancellingMany} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancellingMany ? 'Cancelando...' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PinDialog />
    </div>
  );
}

