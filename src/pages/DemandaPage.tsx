import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Check, ChevronRight, Search, ClipboardList, Warehouse, AlertTriangle, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';

// ─── Data hooks ────────────────────────────────────────────

function useDemanda() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['demanda', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data: pedidos, error } = await supabase
        .from('ventas')
        .select('*, clientes(nombre), vendedores(nombre), venta_lineas(*, productos(id, codigo, nombre, cantidad, unidades:unidad_venta_id(abreviatura)))')
        .eq('empresa_id', empresa!.id)
        .eq('tipo', 'pedido')
        .in('status', ['confirmado', 'entregado'])
        .order('fecha', { ascending: true });
      if (error) throw error;

      const pedidoIds = (pedidos ?? []).map(p => p.id);
      let entregas: any[] = [];
      if (pedidoIds.length > 0) {
        const { data } = await supabase
          .from('ventas')
          .select('pedido_origen_id, venta_lineas(producto_id, cantidad)')
          .in('pedido_origen_id', pedidoIds);
        entregas = data ?? [];
      }

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
          totalPendiente, totalEntregado, totalDemanda,
          pctEntregado: totalDemanda > 0 ? Math.round((totalEntregado / totalDemanda) * 100) : 0,
          fullyDelivered: totalPendiente <= 0,
        };
      }).filter(p => !p.fullyDelivered);
    },
  });
}

function useOrigenes() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['origenes-surtido', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;
      // Almacenes
      const { data: almacenes } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', eid).order('nombre');
      // Products with warehouse stock
      const { data: productos } = await supabase.from('productos').select('id, cantidad').eq('empresa_id', eid).eq('status', 'activo');
      const stockAlmacen: Record<string, number> = {};
      for (const p of (productos ?? [])) { stockAlmacen[p.id] = p.cantidad ?? 0; }

      // Active cargas with lines
      const { data: cargas } = await supabase
        .from('cargas')
        .select('id, vendedor_id, vendedores(nombre), fecha, status, carga_lineas(producto_id, cantidad_cargada, cantidad_vendida, cantidad_devuelta)')
        .eq('empresa_id', eid)
        .in('status', ['en_ruta', 'pendiente'] as any)
        .order('fecha', { ascending: false });

      const rutaOrigenes = (cargas ?? []).map(c => {
        const stockMap: Record<string, number> = {};
        for (const cl of (c.carga_lineas ?? [])) {
          stockMap[cl.producto_id] = Math.max(0, cl.cantidad_cargada - cl.cantidad_vendida - cl.cantidad_devuelta);
        }
        return {
          id: `ruta-${c.id}`,
          cargaId: c.id,
          label: `Ruta: ${(c.vendedores as any)?.nombre ?? '—'} (${fmtDate(c.fecha)})`,
          type: 'ruta' as const,
          stock: stockMap,
        };
      });

      const almacenOrigen = {
        id: 'almacen',
        cargaId: null as string | null,
        label: (almacenes ?? []).length === 1 ? `Almacén: ${almacenes![0].nombre}` : 'Almacén general',
        type: 'almacen' as const,
        stock: stockAlmacen,
      };

      return { origenes: [almacenOrigen, ...rutaOrigenes] };
    },
  });
}

// ─── Component ────────────────────────────────────────────

export default function DemandaPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { data: pedidos, isLoading } = useDemanda();
  const { data: origenesData } = useOrigenes();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [surtidoCantidades, setSurtidoCantidades] = useState<Record<string, number>>({});
  const [origenId, setOrigenId] = useState<string>('almacen');
  const [vendedorEntrega, setVendedorEntrega] = useState<Record<string, string | null>>({});

  const origenes = origenesData?.origenes ?? [];
  const origenActual = origenes.find(o => o.id === origenId) ?? origenes[0];

  const getStockOrigen = (productoId: string) => origenActual?.stock[productoId] ?? 0;

  const generarEntrega = useMutation({
    mutationFn: async (pedido: any) => {
      if (!origenActual) throw new Error('Selecciona un origen');

      const lineas = pedido.venta_lineas
        .filter((l: any) => {
          const key = `${pedido.id}-${l.producto_id}`;
          return (surtidoCantidades[key] ?? 0) > 0;
        })
        .map((l: any) => {
          const key = `${pedido.id}-${l.producto_id}`;
          const qty = surtidoCantidades[key] ?? 0;
          return {
            producto_id: l.producto_id,
            cantidad: qty,
            precio_unitario: l.precio_unitario,
            descripcion: l.descripcion,
            unidad_id: l.unidad_id,
            descuento_pct: l.descuento_pct ?? 0,
            subtotal: qty * l.precio_unitario,
            total: qty * l.precio_unitario,
          };
        });

      if (lineas.length === 0) throw new Error('Selecciona al menos un producto a surtir');

      // Validate stock
      for (const l of lineas) {
        const disponible = getStockOrigen(l.producto_id);
        if (l.cantidad > disponible) {
          const prod = pedido.venta_lineas.find((vl: any) => vl.producto_id === l.producto_id);
          throw new Error(`Stock insuficiente para ${prod?.productos?.nombre ?? 'producto'}: disponible ${disponible}, solicitado ${l.cantidad}`);
        }
      }

      const total = lineas.reduce((s: number, l: any) => s + l.total, 0);

      // Create delivery order with status "confirmado" (pending delivery, stock already deducted)
      const assignedVendedor = vendedorEntrega[pedido.id] ?? pedido.vendedor_id;
      if (!assignedVendedor) throw new Error('Asigna un vendedor/ruta antes de generar la entrega');
      const { data: venta, error } = await supabase.from('ventas').insert({
        empresa_id: empresa!.id,
        tipo: 'venta_directa',
        status: 'confirmado',
        condicion_pago: pedido.condicion_pago,
        cliente_id: pedido.cliente_id,
        vendedor_id: assignedVendedor,
        pedido_origen_id: pedido.id,
        subtotal: total,
        total,
        saldo_pendiente: pedido.condicion_pago === 'credito' ? total : 0,
        entrega_inmediata: false,
      } as any).select().single();
      if (error) throw error;

      const { error: lErr } = await supabase.from('venta_lineas').insert(
        lineas.map((l: any) => ({ ...l, venta_id: venta.id }))
      );
      if (lErr) throw lErr;

      // Deduct stock from origin
      if (origenActual.type === 'almacen') {
        for (const l of lineas) {
          const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
          if (prod) {
            await supabase.from('productos').update({ cantidad: Math.max(0, (prod.cantidad ?? 0) - l.cantidad) } as any).eq('id', l.producto_id);
          }
        }
      } else if (origenActual.type === 'ruta' && origenActual.cargaId) {
        // Deduct from carga_lineas (increment cantidad_vendida)
        for (const l of lineas) {
          const { data: cl } = await supabase
            .from('carga_lineas')
            .select('id, cantidad_vendida')
            .eq('carga_id', origenActual.cargaId)
            .eq('producto_id', l.producto_id)
            .single();
          if (cl) {
            await supabase.from('carga_lineas').update({ cantidad_vendida: (cl.cantidad_vendida ?? 0) + l.cantidad }).eq('id', cl.id);
          }
        }
      }

      return venta;
    },
    onSuccess: () => {
      toast.success('Pedido de entrega generado y asignado a ruta — stock descontado del origen');
      qc.invalidateQueries({ queryKey: ['demanda'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['origenes-surtido'] });
      qc.invalidateQueries({ queryKey: ['cargas'] });
      setSurtidoCantidades({});
      setExpandedId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = pedidos?.filter(p =>
    !search || (p.clientes?.nombre ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.folio ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Fetch vendedores for assignment
  const { data: vendedoresList } = useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const initSurtido = (pedido: any) => {
    const newQtys: Record<string, number> = {};
    for (const l of pedido.venta_lineas) {
      newQtys[`${pedido.id}-${l.producto_id}`] = 0;
    }
    setSurtidoCantidades(prev => ({ ...prev, ...newQtys }));
    // Auto-assign vendedor from client's vendedor (already on pedido)
    if (!vendedorEntrega[pedido.id]) {
      setVendedorEntrega(prev => ({ ...prev, [pedido.id]: pedido.vendedor_id ?? null }));
    }
    setExpandedId(pedido.id);
  };

  const surtirTodo = (pedido: any) => {
    const newQtys: Record<string, number> = {};
    for (const l of pedido.venta_lineas) {
      const pendiente = Math.max(0, l.cantidad_pendiente);
      const disponible = getStockOrigen(l.producto_id);
      newQtys[`${pedido.id}-${l.producto_id}`] = Math.min(pendiente, disponible);
    }
    setSurtidoCantidades(prev => ({ ...prev, ...newQtys }));
  };

  // Totals
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

      {/* Search + Origin selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por folio o cliente..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            <Warehouse className="h-3 w-3 inline mr-1" />Surtir desde
          </label>
          <select
            className="border border-input rounded-md px-3 py-2 text-sm bg-background min-w-[220px]"
            value={origenId}
            onChange={e => setOrigenId(e.target.value)}
          >
            {origenes.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
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
                <React.Fragment key={pedido.id}>
                  <TableRow
                    className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isExpanded && "bg-accent/30")}
                    onClick={() => isExpanded ? setExpandedId(null) : initSurtido(pedido)}
                  >
                    <TableCell className="font-mono text-[11px] font-bold py-2">{pedido.folio}</TableCell>
                    <TableCell className="text-[12px] font-medium py-2">{pedido.clientes?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground py-2">{pedido.vendedores?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground py-2">{fmtDate(pedido.fecha)}</TableCell>
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

                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={9} className="p-0 bg-muted/30">
                        <div className="px-6 py-3">
                          {/* Origin + route assignment */}
                          <div className="flex items-center gap-4 mb-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">
                                Surtiendo desde: <strong className="text-foreground">{origenActual?.label}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">Ruta/Vendedor:</span>
                              <select
                                className="border border-input rounded px-2 py-0.5 text-[11px] bg-background min-w-[150px]"
                                value={vendedorEntrega[pedido.id] ?? ''}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  e.stopPropagation();
                                  setVendedorEntrega(prev => ({ ...prev, [pedido.id]: e.target.value || null }));
                                }}
                              >
                                <option value="">— Sin asignar —</option>
                                {vendedoresList?.map(v => (
                                  <option key={v.id} value={v.id}>{v.nombre}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">Código</TableHead>
                                <TableHead className="text-[11px]">Producto</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Demanda</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Surtido</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Pendiente</TableHead>
                                <TableHead className="text-[11px] w-20 text-right">Disponible</TableHead>
                                <TableHead className="text-[11px] w-28 text-center">A surtir</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pedido.venta_lineas.map((l: any) => {
                                const key = `${pedido.id}-${l.producto_id}`;
                                const pendiente = Math.max(0, l.cantidad_pendiente);
                                const disponible = getStockOrigen(l.producto_id);
                                const aSurtir = surtidoCantidades[key] ?? 0;
                                const sinStock = disponible <= 0 && pendiente > 0;
                                const excede = aSurtir > disponible;
                                const unidad = l.productos?.unidades?.abreviatura ?? '';
                                return (
                                  <TableRow key={l.id} className={cn(sinStock && "bg-destructive/5")}>
                                    <TableCell className="text-[11px] text-muted-foreground font-mono py-1.5">{l.productos?.codigo}</TableCell>
                                    <TableCell className="text-[12px] font-medium py-1.5">{l.productos?.nombre ?? l.descripcion}</TableCell>
                                    <TableCell className="text-right text-[12px] py-1.5">{l.cantidad} {unidad}</TableCell>
                                    <TableCell className="text-right text-[12px] text-success py-1.5">{l.cantidad_entregada} {unidad}</TableCell>
                                    <TableCell className={cn("text-right text-[12px] font-bold py-1.5", pendiente > 0 ? "text-warning" : "text-success")}>
                                      {pendiente} {unidad}
                                    </TableCell>
                                    <TableCell className={cn("text-right text-[12px] py-1.5", sinStock ? "text-destructive font-bold" : "text-muted-foreground")}>
                                      {disponible} {unidad}
                                      {sinStock && <AlertTriangle className="h-3 w-3 inline ml-1 text-destructive" />}
                                    </TableCell>
                                    <TableCell className="text-center py-1.5">
                                      {pendiente > 0 ? (
                                        <div>
                                          <Input
                                            type="number"
                                            className={cn(
                                              "w-20 mx-auto text-center h-7 text-[12px]",
                                              excede && "border-destructive text-destructive"
                                            )}
                                            min={0}
                                            max={Math.min(pendiente, disponible)}
                                            value={aSurtir}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setSurtidoCantidades(prev => ({
                                                ...prev,
                                                [key]: Math.min(pendiente, Math.max(0, val)),
                                              }));
                                            }}
                                          />
                                          {excede && <p className="text-[9px] text-destructive mt-0.5">Excede stock</p>}
                                        </div>
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
                                  surtirTodo(pedido);
                                }}
                              >
                                Surtir todo (disponible)
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
                              <Truck className="h-3.5 w-3.5 mr-1" /> Generar pedido de entrega
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
