import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Truck } from 'lucide-react';
import { usePedidosPendientes, useAsignacionesFecha, useCargasDia, useAsignarPedidos } from '@/hooks/useLogistica';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { fmtDate, fmtCurrency , todayLocal } from '@/lib/utils';
import { cn , todayLocal } from '@/lib/utils';

const statusColors: Record<string, { label: string; class: string }> = {
  borrador: { label: 'Sin asignar', class: 'bg-muted text-muted-foreground' },
  confirmado: { label: 'Confirmado', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  en_ruta: { label: 'En ruta', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  entregado: { label: 'Entregado', class: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  cancelado: { label: 'Cancelado', class: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

export default function PedidosPendientesPage() {
  const navigate = useNavigate();
  const [fecha] = useState(() => todayLocal());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState<string | null>(null);

  const { data: pedidos, isLoading } = usePedidosPendientes(fecha, statusFilter);
  const { data: asignaciones } = useAsignacionesFecha(fecha);
  const { data: cargas } = useCargasDia(fecha);
  const asignar = useAsignarPedidos();

  const asignadoMap = useMemo(() => {
    const m: Record<string, string> = {};
    (asignaciones ?? []).forEach((a: any) => { m[a.venta_id] = a.carga_id; });
    return m;
  }, [asignaciones]);

  const filtered = useMemo(() => {
    if (!pedidos) return [];
    let list = pedidos;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) => 
        p.folio?.toLowerCase().includes(s) || 
        (p.clientes as any)?.nombre?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [pedidos, search]);

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
          <p className="text-sm text-muted-foreground">Pedidos del día para asignar a camiones</p>
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

      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar folio o cliente..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['todos', 'borrador', 'confirmado', 'entregado'].map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
              {s === 'todos' ? 'Todos' : statusColors[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                </TableHead>
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
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin pedidos</TableCell></TableRow>
              )}
              {filtered.map((p: any) => {
                const sc = statusColors[p.status] ?? statusColors.borrador;
                const asignado = asignadoMap[p.id];
                const cargaAsignada = asignado ? (cargas ?? []).find((c: any) => c.id === asignado) : null;
                const lineCount = (p.venta_lineas ?? []).length;
                const pzas = (p.venta_lineas ?? []).reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
                return (
                  <TableRow key={p.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-[13px] font-medium cursor-pointer hover:text-primary" onClick={() => navigate(`/ventas/${p.id}`)}>{p.folio ?? '—'}</TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
