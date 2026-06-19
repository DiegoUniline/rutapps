import { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Truck, X, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { usePedidosPendientes, useAsignacionesFecha, useCargasDia, useAsignarPedidos } from '@/hooks/useLogistica';
import { useUsuarios } from '@/hooks/useUsuarios';
import { useClientes } from '@/hooks/useClientes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { fmtDate, fmtCurrency, cn, todayLocal } from '@/lib/utils';

const statusColors: Record<string, { label: string; class: string }> = {
  borrador: { label: 'Sin asignar', class: 'bg-muted text-muted-foreground' },
  confirmado: { label: 'Confirmado', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  en_ruta: { label: 'En ruta', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  entregado: { label: 'Entregado', class: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  cancelado: { label: 'Cancelado', class: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

export default function PedidosPendientesPage() {
  const navigate = useNavigate();
  const today = todayLocal();
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [fechaTipo, setFechaTipo] = useState<'fecha' | 'fecha_entrega'>('fecha');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pendientes' | 'entregados' | 'cancelados' | 'todos'>('pendientes');
  const [vendedoresSel, setVendedoresSel] = useState<string[]>([]);
  const [clienteFilter, setClienteFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Pass 'todos' so hook does not filter by status; we apply tab grouping client-side
  const { data: pedidos, isLoading } = usePedidosPendientes(desde, hasta, 'todos', vendedoresSel, clienteFilter || undefined, fechaTipo);
  const { data: asignaciones } = useAsignacionesFecha(desde, hasta);
  const { data: cargas } = useCargasDia(hasta);
  const { profiles: usuarios } = useUsuarios();
  const { data: clientes } = useClientes();
  const asignar = useAsignarPedidos();



  const asignadoMap = useMemo(() => {
    const m: Record<string, string> = {};
    (asignaciones ?? []).forEach((a: any) => { m[a.venta_id] = a.carga_id; });
    return m;
  }, [asignaciones]);

  const counts = useMemo(() => {
    const list = pedidos ?? [];
    const pendientes = list.filter((p: any) => p.status === 'borrador' || p.status === 'confirmado').length;
    const entregados = list.filter((p: any) => p.status === 'entregado').length;
    const cancelados = list.filter((p: any) => p.status === 'cancelado').length;
    return { todos: list.length, pendientes, entregados, cancelados };
  }, [pedidos]);

  const filtered = useMemo(() => {
    if (!pedidos) return [];
    let list = pedidos;
    if (tab === 'pendientes') list = list.filter((p: any) => p.status === 'borrador' || p.status === 'confirmado');
    else if (tab === 'entregados') list = list.filter((p: any) => p.status === 'entregado');
    else if (tab === 'cancelados') list = list.filter((p: any) => p.status === 'cancelado');
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) =>
        p.folio?.toLowerCase().includes(s) ||
        (p.clientes as any)?.nombre?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [pedidos, search, tab]);


  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p: any) => p.id)));
  };

  const handleAssign = async (cargaId: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await asignar.mutateAsync({ cargaId, ventaIds: ids });
      toast.success(`${ids.length} pedido(s) asignados`);
      setSelected(new Set());
      setAssignTarget(null);
    } catch {
      toast.error('Error al asignar');
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Pedidos pendientes
          </h1>
          <p className="text-sm text-muted-foreground">Pedidos en el rango seleccionado para asignar a camiones</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm"><Truck className="h-4 w-4 mr-1" /> Asignar a ruta ({selected.size})</Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1 px-2">Selecciona camión</div>
                {(cargas ?? []).map((c: any) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent"
                    onClick={() => handleAssign(c.id)}
                  >
                    {(c.vendedores as any)?.nombre ?? 'Sin vendedor'} — {(c as any).almacen_destino?.nombre ?? 'Camión'}
                  </button>
                ))}
                {(!cargas || cargas.length === 0) && (
                  <div className="text-xs text-muted-foreground px-2 py-2">No hay camiones creados para hoy</div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end bg-card border border-border rounded-lg p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Filtrar por</Label>
          <Select value={fechaTipo} onValueChange={(v: any) => setFechaTipo(v)}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fecha">Fecha de pedido</SelectItem>
              <SelectItem value="fecha_entrega">Fecha de entrega</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Desde</Label>
          <Input type="date" className="h-9 w-[150px]" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Hasta</Label>
          <Input type="date" className="h-9 w-[150px]" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Vendedores</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-[200px] justify-between font-normal">
                <span className="flex items-center gap-1.5 truncate">
                  <Users className="h-3.5 w-3.5" />
                  {vendedoresSel.length === 0
                    ? 'Todos'
                    : vendedoresSel.length === 1
                      ? ((usuarios ?? []).find((u: any) => u.id === vendedoresSel[0])?.nombre ?? '1 vendedor')
                      : `${vendedoresSel.length} seleccionados`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground">Vendedores</span>
                {vendedoresSel.length > 0 && (
                  <button className="text-[11px] text-primary hover:underline" onClick={() => setVendedoresSel([])}>Limpiar</button>
                )}
              </div>
              {(usuarios ?? []).map((u: any) => {
                const checked = vendedoresSel.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={() => {
                      setVendedoresSel(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]);
                    }} />
                    <span className="truncate">{u.nombre}</span>
                  </label>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Cliente</Label>
          <Select value={clienteFilter || 'all'} onValueChange={v => setClienteFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {(clientes ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-[11px] text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Folio o cliente..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {(vendedoresSel.length > 0 || clienteFilter || search || tab !== 'pendientes' || desde !== today || hasta !== today || fechaTipo !== 'fecha') && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => {
            setVendedoresSel([]); setClienteFilter(''); setSearch(''); setTab('pendientes');
            setDesde(today); setHasta(today); setFechaTipo('fecha');
          }}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px">
          {([
            { key: 'pendientes', label: 'Pendientes', count: counts.pendientes },
            { key: 'entregados', label: 'Entregados', count: counts.entregados },
            { key: 'cancelados', label: 'Cancelados', count: counts.cancelados },
            { key: 'todos', label: 'Todos', count: counts.todos },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {t.label} <span className="ml-1 text-xs opacity-70">({t.count})</span>
            </button>
          ))}
        </nav>
      </div>


      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Folio</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sin pedidos</TableCell></TableRow>
              )}
              {filtered.map((p: any) => {
                const sc = statusColors[p.status] ?? statusColors.borrador;
                const asignado = asignadoMap[p.id];
                const cargaAsignada = asignado ? (cargas ?? []).find((c: any) => c.id === asignado) : null;
                const lineas = (p.venta_lineas ?? []) as any[];
                const lineCount = lineas.length;
                const pzas = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
                const isOpen = expanded.has(p.id);
                const toggleRow = () => setExpanded(prev => {
                  const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n;
                });
                return (
                  <Fragment key={p.id}>
                    <TableRow className="hover:bg-accent/40 cursor-pointer" onClick={toggleRow}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.fecha)}</TableCell>
                      <TableCell className="font-mono text-[13px] font-medium hover:text-primary" onClick={e => { e.stopPropagation(); navigate(`/ventas/${p.id}`); }}>{p.folio ?? '—'}</TableCell>
                      <TableCell>{(p.clientes as any)?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{(p.vendedores as any)?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{lineCount} prod · {pzas} pzas</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(p.total)}</TableCell>
                      <TableCell>
                        {cargaAsignada ? (
                          <Badge variant="secondary" className="text-xs">{(cargaAsignada as any).vendedores?.nombre ?? 'Asignado'}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', sc.class)}>
                          {sc.label}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={10} className="p-0">
                          <div className="p-4 space-y-3">
                            {(p.clientes as any)?.direccion && (
                              <div className="text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">Dirección:</span> {(p.clientes as any).direccion}
                                {(p.clientes as any)?.telefono && <span className="ml-3"><span className="font-semibold text-foreground">Tel:</span> {(p.clientes as any).telefono}</span>}
                              </div>
                            )}
                            {p.notas && <div className="text-xs"><span className="font-semibold">Notas:</span> {p.notas}</div>}
                            <div className="rounded-md border border-border bg-background overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr className="text-left">
                                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">Código</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">Producto</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Cantidad</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">P. Unit.</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineas.length === 0 && (
                                    <tr><td colSpan={5} className="px-3 py-3 text-center text-muted-foreground text-xs">Sin productos</td></tr>
                                  )}
                                  {lineas.map((l: any) => (
                                    <tr key={l.id} className="border-t border-border">
                                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{l.productos?.codigo ?? '—'}</td>
                                      <td className="px-3 py-1.5">{l.productos?.nombre ?? '—'}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{Number(l.cantidad) || 0}{l.productos?.unidad_granel ? ` ${l.productos.unidad_granel}` : ''}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{fmtCurrency(l.precio_unitario)}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{fmtCurrency(l.total ?? l.subtotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
