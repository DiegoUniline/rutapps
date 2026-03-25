import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Check, Search, ClipboardList, Package, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import ModalSelect from '@/components/ModalSelect';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ─── Data hooks ────────────────────────────────────────────

function usePedidosPendientes() {
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

      // Get delivered quantities from entregas
      const pedidoIds = (pedidos ?? []).map(p => p.id);
      let entregasData: any[] = [];
      if (pedidoIds.length > 0) {
        const { data } = await supabase
          .from('entregas')
          .select('pedido_id, status, entrega_lineas(producto_id, cantidad_entregada)')
          .in('pedido_id', pedidoIds);
        entregasData = data ?? [];
      }

      // Only count entregas that are NOT cancelado
      const deliveryMap: Record<string, Record<string, number>> = {};
      for (const e of entregasData) {
        if (!e.pedido_id || e.status === 'cancelado') continue;
        if (!deliveryMap[e.pedido_id]) deliveryMap[e.pedido_id] = {};
        for (const l of (e.entrega_lineas ?? [])) {
          deliveryMap[e.pedido_id][l.producto_id] = (deliveryMap[e.pedido_id][l.producto_id] ?? 0) + Number(l.cantidad_entregada);
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

// ─── Component ────────────────────────────────────────────

export default function DemandaPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: pedidos, isLoading } = usePedidosPendientes();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCrearDialog, setShowCrearDialog] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [vendedorRutaId, setVendedorRutaId] = useState('');

  // Fetch almacenes + vendedores
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

  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const vendedorOptions = (vendedoresList ?? []).map(v => ({ value: v.id, label: v.nombre }));

  const filtered = useMemo(() =>
    pedidos?.filter(p =>
      !search || (p.clientes?.nombre ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.folio ?? '').toLowerCase().includes(search.toLowerCase())
    ) ?? [],
    [pedidos, search]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const selectedPedidos = filtered.filter(p => selectedIds.has(p.id));

  // Bulk create entregas mutation
  const crearEntregasMut = useMutation({
    mutationFn: async () => {
      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');

      const createdIds: string[] = [];

      for (const pedido of selectedPedidos) {
        const pendientes = pedido.venta_lineas.filter((l: any) => l.cantidad_pendiente > 0);
        if (pendientes.length === 0) continue;

        // Create entrega
        const { data: entrega, error } = await supabase.from('entregas').insert({
          empresa_id: empresa!.id,
          pedido_id: pedido.id,
          vendedor_id: pedido.vendedor_id ?? null,
          cliente_id: pedido.cliente_id,
          almacen_id: almacenId || null,
          vendedor_ruta_id: vendedorRutaId || null,
          status: 'borrador',
        } as any).select('id, folio').single();
        if (error) throw error;

        // Create lines with pending quantities
        const { error: lErr } = await supabase.from('entrega_lineas').insert(
          pendientes.map((l: any) => ({
            entrega_id: entrega.id,
            producto_id: l.producto_id,
            unidad_id: l.unidad_id ?? null,
            cantidad_pedida: Math.max(0, l.cantidad_pendiente),
            cantidad_entregada: 0,
            hecho: false,
          }))
        );
        if (lErr) throw lErr;

        createdIds.push(entrega.id);
      }

      return createdIds;
    },
    onSuccess: (ids) => {
      toast.success(`${ids.length} entrega(s) creada(s)`);
      qc.invalidateQueries({ queryKey: ['demanda'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      setSelectedIds(new Set());
      setShowCrearDialog(false);
      // If single, navigate to it
      if (ids.length === 1) {
        navigate(`/logistica/entregas/${ids[0]}`);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Totals
  const totalPedidos = filtered.length;
  const totalLineasPendientes = filtered.reduce((s, p) => s + p.totalPendiente, 0);
  const totalValorPendiente = filtered.reduce((s, p) => {
    return s + p.venta_lineas.reduce((ls: number, l: any) => ls + Math.max(0, l.cantidad_pendiente) * l.precio_unitario, 0);
  }, 0);

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Pedidos pendientes
        </h1>
        {selectedIds.size > 0 && (
          <Button onClick={() => setShowCrearDialog(true)} size="sm">
            <Package className="h-3.5 w-3.5" />
            Crear {selectedIds.size} entrega{selectedIds.size > 1 ? 's' : ''}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pedidos pendientes</p>
          <p className="text-2xl font-bold text-foreground">{totalPedidos}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Unidades por surtir</p>
          <p className="text-2xl font-bold text-foreground">{totalLineasPendientes}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Valor pendiente</p>
          <p className="text-2xl font-bold text-primary">{fmt(totalValorPendiente)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por folio o cliente..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {selectedIds.size > 0 && (
          <p className="text-sm text-muted-foreground">{selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}</p>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {/* Pedidos table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px] text-center">Cond. pago</TableHead>
              <TableHead className="text-[11px] text-right">Total</TableHead>
              <TableHead className="text-[11px] text-center w-28">Entregado</TableHead>
              <TableHead className="text-[11px] text-center w-20">Pendiente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay pedidos pendientes de surtir
                </TableCell>
              </TableRow>
            )}
            {filtered.map(pedido => {
              const isSelected = selectedIds.has(pedido.id);
              return (
                <TableRow
                  key={pedido.id}
                  className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isSelected && "bg-primary/5")}
                  onClick={() => navigate(`/logistica/pedidos/${pedido.id}`)}
                >
                  <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(pedido.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] font-bold text-primary py-2">{pedido.folio}</TableCell>
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
                  <TableCell className="text-center text-[12px] font-bold text-foreground py-2">{pedido.totalPendiente}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create entregas dialog */}
      <Dialog open={showCrearDialog} onOpenChange={setShowCrearDialog}>
        <DialogContent className="sm:max-w-lg" onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Crear {selectedPedidos.length} entrega{selectedPedidos.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Se creará una entrega por cada pedido seleccionado con las cantidades pendientes. Después podrás surtir línea a línea desde la entrega.
            </p>

            <div className="space-y-3">
              <div>
                <label className="label-odoo">Almacén origen (por defecto)</label>
                <ModalSelect
                  options={almacenOptions}
                  value={almacenId}
                  onChange={setAlmacenId}
                  placeholder="Seleccionar almacén..."
                />
              </div>
              <div>
                <label className="label-odoo">Repartidor / Vendedor de ruta</label>
                <ModalSelect
                  options={vendedorOptions}
                  value={vendedorRutaId}
                  onChange={setVendedorRutaId}
                  placeholder="Opcional — asignar después"
                />
              </div>
            </div>

            {/* Preview of selected pedidos */}
            <div className="border border-border rounded-md max-h-48 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Folio</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Cliente</th>
                    <th className="px-3 py-1.5 text-right text-muted-foreground font-medium">Líneas pend.</th>
                    <th className="px-3 py-1.5 text-right text-muted-foreground font-medium">Uds pend.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPedidos.map(p => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="px-3 py-1.5 font-mono font-bold">{p.folio}</td>
                      <td className="px-3 py-1.5">{p.clientes?.nombre ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right">{p.venta_lineas.filter((l: any) => l.cantidad_pendiente > 0).length}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{p.totalPendiente}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCrearDialog(false)}>Cancelar</Button>
            <Button onClick={() => crearEntregasMut.mutate()} disabled={crearEntregasMut.isPending}>
              <Truck className="h-3.5 w-3.5" />
              Crear entrega{selectedPedidos.length > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
