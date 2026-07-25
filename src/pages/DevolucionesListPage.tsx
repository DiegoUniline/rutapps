import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, Filter, X, Search, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OdooPagination } from '@/components/OdooPagination';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate } from '@/lib/utils';
import { usePermisos } from '@/hooks/usePermisos';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { MermaConfigDialog } from '@/components/devoluciones/MermaConfigDialog';

const MOTIVO_LABELS: Record<string, string> = { no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro' };
const ACCION_LABELS: Record<string, string> = { reposicion: 'Reposición', nota_credito: 'Nota crédito', descuento_venta: 'Desc. venta', devolucion_dinero: 'Dev. dinero' };
const MOTIVOS = ['no_vendido','dañado','caducado','error_pedido','otro'];
const ACCIONES = ['reposicion','nota_credito','descuento_venta','devolucion_dinero'];

export default function DevolucionesListPage() {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const { hasPermiso } = usePermisos();
  const canConfig = hasPermiso('ventas.devoluciones', 'editar');
  const [mermaConfigOpen, setMermaConfigOpen] = useState(false);
  useRealtimeInvalidate({
    table: 'devoluciones',
    empresaId: empresa?.id,
    queryKeys: [['devoluciones-list-all']],
  });

  const [search, setSearch] = useState('');
  const [clienteFilter, setClienteFilter] = useState<string>('all');
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [motivoFilter, setMotivoFilter] = useState<string>('all');
  const [accionFilter, setAccionFilter] = useState<string>('all');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['devoluciones-list-all', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('devoluciones')
        .select('id, fecha, tipo, notas, venta_id, vendedor_id, user_id, cliente_id, clientes(id,nombre), vendedores:profiles!devoluciones_vendedor_id_profiles_fkey(id,nombre), ventas(folio, vendedor_id, vendedor:profiles!ventas_vendedor_id_profiles_fkey(id,nombre)), devolucion_lineas(producto_id, cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (error) console.error('[devoluciones] query error', error);
      const list = data ?? [];
      const userIds = Array.from(new Set(list.map((r: any) => r.user_id).filter(Boolean)));
      let userMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: us } = await (supabase as any).from('profiles').select('id,nombre').in('id', userIds as any);
        userMap = Object.fromEntries((us ?? []).map((u: any) => [u.id, u.nombre]));
      }
      return list.map((r: any) => ({ ...r, registradoPor: r.user_id ? userMap[r.user_id] ?? null : null }));
    },
  });

  // Almacén DESTINO de cada devolución (a dónde entró el producto: Mermas o vendible).
  // Se toma de los movimientos de inventario ligados a la devolución.
  const { data: destinoMap = {} } = useQuery({
    queryKey: ['devoluciones-destinos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const [movRes, almRes] = await Promise.all([
        (supabase as any).from('movimientos_inventario')
          .select('referencia_id, almacen_destino_id')
          .eq('empresa_id', empresa!.id)
          .in('referencia_tipo', ['devolucion_aplicada', 'devolucion'])
          .gt('cantidad', 0),
        (supabase as any).from('almacenes').select('id, nombre, es_merma').eq('empresa_id', empresa!.id),
      ]);
      const almById = new Map<string, any>((almRes.data ?? []).map((a: any) => [a.id, a]));
      const map: Record<string, { nombre: string; es_merma: boolean }[]> = {};
      for (const m of (movRes.data ?? [])) {
        const a = almById.get(m.almacen_destino_id);
        if (!a) continue;
        const arr = map[m.referencia_id] ?? (map[m.referencia_id] = []);
        if (!arr.some((x) => x.nombre === a.nombre)) arr.push({ nombre: a.nombre, es_merma: !!a.es_merma });
      }
      return map;
    },
  });

  // Lote con el que reingresó cada producto devuelto (FEFO-in), por devolución+producto.
  const { data: loteMapDev = {} } = useQuery({
    queryKey: ['devoluciones-lotes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data: mvs } = await (supabase as any).from('movimientos_inventario')
        .select('referencia_id, producto_id, lote_id')
        .eq('empresa_id', empresa!.id)
        .eq('referencia_tipo', 'devolucion_lote')
        .not('lote_id', 'is', null);
      const movs = mvs ?? [];
      const loteIds = Array.from(new Set(movs.map((r: any) => r.lote_id).filter(Boolean)));
      let lotesById: Record<string, string> = {};
      if (loteIds.length > 0) {
        const { data: lts } = await (supabase as any).from('lotes').select('id, codigo').in('id', loteIds as any);
        lotesById = Object.fromEntries((lts ?? []).map((l: any) => [l.id, l.codigo ?? '—']));
      }
      const map: Record<string, Record<string, string>> = {};
      for (const r of movs) {
        (map[r.referencia_id] ??= {})[r.producto_id] = lotesById[r.lote_id] ?? '—';
      }
      return map;
    },
  });

  const { clientes, vendedores } = useMemo(() => {
    const cm = new Map<string, string>();
    const vm = new Map<string, string>();
    for (const r of rows as any[]) {
      if (r.cliente_id && r.clientes?.nombre) cm.set(r.cliente_id, r.clientes.nombre);
      const vId = r.ventas?.vendedor_id ?? r.vendedor_id;
      const vNom = r.ventas?.vendedor?.nombre ?? r.vendedores?.nombre;
      if (vId && vNom) vm.set(vId, vNom);
    }
    return {
      clientes: [...cm.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      vendedores: [...vm.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rows as any[]).filter(d => {
      const lineas = d.devolucion_lineas ?? [];
      const vId = d.ventas?.vendedor_id ?? d.vendedor_id;
      if (clienteFilter !== 'all' && d.cliente_id !== clienteFilter) return false;
      if (vendedorFilter !== 'all' && vId !== vendedorFilter) return false;
      if (desde && d.fecha < desde) return false;
      if (hasta && d.fecha > hasta) return false;
      if (motivoFilter !== 'all' && !lineas.some((l: any) => l.motivo === motivoFilter)) return false;
      if (accionFilter !== 'all' && !lineas.some((l: any) => l.accion === accionFilter)) return false;
      if (s) {
        const haystack = [
          d.clientes?.nombre,
          d.ventas?.vendedor?.nombre,
          d.vendedores?.nombre,
          d.registradoPor,
          d.ventas?.folio,
          d.notas,
          ...lineas.map((l: any) => l.productos?.nombre),
          ...lineas.map((l: any) => l.productos?.codigo),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, clienteFilter, vendedorFilter, motivoFilter, accionFilter, desde, hasta]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalUds = filtered.reduce((s, d: any) =>
    s + (d.devolucion_lineas ?? []).reduce((ss: number, l: any) => ss + (Number(l.cantidad) || 0), 0), 0);
  const totalCredito = filtered.reduce((s, d: any) =>
    s + (d.devolucion_lineas ?? []).reduce((ss: number, l: any) => ss + (Number(l.monto_credito) || 0), 0), 0);

  const hasFilters = !!search || clienteFilter !== 'all' || vendedorFilter !== 'all' ||
    motivoFilter !== 'all' || accionFilter !== 'all' || !!desde || !!hasta;

  const clearFilters = () => {
    setSearch(''); setClienteFilter('all'); setVendedorFilter('all');
    setMotivoFilter('all'); setAccionFilter('all'); setDesde(''); setHasta('');
    setPage(1);
  };

  return (
    <div className="p-4 space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <RotateCcw className="h-5 w-5" /> Devoluciones
        </h1>
        {canConfig && (
          <Button variant="outline" size="sm" onClick={() => setMermaConfigOpen(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Configurar mermas
          </Button>
        )}
      </div>

      <MermaConfigDialog open={mermaConfigOpen} onOpenChange={setMermaConfigOpen} />

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-semibold uppercase">
          <Filter className="h-3 w-3" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente, folio, producto, notas..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={clienteFilter} onValueChange={v => { setClienteFilter(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {clientes.map(([id, nombre]) => (
                <SelectItem key={id} value={id}>{nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vendedorFilter} onValueChange={v => { setVendedorFilter(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los vendedores</SelectItem>
              {vendedores.map(([id, nombre]) => (
                <SelectItem key={id} value={id}>{nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select value={motivoFilter} onValueChange={v => { setMotivoFilter(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los motivos</SelectItem>
              {MOTIVOS.map(m => <SelectItem key={m} value={m}>{MOTIVO_LABELS[m]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={accionFilter} onValueChange={v => { setAccionFilter(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Acción" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las acciones</SelectItem>
              {ACCIONES.map(a => <SelectItem key={a} value={a}>{ACCION_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); setPage(1); }} />
        </div>
        {hasFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase border-b border-border bg-card">
              <th className="text-left py-2.5 px-3 font-medium">Fecha</th>
              <th className="text-left py-2.5 px-3 font-medium">Cliente</th>
              <th className="text-left py-2.5 px-3 font-medium">Vendedor</th>
              <th className="text-left py-2.5 px-3 font-medium">Registró</th>
              <th className="text-left py-2.5 px-3 font-medium">Venta</th>
              <th className="text-left py-2.5 px-3 font-medium">Productos</th>
              <th className="text-right py-2.5 px-3 font-medium">Uds.</th>
              <th className="text-left py-2.5 px-3 font-medium">Motivo</th>
              <th className="text-left py-2.5 px-3 font-medium">Acción</th>
              <th className="text-left py-2.5 px-3 font-medium">Destino</th>
              <th className="text-right py-2.5 px-3 font-medium">Crédito</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Cargando...</td></tr>
            )}
            {!isLoading && paged.length === 0 && (
              <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">
                {hasFilters ? 'No hay devoluciones que coincidan con los filtros' : 'No hay devoluciones registradas'}
              </td></tr>
            )}
            {paged.map((d: any) => {
              const lineas = d.devolucion_lineas ?? [];
              const tUds = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
              const tCred = lineas.reduce((s: number, l: any) => s + (Number(l.monto_credito) || 0), 0);
              const motivos = [...new Set(lineas.map((l: any) => l.motivo))];
              const acciones = [...new Set(lineas.map((l: any) => l.accion))];
              const lotesDev: Record<string, string> = (loteMapDev as any)[d.id] ?? {};
              const productosText = lineas.map((l: any) => {
                const lote = lotesDev[l.producto_id];
                return `${l.productos?.nombre ?? '?'} (${l.cantidad})${lote ? ` · lote ${lote}` : ''}`;
              }).join(', ');

              return (
                <tr key={d.id} className="border-b border-border/50 hover:bg-card/50 cursor-pointer" onClick={() => d.venta_id && navigate(`/ventas/${d.venta_id}`)}>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{fmtDate(d.fecha)}</td>
                  <td className="py-2 px-3 font-medium">{d.clientes?.nombre ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{d.ventas?.vendedor?.nombre ?? d.vendedores?.nombre ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{d.registradoPor ?? '—'}</td>
                  <td className="py-2 px-3">
                    {d.ventas?.folio ? (
                      <span className="text-primary font-mono text-[11px] font-semibold">{d.ventas.folio}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 px-3 max-w-[200px] truncate text-muted-foreground" title={productosText}>{productosText || '—'}</td>
                  <td className="py-2 px-3 text-right font-semibold">{tUds}</td>
                  <td className="py-2 px-3">
                    {motivos.map((m: string) => (
                      <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-full bg-card border border-border text-foreground font-medium capitalize mr-1">
                        {MOTIVO_LABELS[m] ?? m.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 px-3">
                    {acciones.map((a: string) => (
                      <span key={a} className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent text-foreground font-medium mr-1">
                        {ACCION_LABELS[a] ?? a}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 px-3">
                    {((destinoMap as any)[d.id] ?? []).length > 0
                      ? ((destinoMap as any)[d.id] as any[]).map((a) => (
                          <span key={a.nombre} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium mr-1 ${a.es_merma ? 'bg-amber-100 text-amber-700' : 'bg-card border border-border text-muted-foreground'}`}>
                            {a.nombre}
                          </span>
                        ))
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    {tCred > 0 ? <span className="text-destructive">{fmt(tCred)}</span> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!!filtered.length && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td colSpan={6} className="py-2 px-3 text-[11px] text-muted-foreground uppercase">Totales ({filtered.length})</td>
                <td className="py-2 px-3 text-right tabular-nums">{totalUds}</td>
                <td colSpan={3}></td>
                <td className="py-2 px-3 text-right text-destructive tabular-nums">{fmt(totalCredito)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {total > pageSize && (
        <OdooPagination
          from={(page - 1) * pageSize + 1}
          to={Math.min(page * pageSize, total)}
          total={total}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => p + 1)}
        />
      )}
    </div>
  );
}
