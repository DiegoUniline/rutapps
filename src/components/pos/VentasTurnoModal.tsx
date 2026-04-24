import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import {
  ListOrdered, ArrowDown, ArrowUp, Receipt, Ban, ShoppingCart,
  ChevronDown, ChevronRight, Loader2, Search, X,
} from 'lucide-react';
import { usePinAuth } from '@/hooks/usePinAuth';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface CobroRow {
  id: string;
  monto: number;
  metodo_pago: string;
  created_at: string;
  cliente?: { nombre: string | null } | null;
}

interface MovRow {
  id: string;
  tipo: string;
  monto: number;
  motivo: string | null;
  created_at: string;
}

interface VentaPosRow {
  id: string;
  folio: string | null;
  total: number;
  status: string;
  created_at: string;
  condicion_pago?: string | null;
  cliente?: { nombre: string | null } | null;
}

export function VentasTurnoModal({ open, onOpenChange }: Props) {
  const { user, empresa, profile } = useAuth();
  const { turno } = useCajaTurno();
  const { requestPin, PinDialog } = usePinAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const enabled = !!open && !!turno?.id;

  const cobrosQuery = useQuery({
    queryKey: ['turno-cobros', turno?.id],
    enabled,
    queryFn: async (): Promise<CobroRow[]> => {
      const { data } = await supabase
        .from('cobros')
        .select('id, monto, metodo_pago, created_at, cliente:clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('user_id', user!.id)
        .gte('created_at', turno!.abierto_at)
        .order('created_at', { ascending: false });
      return (data ?? []) as any;
    },
  });

  const movsQuery = useQuery({
    queryKey: ['turno-movs', turno?.id],
    enabled,
    queryFn: async (): Promise<MovRow[]> => {
      const { data } = await supabase
        .from('caja_movimientos')
        .select('id, tipo, monto, motivo, created_at')
        .eq('turno_id', turno!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as any;
    },
  });

  const ventasPosQuery = useQuery({
    queryKey: ['turno-ventas-pos', turno?.id],
    enabled,
    queryFn: async (): Promise<VentaPosRow[]> => {
      const { data } = await (supabase as any)
        .from('ventas')
        .select('id, folio, total, status, created_at, condicion_pago, cliente:clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('turno_id', turno!.id)
        .eq('origen', 'pos')
        .order('created_at', { ascending: false });
      return (data ?? []) as VentaPosRow[];
    },
  });

  const cobros = cobrosQuery.data ?? [];
  const movs = movsQuery.data ?? [];
  const ventasPos = ventasPosQuery.data ?? [];

  // Productos por venta (para búsqueda por nombre de producto)
  const ventaIds = ventasPos.map(v => v.id);
  const productosPorVentaQuery = useQuery({
    queryKey: ['turno-ventas-pos-productos', turno?.id, ventaIds.join(',')],
    enabled: enabled && ventaIds.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data } = await supabase
        .from('venta_lineas')
        .select('venta_id, productos(nombre)')
        .in('venta_id', ventaIds);
      const map: Record<string, string[]> = {};
      for (const l of (data ?? []) as any[]) {
        const n = l.productos?.nombre;
        if (!n) continue;
        (map[l.venta_id] ??= []).push(n);
      }
      return map;
    },
  });

  // Métodos de pago por venta (para búsqueda)
  const metodosPorVentaQuery = useQuery({
    queryKey: ['turno-ventas-pos-metodos', turno?.id, ventaIds.join(',')],
    enabled: enabled && ventaIds.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data } = await supabase
        .from('cobro_aplicaciones')
        .select('venta_id, cobros(metodo_pago)')
        .in('venta_id', ventaIds);
      const map: Record<string, string[]> = {};
      for (const a of (data ?? []) as any[]) {
        const m = a.cobros?.metodo_pago;
        if (!m) continue;
        const arr = (map[a.venta_id] ??= []);
        if (!arr.includes(m)) arr.push(m);
      }
      return map;
    },
  });

  const productosMap = productosPorVentaQuery.data ?? {};
  const metodosMap = metodosPorVentaQuery.data ?? {};

  const ventasPosFiltradas = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return ventasPos;
    return ventasPos.filter(v => {
      const folio = (v.folio || '').toLowerCase();
      const cli = (v.cliente?.nombre || '').toLowerCase();
      const prods = (productosMap[v.id] || []).join(' ').toLowerCase();
      const mets = (metodosMap[v.id] || []).join(' ').toLowerCase();
      return folio.includes(s) || cli.includes(s) || prods.includes(s) || mets.includes(s);
    });
  }, [ventasPos, search, productosMap, metodosMap]);

  const totalVentas = ventasPos.filter(v => v.status !== 'cancelado').reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCobros = cobros.reduce((s, c) => s + Number(c.monto || 0), 0);
  const totalDepositos = movs.filter(m => m.tipo === 'deposito').reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalRetiros = movs.filter(m => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalGastos = movs.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto || 0), 0);

  const cancelarVenta = async (ventaId: string) => {
    setCancelandoId(ventaId);
    try {
      const { error: vErr } = await supabase
        .from('ventas')
        .update({ status: 'cancelado' } as any)
        .eq('id', ventaId);
      if (vErr) throw vErr;

      const { data: apps } = await supabase
        .from('cobro_aplicaciones')
        .select('cobro_id')
        .eq('venta_id', ventaId);
      if (apps && apps.length > 0) {
        const cobroIds = [...new Set(apps.map((a: any) => a.cobro_id))];
        for (const cid of cobroIds) {
          const { data: allApps } = await supabase
            .from('cobro_aplicaciones')
            .select('venta_id')
            .eq('cobro_id', cid);
          const onlyThisVenta = (allApps ?? []).every((a: any) => a.venta_id === ventaId);
          if (onlyThisVenta) {
            await supabase.from('cobros').update({ status: 'cancelado' } as any).eq('id', cid);
          }
        }
      }

      try {
        await supabase.from('venta_historial').insert({
          venta_id: ventaId,
          empresa_id: empresa!.id,
          user_id: user!.id,
          user_nombre: profile?.nombre ?? user?.email ?? '',
          accion: 'cancelada',
          detalles: { origen: 'pos-turno' },
        } as any);
      } catch (e) { console.error(e); }

      toast.success('Venta cancelada');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['turno-ventas-pos', turno?.id] }),
        qc.invalidateQueries({ queryKey: ['turno-cobros', turno?.id] }),
        qc.invalidateQueries({ queryKey: ['ventas'] }),
      ]);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cancelar la venta');
    } finally {
      setCancelandoId(null);
    }
  };

  const handleCancelClick = (venta: VentaPosRow) => {
    requestPin(
      'Cancelar venta POS',
      `Ingresa tu PIN de autorización para cancelar la venta ${venta.folio || ''} por ${fmt(venta.total)}.`,
      () => cancelarVenta(venta.id),
    );
  };

  if (!turno) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0 bg-background">
          <DialogHeader className="px-5 py-4 border-b border-border bg-background">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="h-5 w-5 text-primary" /> Movimientos del turno · {turno.caja_nombre}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-3 border-b border-border bg-background">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <SumCard label="Ventas POS" value={totalVentas} tone="primary" icon={<ShoppingCart className="h-3.5 w-3.5" />} fmt={fmt} />
              <SumCard label="Cobros" value={totalCobros} tone="primary" fmt={fmt} />
              <SumCard label="Depósitos" value={totalDepositos} tone="success" icon={<ArrowDown className="h-3.5 w-3.5" />} fmt={fmt} />
              <SumCard label="Retiros" value={totalRetiros} tone="warning" icon={<ArrowUp className="h-3.5 w-3.5" />} fmt={fmt} />
              <SumCard label="Gastos" value={totalGastos} tone="muted" icon={<Receipt className="h-3.5 w-3.5" />} fmt={fmt} />
            </div>
          </div>

          <Tabs defaultValue="ventas" className="flex-1 overflow-hidden flex flex-col bg-background">
            <div className="px-5 pt-3 flex items-center justify-between gap-3 flex-wrap">
              <TabsList>
                <TabsTrigger value="ventas" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Ventas POS ({ventasPos.length})</TabsTrigger>
                <TabsTrigger value="cobros" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Cobros ({cobros.length})</TabsTrigger>
                <TabsTrigger value="movs" className="gap-1.5"><ArrowDown className="h-3.5 w-3.5" /> Movimientos caja ({movs.length})</TabsTrigger>
              </TabsList>
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar folio, cliente, producto o método..."
                  className="h-9 pl-8 pr-8 text-xs bg-background"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <TabsContent value="ventas" className="flex-1 overflow-y-auto px-5 py-3 mt-0 bg-background">
              {ventasPosFiltradas.length === 0 ? (
                <Empty text={search ? 'Sin resultados para la búsqueda' : 'Sin ventas POS en este turno'} />
              ) : (
                <div className="border border-border rounded-lg overflow-hidden bg-background">
                  <table className="w-full text-sm">
                    <thead className="bg-background text-muted-foreground text-xs border-b border-border">
                      <tr>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="text-left px-3 py-2">Hora</th>
                        <th className="text-left px-3 py-2">Folio</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Condición</th>
                        <th className="text-left px-3 py-2">Estado</th>
                        <th className="text-right px-3 py-2">Total</th>
                        <th className="text-right px-3 py-2 w-24">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasPosFiltradas.map(v => {
                        const isCancelled = v.status === 'cancelado';
                        const isExpanded = expandedId === v.id;
                        return (
                          <>
                            <tr
                              key={v.id}
                              className={`border-t border-border/50 hover:bg-muted/30 cursor-pointer ${isExpanded ? 'bg-background' : ''}`}
                              onClick={() => setExpandedId(isExpanded ? null : v.id)}
                            >
                              <td className="px-2 py-2 text-muted-foreground">
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-muted-foreground text-xs">{fmtTime(v.created_at)}</td>
                              <td className="px-3 py-2 font-mono text-xs">{v.folio || '—'}</td>
                              <td className="px-3 py-2">{v.cliente?.nombre || '—'}</td>
                              <td className="px-3 py-2 capitalize text-xs">{v.condicion_pago || '—'}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-[10px] capitalize ${isCancelled ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-success/10 text-success border-success/30'}`}>
                                  {v.status}
                                </Badge>
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>{fmt(v.total)}</td>
                              <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                {!isCancelled && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCancelClick(v)}
                                    disabled={cancelandoId === v.id}
                                    className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                                  >
                                    {cancelandoId === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                                    Cancelar
                                  </Button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <VentaExpanded ventaId={v.id} fmt={fmt} />
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="cobros" className="flex-1 overflow-y-auto px-5 py-3 mt-0">
              {cobros.length === 0 ? (
                <Empty text="Sin cobros en este turno" />
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Hora</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Método</th>
                        <th className="text-right px-3 py-2">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cobros.map(c => (
                        <tr key={c.id} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground text-xs">{fmtTime(c.created_at)}</td>
                          <td className="px-3 py-2">{c.cliente?.nombre || '—'}</td>
                          <td className="px-3 py-2 capitalize">{c.metodo_pago}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(c.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="movs" className="flex-1 overflow-y-auto px-5 py-3 mt-0">
              {movs.length === 0 ? (
                <Empty text="Sin movimientos de caja" />
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Hora</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-left px-3 py-2">Motivo</th>
                        <th className="text-right px-3 py-2">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movs.map(m => (
                        <tr key={m.id} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground text-xs">{fmtTime(m.created_at)}</td>
                          <td className="px-3 py-2 capitalize">{m.tipo}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.motivo || '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(m.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <PinDialog />
    </>
  );
}

function VentaExpanded({ ventaId, fmt }: { ventaId: string; fmt: (v: number | null | undefined) => string }) {
  const q = useQuery({
    queryKey: ['turno-venta-detalle', ventaId],
    queryFn: async () => {
      const [lRes, pRes, hRes] = await Promise.all([
        supabase
          .from('venta_lineas')
          .select('id, cantidad, precio_unitario, descuento_pct, subtotal, iva_monto, total, productos(nombre, unidad_granel)')
          .eq('venta_id', ventaId)
          .order('created_at'),
        supabase
          .from('cobro_aplicaciones')
          .select('id, monto_aplicado, cobros(fecha, metodo_pago, referencia)')
          .eq('venta_id', ventaId)
          .order('created_at'),
        supabase
          .from('venta_historial')
          .select('id, accion, user_nombre, created_at, detalles')
          .eq('venta_id', ventaId)
          .order('created_at', { ascending: false }),
      ]);
      return {
        lineas: lRes.data ?? [],
        pagos: pRes.data ?? [],
        historial: hRes.data ?? [],
      };
    },
  });

  return (
    <tr>
      <td colSpan={8} className="p-0 bg-background border-t border-border/50">
        <div className="px-5 py-3">
          {q.isLoading ? (
            <div className="text-xs text-muted-foreground py-2 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Cargando detalles...</div>
          ) : (
            <Tabs defaultValue="productos">
              <TabsList className="h-8">
                <TabsTrigger value="productos" className="text-xs h-7">Productos ({q.data?.lineas.length ?? 0})</TabsTrigger>
                <TabsTrigger value="pagos" className="text-xs h-7">Pagos ({q.data?.pagos.length ?? 0})</TabsTrigger>
                <TabsTrigger value="historial" className="text-xs h-7">Historial ({q.data?.historial.length ?? 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="productos" className="mt-2">
                {q.data?.lineas.length ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 font-medium">Producto</th>
                        <th className="text-right py-1.5 font-medium w-16">Cant</th>
                        <th className="text-center py-1.5 font-medium w-12">Ud</th>
                        <th className="text-right py-1.5 font-medium w-20">Precio</th>
                        <th className="text-right py-1.5 font-medium w-16">Desc</th>
                        <th className="text-right py-1.5 font-medium w-20">IVA</th>
                        <th className="text-right py-1.5 font-medium w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.lineas.map((l: any) => (
                        <tr key={l.id} className="border-b border-border/30">
                          <td className="py-1.5">{l.productos?.nombre ?? '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{l.cantidad}</td>
                          <td className="py-1.5 text-center text-muted-foreground">{l.productos?.unidad_granel || 'Pzs'}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmt(l.precio_unitario)}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">{(l.descuento_pct ?? 0) > 0 ? `${l.descuento_pct}%` : '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmt(l.iva_monto)}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{fmt(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <Empty text="Sin productos" />}
              </TabsContent>

              <TabsContent value="pagos" className="mt-2">
                {q.data?.pagos.length ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 font-medium">Método</th>
                        <th className="text-left py-1.5 font-medium">Referencia</th>
                        <th className="text-left py-1.5 font-medium">Fecha</th>
                        <th className="text-right py-1.5 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.pagos.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/30">
                          <td className="py-1.5 capitalize">{p.cobros?.metodo_pago ?? '—'}</td>
                          <td className="py-1.5 text-muted-foreground">{p.cobros?.referencia || '—'}</td>
                          <td className="py-1.5 text-muted-foreground">{fmtTime(p.cobros?.fecha)}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{fmt(p.monto_aplicado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <Empty text="Sin pagos registrados" />}
              </TabsContent>

              <TabsContent value="historial" className="mt-2">
                {q.data?.historial.length ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 font-medium">Fecha</th>
                        <th className="text-left py-1.5 font-medium">Acción</th>
                        <th className="text-left py-1.5 font-medium">Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.historial.map((h: any) => (
                        <tr key={h.id} className="border-b border-border/30">
                          <td className="py-1.5 tabular-nums text-muted-foreground">{fmtTime(h.created_at)}</td>
                          <td className="py-1.5 capitalize">{h.accion}</td>
                          <td className="py-1.5">{h.user_nombre || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <Empty text="Sin historial" />}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </td>
    </tr>
  );
}

function SumCard({ label, value, tone, icon, fmt }: { label: string; value: number; tone: 'primary' | 'success' | 'warning' | 'muted'; icon?: React.ReactNode; fmt: (v: number | null | undefined) => string }) {
  const cls = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    muted: 'bg-muted text-foreground border-border',
  }[tone];
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold opacity-80">{icon}{label}</div>
      <div className="text-base font-bold tabular-nums">{fmt(value)}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-xs text-muted-foreground py-6">{text}</div>;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
