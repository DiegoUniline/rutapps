import { useState, useMemo } from 'react';
import { mesActualLocal } from '@/hooks/useListPreferences';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { Search, Banknote, CreditCard, Wallet, Building2, CalendarDays, Filter, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { OdooPagination } from '@/components/OdooPagination';
import DateFilterBar from '@/components/ruta/DateFilterBar';
import { useTablePagination } from '@/hooks/useTablePagination';
import { CxPTabs } from '@/components/CxPTabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { ListaTarjetaMovil, ListaTarjetasMovil, EncabezadoListaMovil, useCargarMasMovil } from '@/components/layout/ListaTarjetaMovil';
import { OdooFilterBar } from '@/components/OdooFilterBar';

const METODO_ICONS: Record<string, typeof Banknote> = {
  efectivo: Banknote,
  transferencia: CreditCard,
  tarjeta: Wallet,
};
const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

const PAGE_SIZE = 25;

function usePagosProveedores(desde: string, hasta: string) {
  const { empresa } = useAuth();
  return useQuery({
    // Filtra fechas en la BD (abre en el mes actual).
    queryKey: ['pagos-proveedores-list', empresa?.id, desde, hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Todas las páginas (antes se cortaba en 1 000 renglones).
      const data = await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('pago_compras')
          .select('*, proveedores(nombre), compras(folio)')
          .eq('empresa_id', empresa!.id);
        if (desde) q = q.gte('fecha', desde);
        if (hasta) q = q.lte('fecha', hasta);
        return q.order('fecha', { ascending: false }).order('id', { ascending: true }).range(from, to);
      });
      return (data ?? []).map((p: any) => ({
        id: p.id,
        fecha: p.fecha,
        monto: p.monto ?? 0,
        metodo_pago: p.metodo_pago ?? 'efectivo',
        referencia: p.referencia,
        notas: p.notas,
        proveedor: p.proveedores?.nombre ?? 'Sin proveedor',
        proveedor_id: p.proveedor_id,
        compra_folio: p.compras?.folio ?? '—',
        compra_id: p.compra_id,
        created_at: p.created_at,
      }));
    },
  });
}

export default function PagosProveedoresPage() {
  const { fmt } = useCurrency();

  const [search, setSearch] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [filtroProveedor, setFiltroProveedor] = useState('todos');
  const [groupBy, setGroupBy] = useState<'ninguno' | 'proveedor' | 'metodo' | 'mes'>('ninguno');
  
  // Mes actual en hora local (antes toISOString usaba UTC y de noche cambiaba de día).
  const [desde, setDesde] = useState(() => mesActualLocal().from);
  const [hasta, setHasta] = useState(() => mesActualLocal().to);
  const { data: pagos, isLoading } = usePagosProveedores(desde, hasta);
  const [page, setPage] = useState(0);

  const proveedores = useMemo(() => {
    if (!pagos) return [];
    const set = new Map<string, string>();
    pagos.forEach(p => { if (p.proveedor_id) set.set(p.proveedor_id, p.proveedor); });
    return Array.from(set.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [pagos]);

  const filtered = useMemo(() => {
    if (!pagos) return [];
    return pagos.filter(p => {
      if (desde && p.fecha < desde) return false;
      if (hasta && p.fecha > hasta) return false;
      if (filtroMetodo !== 'todos' && p.metodo_pago !== filtroMetodo) return false;
      if (filtroProveedor !== 'todos' && p.proveedor_id !== filtroProveedor) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.proveedor.toLowerCase().includes(s) || (p.referencia ?? '').toLowerCase().includes(s) || (p.compra_folio ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [pagos, desde, hasta, filtroMetodo, filtroProveedor, search]);

  const totalMonto = useMemo(() => filtered.reduce((s, p) => s + p.monto, 0), [filtered]);

  const grouped = useMemo(() => {
    if (groupBy === 'ninguno') return null;
    const map = new Map<string, typeof filtered>();
    filtered.forEach(p => {
      let key: string;
      if (groupBy === 'proveedor') key = p.proveedor;
      else if (groupBy === 'metodo') key = METODO_LABELS[p.metodo_pago] ?? p.metodo_pago;
      else key = p.fecha.slice(0, 7); // mes YYYY-MM
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupBy]);

  const paged = useMemo(() => {
    if (grouped) return null;
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filtered, page, grouped]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const isMobile = useIsMobile();
  const movil = useCargarMasMovil(filtered, `${search}|${filtroMetodo}|${filtroProveedor}|${desde}|${hasta}`);

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="p-2 md:p-4">
    {/* D-037: una sola hoja blanca */}
    <div className="bg-card border border-border rounded-xl shadow-sm px-3 md:px-4 pb-3 space-y-3">
      <div className="-mx-3 md:-mx-4"><CxPTabs /></div>
      {isMobile ? (
        <>
          <EncabezadoListaMovil titulo="Pagos a proveedores">
            <OdooFilterBar
              search={search}
              onSearchChange={v => { setSearch(v); setPage(0); }}
              placeholder="Buscar pagos"
              filterOptions={[
                { key: 'metodo', label: 'Método', options: Object.entries(METODO_LABELS).map(([value, label]) => ({ value, label })) },
                { key: 'proveedor', label: 'Proveedor', options: proveedores.map(p => ({ value: p.id, label: p.nombre })) },
              ]}
              activeFilters={{
                ...(filtroMetodo !== 'todos' ? { metodo: [filtroMetodo] } : {}),
                ...(filtroProveedor !== 'todos' ? { proveedor: [filtroProveedor] } : {}),
              }}
              onToggleFilter={(key, val) => {
                if (key === 'metodo') setFiltroMetodo(prev => prev === val ? 'todos' : val);
                if (key === 'proveedor') setFiltroProveedor(prev => prev === val ? 'todos' : val);
                setPage(0);
              }}
              onSetFilter={(key, vals) => {
                const v = vals[vals.length - 1] ?? 'todos';
                if (key === 'metodo') setFiltroMetodo(v);
                if (key === 'proveedor') setFiltroProveedor(v);
                setPage(0);
              }}
              onClearFilters={() => { setFiltroMetodo('todos'); setFiltroProveedor('todos'); setPage(0); }}
              dateFrom={desde}
              dateTo={hasta}
              onDateRangeChange={(f, t) => { setDesde(f); setHasta(t); setPage(0); }}
              onDateFromChange={v => { setDesde(v); setPage(0); }}
              onDateToChange={v => { setHasta(v); setPage(0); }}
            />
          </EncabezadoListaMovil>
          <ListaTarjetasMovil aLoAncho vacia={movil.total === 0} mensajeVacio="No se encontraron pagos en el período seleccionado" {...movil}>
            {movil.visibles.map(p => (
              <ListaTarjetaMovil
                key={p.id}
                titulo={p.proveedor}
                linea2={<>{fmtDate(p.fecha)} · {METODO_LABELS[p.metodo_pago] ?? p.metodo_pago}<span className="text-xs"> · {[p.compra_folio, p.referencia].filter(Boolean).join(' · ')}</span></>}
                pildora={fmt(p.monto)}
                tono="exito"
              />
            ))}
          </ListaTarjetasMovil>
        </>
      ) : (<>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-card border border-border rounded-xl p-2.5 sm:p-4 flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 hidden sm:flex items-center justify-center shrink-0">
            <Banknote className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Total pagado</p>
            <p className="text-sm sm:text-lg font-bold text-foreground truncate">{fmt(totalMonto)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-2.5 sm:p-4 flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-accent hidden sm:flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Pagos realizados</p>
            <p className="text-sm sm:text-lg font-bold text-foreground truncate">{filtered.length}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-2.5 sm:p-4 flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-accent hidden sm:flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Proveedores</p>
            <p className="text-sm sm:text-lg font-bold text-foreground truncate">{new Set(filtered.map(p => p.proveedor_id)).size}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar proveedor, referencia, folio..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateFilterBar desde={desde} hasta={hasta} onDesdeChange={v => { setDesde(v); setPage(0); }} onHastaChange={v => { setHasta(v); setPage(0); }} />
          <Select value={filtroMetodo} onValueChange={v => { setFiltroMetodo(v); setPage(0); }}>
            <SelectTrigger className="flex-1 min-w-[140px] sm:flex-none sm:w-[150px] h-9 text-xs"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los métodos</SelectItem>
              <SelectItem value="efectivo">Efectivo</SelectItem>
              <SelectItem value="transferencia">Transferencia</SelectItem>
              <SelectItem value="tarjeta">Tarjeta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroProveedor} onValueChange={v => { setFiltroProveedor(v); setPage(0); }}>
            <SelectTrigger className="flex-1 min-w-[140px] sm:flex-none sm:w-[180px] h-9 text-xs"><Building2 className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los proveedores</SelectItem>
              {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={v => { setGroupBy(v as any); setPage(0); }}>
            <SelectTrigger className="flex-1 min-w-[140px] sm:flex-none sm:w-[150px] h-9 text-xs"><Layers className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">Sin agrupar</SelectItem>
              <SelectItem value="proveedor">Por proveedor</SelectItem>
              <SelectItem value="metodo">Por método</SelectItem>
              <SelectItem value="mes">Por mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No se encontraron pagos en el período seleccionado</div>
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map(([key, items]) => {
            const groupTotal = items.reduce((s, p) => s + p.monto, 0);
            return (
              <div key={key} className="border border-border rounded-xl overflow-hidden">
                <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground">{key}</span>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">{items.length} pagos</Badge>
                    <span className="font-bold text-sm text-primary">{fmt(groupTotal)}</span>
                  </div>
                </div>
                <PagosTable rows={items} fmt={fmt} />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="md:border md:border-border md:rounded-xl overflow-hidden">
            <PagosTable rows={paged ?? []} fmt={fmt} sinMarco />
          </div>
          {totalPages > 1 && (
            <OdooPagination
              from={page * PAGE_SIZE + 1}
              to={Math.min((page + 1) * PAGE_SIZE, filtered.length)}
              total={filtered.length}
              onPrev={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            />
          )}
        </>
      )}
      </>)}
    </div>
    </div>
  );
}

function PagosTable({ rows, fmt, sinMarco }: { rows: any[]; fmt: (n: number) => string; sinMarco?: boolean }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className={cn('space-y-2', !sinMarco && 'p-2')}>
        {rows.map(p => {
          const Icon = METODO_ICONS[p.metodo_pago] ?? Banknote;
          return (
            <ListaTarjetaMovil
              key={p.id}
              titulo={p.proveedor}
              subtitulo={p.compra_folio}
              estado={
                <Badge variant="outline" className="text-[11px] gap-1">
                  <Icon className="h-3 w-3" />
                  {METODO_LABELS[p.metodo_pago] ?? p.metodo_pago}
                </Badge>
              }
              campos={[
                { label: 'Fecha', value: fmtDate(p.fecha) },
                { label: 'Monto', value: <span className="text-primary font-bold">{fmt(p.monto)}</span> },
                ...(p.referencia ? [{ label: 'Referencia', value: p.referencia, className: 'col-span-2' }] : []),
              ]}
            />
          );
        })}
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/30 text-left">
          <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Fecha</th>
          <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Proveedor</th>
          <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Compra</th>
          <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Método</th>
          <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Referencia</th>
          <th className="px-4 py-2 text-xs font-medium text-muted-foreground text-right">Monto</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map(p => {
          const Icon = METODO_ICONS[p.metodo_pago] ?? Banknote;
          return (
            <tr key={p.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 text-xs">{fmtDate(p.fecha)}</td>
              <td className="px-4 py-2.5 text-xs font-medium">{p.proveedor}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.compra_folio}</td>
              <td className="px-4 py-2.5">
                <Badge variant="outline" className="text-[11px] gap-1">
                  <Icon className="h-3 w-3" />
                  {METODO_LABELS[p.metodo_pago] ?? p.metodo_pago}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.referencia || '—'}</td>
              <td className="px-4 py-2.5 text-xs font-bold text-right text-primary">{fmt(p.monto)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
