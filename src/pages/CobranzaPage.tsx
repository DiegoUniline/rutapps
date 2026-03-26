import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Banknote, MessageCircle } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MobileListCard } from '@/components/MobileListCard';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { OdooFilterBar, type FilterOption, type GroupByOption } from '@/components/OdooFilterBar';
import { useListPreferences, groupData } from '@/hooks/useListPreferences';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

function useCobros() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cobros-desktop', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobros')
        .select('*, clientes(nombre, telefono)')
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

function buildCobroMessage(cobro: any) {
  const clienteNombre = (cobro.clientes as any)?.nombre ?? '—';
  return `✅ *Recibo de Cobro*\n\n` +
    `Cliente: ${clienteNombre}\n` +
    `Fecha: ${fmtDate(cobro.fecha)}\n` +
    `Método: ${cobro.metodo_pago}\n` +
    (cobro.referencia ? `Referencia: ${cobro.referencia}\n` : '') +
    `\n💰 *Monto: $${fmtNum(cobro.monto)}*\n\n` +
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
  { value: 'fecha', label: 'Fecha' },
  { value: 'metodo', label: 'Método de pago' },
  { value: 'vendedor', label: 'Vendedor' },
];

export default function CobranzaPage() {
  const { empresa } = useAuth();
  const isMobile = useIsMobile();
  const { fmt: fmtC } = useCurrency();
  const { data: cobros, isLoading } = useCobros();
  const { data: vendedores } = useVendedores();
  const { filters, groupBy, setFilter, toggleFilterValue, setGroupBy, clearFilters } = useListPreferences('cobranza');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
    setWaMessage(buildCobroMessage(cobro));
    setWaPhone((cobro.clientes as any)?.telefono ?? '');
    setWaRefId(cobro.id);
    setWaOpen(true);
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

  // Apply filters
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

  const totalCobrado = filtered.reduce((s, c) => s + (c.monto ?? 0), 0);

  // Grouping
  const groups = useMemo(() => groupData(filtered, groupBy, (item: any, key: string) => {
    if (key === 'cliente') return (item.clientes as any)?.nombre ?? 'Sin cliente';
    if (key === 'fecha') return item.fecha ?? 'Sin fecha';
    if (key === 'metodo') return item.metodo_pago ?? 'Sin método';
    if (key === 'vendedor') return vendedorMap.get(item.user_id) || 'Sin vendedor';
    return '';
  }), [filtered, groupBy, vendedorMap]);

  const renderTable = (items: any[]) => (
    <Table className="bg-card">
      <TableHeader>
       <TableRow>
          <TableHead className="text-[11px]">Fecha</TableHead>
          <TableHead className="text-[11px]">Cliente</TableHead>
          <TableHead className="text-[11px]">Vendedor</TableHead>
          <TableHead className="text-[11px]">Método</TableHead>
          <TableHead className="text-[11px]">Referencia</TableHead>
          <TableHead className="text-[11px]">Estado</TableHead>
          <TableHead className="text-[11px] text-right">Monto</TableHead>
          <TableHead className="text-[11px] text-center w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(c => (
          <TableRow key={c.id} className={(c as any).status === 'cancelado' ? 'opacity-50' : ''}>
            <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
            <TableCell className="font-medium text-[12px]">{(c.clientes as any)?.nombre ?? '—'}</TableCell>
            <TableCell className="text-[12px] text-muted-foreground">{vendedorMap.get(c.user_id) || '—'}</TableCell>
            <TableCell className="text-[12px]"><Badge variant="outline">{c.metodo_pago}</Badge></TableCell>
            <TableCell className="text-[12px] text-muted-foreground">{c.referencia ?? '—'}</TableCell>
            <TableCell className="text-[12px]"><StatusChip status={(c as any).status === 'cancelado' ? 'cancelado' : 'activo'} /></TableCell>
            <TableCell className="text-right font-bold text-success">{fmtC(c.monto)}</TableCell>
            <TableCell className="text-center">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-[#25D366] hover:text-[#25D366]/80" onClick={() => openWaCobro(c)} title="Enviar recibo por WhatsApp">
                <MessageCircle className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {items.length === 0 && (
          <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin cobros</TableCell></TableRow>
        )}
      </TableBody>
      {items.length > 0 && (
        <tfoot>
          <TableRow className="bg-card border-t border-border font-semibold">
            <TableCell colSpan={6} className="text-[12px] text-muted-foreground">{items.length} cobros</TableCell>
            <TableCell className="text-right text-[12px] text-success font-bold">{fmtC(items.reduce((s: number, c: any) => s + (c.monto ?? 0), 0))}</TableCell>
            <TableCell />
          </TableRow>
        </tfoot>
      )}
    </Table>
  );

  const renderSummary = (items: any[]) => {
    const total = items.reduce((s: number, c: any) => s + (c.monto ?? 0), 0);
    return <span className="text-[11px] font-semibold text-success">{fmtC(total)}</span>;
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Banknote className="h-5 w-5" /> Cobranza
        <HelpButton title={HELP.cobranza.title} sections={HELP.cobranza.sections} />
      </h1>

      {/* Summary */}
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
        onSearchChange={setSearch}
        placeholder="Buscar cobro..."
        filterOptions={filterDefs}
        activeFilters={filters}
        onToggleFilter={toggleFilterValue}
        onSetFilter={setFilter}
        groupByOptions={GROUP_BY_OPTIONS}
        activeGroupBy={groupBy}
        onGroupByChange={setGroupBy}
        onClearFilters={() => { clearFilters(); setDateFrom(''); setDateTo(''); }}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      {isMobile ? (
        <div className="space-y-2">
          {filtered.map(c => (
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
        </div>
      ) : (
        <GroupedTableWrapper
          groupBy={groupBy}
          groups={groups}
          renderTable={renderTable}
          renderSummary={renderSummary}
        />
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
