import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Package, Truck, CheckCircle } from 'lucide-react';
import { usePedidosPendientes, useAsignacionesFecha, useCargasDia, useAsignarPedidos, useDesasignarPedido, useCargaPedidos } from '@/hooks/useLogistica';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { fmtCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

function CapacityBar({ pct }: { pct: number }) {
  const color = pct > 95 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function AsignacionPage() {
  const navigate = useNavigate();
  const [fecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCarga, setExpandedCarga] = useState<string | null>(null);

  const { data: pedidos, isLoading: loadingPedidos } = usePedidosPendientes(fecha);
  const { data: asignaciones } = useAsignacionesFecha(fecha);
  const { data: cargas, isLoading: loadingCargas } = useCargasDia(fecha);
  const asignar = useAsignarPedidos();
  const desasignar = useDesasignarPedido();

  const asignadoMap = useMemo(() => {
    const m: Record<string, string> = {};
    (asignaciones ?? []).forEach((a: any) => { m[a.venta_id] = a.carga_id; });
    return m;
  }, [asignaciones]);

  const sinAsignar = useMemo(() => {
    return (pedidos ?? []).filter((p: any) => !asignadoMap[p.id]);
  }, [pedidos, asignadoMap]);

  const pedidosPorCarga = useMemo(() => {
    const m: Record<string, string[]> = {};
    (asignaciones ?? []).forEach((a: any) => {
      if (!m[a.carga_id]) m[a.carga_id] = [];
      m[a.carga_id].push(a.venta_id);
    });
    return m;
  }, [asignaciones]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAssign = async (cargaId: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast.error('Selecciona pedidos primero'); return; }
    try {
      await asignar.mutateAsync({ cargaId, ventaIds: ids });
      toast.success(`${ids.length} pedido(s) asignados`);
      setSelected(new Set());
    } catch {
      toast.error('Error al asignar');
    }
  };

  const handleRemove = async (cargaId: string, ventaId: string) => {
    try {
      await desasignar.mutateAsync({ cargaId, ventaId });
      toast.success('Pedido removido del camión');
    } catch {
      toast.error('Error al remover');
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> Asignación de pedidos
        </h1>
        <p className="text-sm text-muted-foreground">Asigna pedidos a camiones arrastrando o seleccionando</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: unassigned pedidos */}
        <div className="border border-border rounded-lg bg-card">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Pedidos sin asignar ({sinAsignar.length})</span>
            {selected.size > 0 && <Badge variant="secondary">{selected.size} seleccionados</Badge>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingPedidos ? <div className="p-4"><TableSkeleton /></div> : sinAsignar.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
                Todos los pedidos están asignados
              </div>
            ) : sinAsignar.map((p: any) => {
              const pzas = (p.venta_lineas ?? []).reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-accent/40 transition-colors">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{p.folio}</span>
                      <span className="text-xs text-muted-foreground truncate">{(p.clientes as any)?.nombre}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {(p.venta_lineas ?? []).length} prod · {pzas} pzas · {fmtCurrency(p.total)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: cargas/camiones */}
        <div className="border border-border rounded-lg bg-card">
          <div className="p-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Camiones del día ({(cargas ?? []).length})</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingCargas ? <div className="p-4"><TableSkeleton /></div> : (!cargas || cargas.length === 0) ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No hay camiones. Crea una carga primero.
                <Button variant="link" size="sm" className="mt-2" onClick={() => navigate('/almacen/cargas/nuevo')}>Crear carga</Button>
              </div>
            ) : cargas.map((c: any) => {
              const pedidoIds = pedidosPorCarga[c.id] ?? [];
              const pedidosAsignados = (pedidos ?? []).filter((p: any) => pedidoIds.includes(p.id));
              const totalPzas = pedidosAsignados.reduce((s: number, p: any) =>
                s + (p.venta_lineas ?? []).reduce((ss: number, l: any) => ss + (Number(l.cantidad) || 0), 0), 0);
              const isExpanded = expandedCarga === c.id;

              return (
                <div key={c.id} className="border-b border-border/50">
                  <div className="px-3 py-2.5 hover:bg-accent/40 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpandedCarga(isExpanded ? null : c.id)}>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{(c.vendedores as any)?.nombre ?? 'Sin vendedor'}</span>
                        <Badge variant="outline" className="text-[10px]">{pedidoIds.length} pedidos</Badge>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleAssign(c.id)} disabled={selected.size === 0}>
                        Asignar ({selected.size})
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{(c as any).almacen_origen?.nombre ?? '—'} → {(c as any).almacen_destino?.nombre ?? '—'}</span>
                      <span>{totalPzas} pzas</span>
                    </div>
                    <CapacityBar pct={pedidoIds.length * 10} />
                  </div>
                  {isExpanded && pedidosAsignados.length > 0 && (
                    <div className="bg-muted/30 px-3 pb-2">
                      {pedidosAsignados.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-1 text-xs">
                          <span><span className="font-mono">{p.folio}</span> — {(p.clientes as any)?.nombre} — {fmtCurrency(p.total)}</span>
                          <button className="text-destructive hover:underline text-[11px]" onClick={() => handleRemove(c.id, p.id)}>Quitar</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
