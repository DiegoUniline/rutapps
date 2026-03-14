import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Truck, Check, ChevronRight, Search, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';

// Pedidos confirmados that need fulfillment
function useDemanda() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['demanda', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Get confirmed pedidos (not yet fully delivered)
      const { data: pedidos, error } = await supabase
        .from('ventas')
        .select('*, clientes(nombre), vendedores(nombre), venta_lineas(*, productos(codigo, nombre, unidades:unidad_venta_id(abreviatura)))')
        .eq('empresa_id', empresa!.id)
        .eq('tipo', 'pedido')
        .in('status', ['confirmado', 'entregado'])
        .order('fecha', { ascending: true });
      if (error) throw error;

      // For each pedido, get how much has been delivered via partial ventas
      const pedidoIds = (pedidos ?? []).map(p => p.id);
      let entregas: any[] = [];
      if (pedidoIds.length > 0) {
        const { data } = await supabase
          .from('ventas')
          .select('pedido_origen_id, venta_lineas(producto_id, cantidad)')
          .in('pedido_origen_id', pedidoIds);
        entregas = data ?? [];
      }

      // Build delivery map: pedido_id -> { producto_id -> cantidad_entregada }
      const deliveryMap: Record<string, Record<string, number>> = {};
      for (const e of entregas) {
        if (!e.pedido_origen_id) continue;
        if (!deliveryMap[e.pedido_origen_id]) deliveryMap[e.pedido_origen_id] = {};
        for (const l of (e.venta_lineas ?? [])) {
          deliveryMap[e.pedido_origen_id][l.producto_id] = (deliveryMap[e.pedido_origen_id][l.producto_id] ?? 0) + l.cantidad;
        }
      }

      return (pedidos ?? []).map(p => {
        const delivered = deliveryMap[p.id] ?? {};
        const lineasConPendiente = (p.venta_lineas ?? []).map((l: any) => ({
          ...l,
          cantidad_entregada: delivered[l.producto_id] ?? 0,
          cantidad_pendiente: l.cantidad - (delivered[l.producto_id] ?? 0),
        }));
        const totalPendiente = lineasConPendiente.reduce((s: number, l: any) => s + Math.max(0, l.cantidad_pendiente), 0);
        const totalEntregado = lineasConPendiente.reduce((s: number, l: any) => s + l.cantidad_entregada, 0);
        const totalDemanda = lineasConPendiente.reduce((s: number, l: any) => s + l.cantidad, 0);
        return {
          ...p,
          venta_lineas: lineasConPendiente,
          totalPendiente,
          totalEntregado,
          totalDemanda,
          pctEntregado: totalDemanda > 0 ? Math.round((totalEntregado / totalDemanda) * 100) : 0,
          fullyDelivered: totalPendiente <= 0,
        };
      }).filter(p => !p.fullyDelivered);
    },
  });
}

export default function DemandaPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { data: pedidos, isLoading } = useDemanda();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [surtidoCantidades, setSurtidoCantidades] = useState<Record<string, number>>({});

  const generarEntrega = useMutation({
    mutationFn: async (pedido: any) => {
      // Build lines to deliver
      const lineas = pedido.venta_lineas
        .filter((l: any) => {
          const key = `${pedido.id}-${l.producto_id}`;
          const qty = surtidoCantidades[key] ?? 0;
          return qty > 0;
        })
        .map((l: any) => {
          const key = `${pedido.id}-${l.producto_id}`;
          return {
            producto_id: l.producto_id,
            cantidad: surtidoCantidades[key] ?? 0,
            precio_unitario: l.precio_unitario,
            descripcion: l.descripcion,
            unidad_id: l.unidad_id,
            descuento_pct: l.descuento_pct ?? 0,
            subtotal: (surtidoCantidades[key] ?? 0) * l.precio_unitario,
            total: (surtidoCantidades[key] ?? 0) * l.precio_unitario,
          };
        });

      if (lineas.length === 0) throw new Error('Selecciona al menos un producto a surtir');

      const total = lineas.reduce((s: number, l: any) => s + l.total, 0);

      // Create the delivery venta
      const { data: venta, error } = await supabase.from('ventas').insert({
        empresa_id: empresa!.id,
        tipo: 'venta_directa',
        status: 'entregado',
        condicion_pago: pedido.condicion_pago,
        cliente_id: pedido.cliente_id,
        vendedor_id: pedido.vendedor_id,
        pedido_origen_id: pedido.id,
        subtotal: total,
        total,
        saldo_pendiente: pedido.condicion_pago === 'credito' ? total : 0,
        entrega_inmediata: true,
      } as any).select().single();
      if (error) throw error;

      // Insert lines
      const { error: lErr } = await supabase.from('venta_lineas').insert(
        lineas.map((l: any) => ({ ...l, venta_id: venta.id }))
      );
      if (lErr) throw lErr;

      return venta;
    },
    onSuccess: () => {
      toast.success('Entrega generada');
      qc.invalidateQueries({ queryKey: ['demanda'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      setSurtidoCantidades({});
      setExpandedId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = pedidos?.filter(p =>
    !search || (p.clientes?.nombre ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.folio ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const initSurtido = (pedido: any) => {
    const newQtys: Record<string, number> = {};
    for (const l of pedido.venta_lineas) {
      const key = `${pedido.id}-${l.producto_id}`;
      newQtys[key] = Math.max(0, l.cantidad_pendiente);
    }
    setSurtidoCantidades(prev => ({ ...prev, ...newQtys }));
    setExpandedId(pedido.id);
  };

  // Resumen de demanda total
  const totalPedidos = filtered?.length ?? 0;
  const totalLineasPendientes = filtered?.reduce((s, p) => s + p.totalPendiente, 0) ?? 0;
  const totalValorPendiente = filtered?.reduce((s, p) => {
    return s + p.venta_lineas.reduce((ls: number, l: any) => ls + Math.max(0, l.cantidad_pendiente) * l.precio_unitario, 0);
  }, 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Demanda (pedidos por surtir)
        </h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pedidos pendientes</p>
          <p className="text-2xl font-bold text-foreground">{totalPedidos}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Unidades por surtir</p>
          <p className="text-2xl font-bold text-warning">{totalLineasPendientes}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Valor pendiente</p>
          <p className="text-2xl font-bold text-primary">$ {totalValorPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por folio o cliente..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {/* Pedidos table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px] text-center">Cond. pago</TableHead>
              <TableHead className="text-[11px] text-right">Total</TableHead>
              <TableHead className="text-[11px] text-center w-28">Surtido</TableHead>
              <TableHead className="text-[11px] text-center w-20">Pendiente</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered?.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay pedidos pendientes de surtir
                </TableCell>
              </TableRow>
            )}
            {filtered?.map(pedido => {
              const isExpanded = expandedId === pedido.id;
              return (
                <>
                  <TableRow
                    key={pedido.id}
                    className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isExpanded && "bg-accent/30")}
                    onClick={() => isExpanded ? setExpandedId(null) : initSurtido(pedido)}
                  >
                    <TableCell className="font-mono text-[11px] font-bold py-2">{pedido.folio}</TableCell>
                    <TableCell className="text-[12px] font-medium py-2">{pedido.clientes?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground py-2">{pedido.vendedores?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground py-2">{pedido.fecha}</TableCell>
                    <TableCell className="text-center py-2">
                      <Badge variant="outline" className="text-[10px]">{pedido.condicion_pago}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-medium py-2">$ {pedido.total?.toFixed(2)}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pedido.pctEntregado}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground w-8">{pedido.pctEntregado}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-[12px] font-bold text-warning py-2">{pedido.totalPendiente}</TableCell>
                    <TableCell className="py-2">
                      <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                    </TableCell>
                  </TableRow>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <TableRow key={`${pedido.id}-detail`}>
                      <TableCell colSpan={9} className="p-0 bg-muted/30">
                        <div className="px-6 py-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">Código</TableHead>
                                <TableHead className="text-[11px]">Producto</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Demanda</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Entregado</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Pendiente</TableHead>
                                <TableHead className="text-[11px] w-28 text-center">A surtir</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pedido.venta_lineas.map((l: any) => {
                                const key = `${pedido.id}-${l.producto_id}`;
                                const pendiente = Math.max(0, l.cantidad_pendiente);
                                const unidad = l.productos?.unidades?.abreviatura ?? '';
                                return (
                                  <TableRow key={l.id}>
                                    <TableCell className="text-[11px] text-muted-foreground font-mono py-1.5">{l.productos?.codigo}</TableCell>
                                    <TableCell className="text-[12px] font-medium py-1.5">{l.productos?.nombre ?? l.descripcion}</TableCell>
                                    <TableCell className="text-right text-[12px] py-1.5">{l.cantidad} {unidad}</TableCell>
                                    <TableCell className="text-right text-[12px] text-success py-1.5">{l.cantidad_entregada} {unidad}</TableCell>
                                    <TableCell className={cn("text-right text-[12px] font-bold py-1.5", pendiente > 0 ? "text-warning" : "text-success")}>
                                      {pendiente} {unidad}
                                    </TableCell>
                                    <TableCell className="text-center py-1.5">
                                      {pendiente > 0 ? (
                                        <Input
                                          type="number"
                                          className="w-20 mx-auto text-center h-7 text-[12px]"
                                          min={0}
                                          max={pendiente}
                                          value={surtidoCantidades[key] ?? 0}
                                          onClick={e => e.stopPropagation()}
                                          onChange={e => setSurtidoCantidades(prev => ({
                                            ...prev,
                                            [key]: Math.min(pendiente, Math.max(0, parseFloat(e.target.value) || 0)),
                                          }))}
                                        />
                                      ) : (
                                        <Check className="h-4 w-4 text-success mx-auto" />
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={e => {
                                  e.stopPropagation();
                                  const newQtys: Record<string, number> = {};
                                  for (const l of pedido.venta_lineas) {
                                    newQtys[`${pedido.id}-${l.producto_id}`] = Math.max(0, l.cantidad_pendiente);
                                  }
                                  setSurtidoCantidades(prev => ({ ...prev, ...newQtys }));
                                }}
                              >
                                Surtir todo
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={e => {
                                  e.stopPropagation();
                                  const newQtys: Record<string, number> = {};
                                  for (const l of pedido.venta_lineas) {
                                    newQtys[`${pedido.id}-${l.producto_id}`] = 0;
                                  }
                                  setSurtidoCantidades(prev => ({ ...prev, ...newQtys }));
                                }}
                              >
                                Limpiar
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              onClick={e => {
                                e.stopPropagation();
                                generarEntrega.mutate(pedido);
                              }}
                              disabled={generarEntrega.isPending}
                            >
                              <Truck className="h-3.5 w-3.5 mr-1" /> Generar entrega
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
