import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntregasByPedido, useCrearEntrega, calcRemainingQty } from '@/hooks/useEntregas';
import { ArrowLeft, Truck, Package, Check, ExternalLink, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';
import SearchableSelect from '@/components/SearchableSelect';

export default function PedidoPendienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const crearEntrega = useCrearEntrega();

  // Load pedido with lines
  const { data: pedido, isLoading } = useQuery({
    queryKey: ['pedido-pendiente', id],
    enabled: !!id && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('*, clientes(nombre, direccion, colonia), vendedores(nombre), venta_lineas(*, productos(id, codigo, nombre, cantidad, unidades:unidad_venta_id(abreviatura)))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Entregas for this pedido
  const { data: entregasExistentes } = useEntregasByPedido(id);
  const entregasActivas = (entregasExistentes ?? []).filter((e: any) => e.status !== 'cancelado');

  // Almacenes + vendedores for create dialog
  const { data: almacenesList } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
  const { data: vendedoresList } = useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  // Calculate delivered per product
  const deliverySummary = useMemo(() => {
    const delivered: Record<string, number> = {};
    for (const e of entregasActivas) {
      for (const l of ((e as any).entrega_lineas ?? [])) {
        delivered[l.producto_id] = (delivered[l.producto_id] ?? 0) + Number(l.cantidad_entregada);
      }
    }
    return delivered;
  }, [entregasActivas]);

  // Remaining calculation
  const lineas = pedido?.venta_lineas ?? [];
  const remaining = useMemo(() => {
    if (!lineas.length) return [];
    const validLineas = lineas.filter((l: any) => l.producto_id && Number(l.cantidad) > 0).map((l: any) => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad) }));
    return calcRemainingQty(validLineas, entregasActivas as any);
  }, [lineas, entregasActivas]);

  const fullyDelivered = remaining.length === 0 && entregasActivas.length > 0;

  const [almacenId, setAlmacenId] = useState('');
  const [vendedorRutaId, setVendedorRutaId] = useState('');

  const handleCrearEntrega = async () => {
    if (remaining.length === 0) { toast.info('No hay cantidades pendientes'); return; }
    try {
      const result = await crearEntrega.mutateAsync({
        pedidoId: pedido.id,
        vendedorId: pedido.vendedor_id ?? undefined,
        clienteId: pedido.cliente_id ?? undefined,
        almacenId: almacenId || undefined,
        lineas: remaining.map(r => ({
          producto_id: r.producto_id,
          cantidad_pedida: r.cantidad_pendiente,
        })),
      });
      toast.success(`Entrega ${result.folio} creada`);
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['demanda'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="p-4"><TableSkeleton rows={6} cols={4} /></div>;
  if (!pedido) return <div className="p-8 text-center text-muted-foreground">Pedido no encontrado</div>;

  const statusColor: Record<string, string> = {
    borrador: 'bg-muted text-muted-foreground',
    surtido: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    asignado: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    cargado: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    en_ruta: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    hecho: 'bg-primary/10 text-primary',
    cancelado: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/logistica/pedidos')} className="btn-odoo-secondary !px-2.5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {pedido.folio}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{pedido.clientes?.nombre ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!fullyDelivered && (
            <Button onClick={handleCrearEntrega} size="sm" disabled={crearEntrega.isPending}>
              <Package className="h-3.5 w-3.5" /> Crear entrega
            </Button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5 max-w-[1200px]">
        {/* Info card */}
        <div className="bg-card border border-border rounded-md p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
            <div>
              <span className="text-muted-foreground text-[11px]">Cliente</span>
              <p className="font-medium text-foreground">{pedido.clientes?.nombre ?? '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Vendedor</span>
              <p className="font-medium text-foreground">{pedido.vendedores?.nombre ?? '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Fecha</span>
              <p className="font-medium text-foreground">{fmtDate(pedido.fecha)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Condición de pago</span>
              <Badge variant="outline" className="text-[10px] mt-0.5">{pedido.condicion_pago}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Total</span>
              <p className="font-bold text-foreground">$ {(pedido.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Estado</span>
              <p className="font-medium text-foreground">{fullyDelivered ? '✅ Completamente surtido' : '⏳ Pendiente'}</p>
            </div>
          </div>
        </div>

        {/* Lines with delivery progress */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-card">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Líneas del pedido</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px]">Código</th>
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px]">Producto</th>
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] text-right w-20">Pedida</th>
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] text-right w-20">Surtida</th>
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] text-right w-20">Faltante</th>
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] text-right w-24">P. Unit.</th>
                <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] text-right w-24">Subtotal pend.</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l: any, idx: number) => {
                const pedida = Number(l.cantidad) || 0;
                const surtida = deliverySummary[l.producto_id] ?? 0;
                const faltante = Math.max(0, pedida - surtida);
                const unidad = l.productos?.unidades?.abreviatura ?? '';
                return (
                  <tr key={idx} className={cn("border-b border-border", faltante > 0 && "bg-warning/5")}>
                    <td className="py-1.5 px-4 font-mono text-[11px] text-muted-foreground">{l.productos?.codigo}</td>
                    <td className="py-1.5 px-4 text-[12px]">{l.productos?.nombre} {unidad && <span className="text-muted-foreground">({unidad})</span>}</td>
                    <td className="py-1.5 px-4 text-right text-[12px]">{pedida}</td>
                    <td className="py-1.5 px-4 text-right text-[12px] font-medium text-primary">{surtida}</td>
                    <td className={cn("py-1.5 px-4 text-right text-[12px] font-bold", faltante > 0 ? "text-destructive" : "text-muted-foreground")}>
                      {faltante > 0 ? faltante : <Check className="h-3.5 w-3.5 inline text-primary" />}
                    </td>
                    <td className="py-1.5 px-4 text-right text-[12px] text-muted-foreground">$ {Number(l.precio_unitario).toFixed(2)}</td>
                    <td className="py-1.5 px-4 text-right text-[12px] font-medium">
                      {faltante > 0 ? `$ ${(faltante * Number(l.precio_unitario)).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Create entrega options */}
        {!fullyDelivered && (
          <div className="bg-card border border-border rounded-md p-4 space-y-3">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Opciones para nueva entrega</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label-odoo">Almacén origen</label>
                <SearchableSelect
                  options={(almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }))}
                  value={almacenId}
                  onChange={setAlmacenId}
                  placeholder="Seleccionar almacén..."
                />
              </div>
              <div>
                <label className="label-odoo">Repartidor / Ruta</label>
                <SearchableSelect
                  options={(vendedoresList ?? []).map(v => ({ value: v.id, label: v.nombre }))}
                  value={vendedorRutaId}
                  onChange={setVendedorRutaId}
                  placeholder="Opcional — asignar después"
                />
              </div>
            </div>
          </div>
        )}

        {/* Entregas list */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-card flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
              Entregas creadas ({entregasActivas.length})
            </h3>
          </div>
          {entregasActivas.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <Truck className="h-6 w-6 mx-auto mb-2 opacity-30" />
              No se han creado entregas para este pedido
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-4 text-muted-foreground font-medium text-[11px]">Folio</th>
                  <th className="py-2 px-4 text-muted-foreground font-medium text-[11px]">Estado</th>
                  <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] text-right">Líneas</th>
                  <th className="py-2 px-4 text-muted-foreground font-medium text-[11px] w-8"></th>
                </tr>
              </thead>
              <tbody>
                {(entregasExistentes ?? []).map((e: any) => {
                  const isCancelled = e.status === 'cancelado';
                  return (
                    <tr key={e.id} className={cn("border-b border-border hover:bg-accent/30", isCancelled && "opacity-50")}>
                      <td className="py-1.5 px-4">
                        <Link to={`/logistica/entregas/${e.id}`} className="text-primary hover:underline font-mono text-[12px] font-bold">
                          {e.folio ?? e.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-1.5 px-4">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusColor[e.status] ?? 'bg-muted text-muted-foreground')}>
                          {e.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-right text-[12px] text-muted-foreground">
                        {(e.entrega_lineas ?? []).length} líneas
                      </td>
                      <td className="py-1.5 px-4">
                        <Link to={`/logistica/entregas/${e.id}`}>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
