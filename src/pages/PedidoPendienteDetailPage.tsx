import { useMemo, useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntregasByPedido, useCrearEntrega, useEntregaExpress, calcRemainingQty } from '@/hooks/useEntregas';
import { ArrowLeft, Truck, Package, Check, ExternalLink, ClipboardList, Zap, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/TableSkeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';
import SearchableSelect from '@/components/SearchableSelect';
import { useCurrency } from '@/hooks/useCurrency';
import { usePermisos } from '@/hooks/usePermisos';
import { usePinAuth } from '@/hooks/usePinAuth';
import { isCerradaParcial, totalEfectivoVenta, ventaCerradaBadgeLabel, type CerradoSnapshot } from '@/lib/ventaCerrada';

const EntregaFormPage = lazy(() => import('./EntregaFormPage'));

export default function PedidoPendienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const qc = useQueryClient();
  const crearEntrega = useCrearEntrega();
  const entregaExpress = useEntregaExpress();
  const { fmt: fmtC } = useCurrency();
  const { hasPermiso } = usePermisos();
  const canEditVentas = hasPermiso('ventas', 'editar');
  const { requestPin, PinDialog } = usePinAuth();
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarAck, setCerrarAck] = useState(false);
  const [cerrarBusy, setCerrarBusy] = useState(false);

  // Load pedido with lines
  const { data: pedido, isLoading } = useQuery({
    queryKey: ['pedido-pendiente', id],
    enabled: !!id && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('*, clientes(nombre, direccion, colonia), vendedores:profiles!vendedor_id(nombre), venta_lineas(*, productos(id, codigo, nombre, cantidad, unidades:unidad_venta_id(abreviatura)))')
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
      const { data } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
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

  // === Cerrar pedido parcial (frontend-only, consume RPCs existentes) ===
  const isCerrado = isCerradaParcial(pedido as any);
  const politicaEntregado = (pedido as any)?.politica_cobro === 'entregado';
  const tieneEntregaHecha = entregasActivas.some((e: any) => e.status === 'hecho');
  const tieneFaltante = remaining.some(r => r.cantidad_pendiente > 0);
  const puedeCerrar =
    !!pedido &&
    !isCerrado &&
    politicaEntregado &&
    (pedido as any).status === 'confirmado' &&
    (pedido as any).tipo === 'pedido' &&
    tieneEntregaHecha &&
    tieneFaltante &&
    canEditVentas;
  const puedeReabrir = !!pedido && isCerrado && canEditVentas;
  const cerradoSnapshot = ((pedido as any)?.cerrado_snapshot ?? null) as CerradoSnapshot | null;
  const totalEfectivo = totalEfectivoVenta(pedido as any);
  const totalOriginal = Number((pedido as any)?.total ?? cerradoSnapshot?.pedido_total ?? 0) || 0;
  const cerradoLabel = ventaCerradaBadgeLabel(pedido as any);

  const doCerrar = async () => {
    if (!pedido) return;
    setCerrarBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('cerrar_pedido_parcial', {
        p_venta_id: (pedido as any).id,
        p_user_id: userRes.user?.id ?? null,
      } as any);
      if (error) throw error;
      toast.success('Pedido cerrado. Ya no se aceptarán más entregas.');
      setCerrarOpen(false);
      setCerrarAck(false);
      qc.invalidateQueries({ queryKey: ['pedido-pendiente', id] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['demanda'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
    } catch (e: any) {
      toast.error(e.message || 'No se pudo cerrar el pedido');
    } finally {
      setCerrarBusy(false);
    }
  };

  const handleReabrir = () => {
    if (!pedido) return;
    requestPin(
      'Reabrir pedido',
      `Ingresa tu PIN para reabrir ${(pedido as any).folio || 'este pedido'} y permitir nuevas entregas.`,
      async () => {
        try {
          const { error } = await supabase.rpc('reabrir_pedido_parcial', {
            p_venta_id: (pedido as any).id,
          } as any);
          if (error) throw error;
          toast.success('Pedido reabierto');
          qc.invalidateQueries({ queryKey: ['pedido-pendiente', id] });
          qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
          qc.invalidateQueries({ queryKey: ['demanda'] });
          qc.invalidateQueries({ queryKey: ['ventas'] });
          qc.invalidateQueries({ queryKey: ['cxc'] });
          qc.invalidateQueries({ queryKey: ['saldos'] });
        } catch (e: any) {
          toast.error(e.message || 'No se pudo reabrir el pedido');
        }
      }
    );
  };

  const [almacenId, setAlmacenId] = useState('');
  const [vendedorRutaId, setVendedorRutaId] = useState('');

  // Pre-llenar almacén con el del perfil del usuario y repartidor con el vendedor del pedido
  useEffect(() => {
    if (!almacenId && profile?.almacen_id) setAlmacenId(profile.almacen_id);
  }, [profile?.almacen_id]);
  useEffect(() => {
    if (!vendedorRutaId && pedido?.vendedor_id) setVendedorRutaId(pedido.vendedor_id);
  }, [pedido?.vendedor_id]);

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
          // Lote apartado desde el pedido (si aplica).
          lote_id: (lineas as any[]).find((l: any) => l.producto_id === r.producto_id)?.lote_id ?? null,
        })),
      });
      toast.success(`Entrega ${result.folio} creada`);
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['demanda'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEntregaExpress = async () => {
    if (remaining.length === 0) { toast.info('No hay cantidades pendientes'); return; }
    if (!almacenId) {
      toast.error('Selecciona un almacén origen antes de despachar');
      document.getElementById('opciones-entrega')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    try {
      const result = await entregaExpress.mutateAsync({
        pedidoId: pedido.id,
        vendedorId: pedido.vendedor_id ?? undefined,
        clienteId: pedido.cliente_id ?? undefined,
        almacenId,
        vendedorRutaId: vendedorRutaId || undefined,
        lineas: remaining.map(r => ({
          producto_id: r.producto_id,
          cantidad_pendiente: r.cantidad_pendiente,
        })),
      });
      toast.success(`⚡ Entrega ${result.folio} surtida${vendedorRutaId ? ' y asignada' : ''}`);
      navigate(`/logistica/entregas/${result.id}`);
    } catch (e: any) {
      if (e?.entregaExistenteId) {
        toast.error(e.message, {
          action: { label: 'Abrir entrega', onClick: () => navigate(`/logistica/entregas/${e.entregaExistenteId}`) },
          duration: 8000,
        });
      } else {
        toast.error(e.message);
      }
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
              {isCerrado && cerradoLabel && (
                <Badge variant="outline" className="text-[10px] border-warning/40 text-warning bg-warning/10">
                  <Lock className="h-3 w-3 mr-1" />{cerradoLabel}
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{pedido.clientes?.nombre ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!fullyDelivered && !isCerrado && (
            <>
              <Button onClick={handleCrearEntrega} size="sm" variant="outline" disabled={crearEntrega.isPending || entregaExpress.isPending}>
                <Package className="h-3.5 w-3.5" /> Surtir parcial
              </Button>
              <Button onClick={handleEntregaExpress} size="sm" disabled={crearEntrega.isPending || entregaExpress.isPending}>
                <Zap className="h-3.5 w-3.5" /> {entregaExpress.isPending ? 'Despachando…' : 'Surtir y despachar'}
              </Button>
            </>
          )}
          {puedeCerrar && (
            <Button onClick={() => setCerrarOpen(true)} size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning/10">
              <Lock className="h-3.5 w-3.5" /> Cerrar pedido
            </Button>
          )}
          {puedeReabrir && (
            <Button onClick={handleReabrir} size="sm" variant="outline">
              <Unlock className="h-3.5 w-3.5" /> Reabrir pedido
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
              <span className="text-muted-foreground text-[11px]">Total {isCerrado ? 'cobrable' : ''}</span>
              {isCerrado ? (
                <p className="font-bold text-foreground">
                  {fmtC(totalEfectivo)}
                  {totalOriginal > totalEfectivo && (
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground line-through">{fmtC(totalOriginal)}</span>
                  )}
                </p>
              ) : (
                <p className="font-bold text-foreground">{fmtC((pedido.total ?? 0))}</p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Estado</span>
              <p className="font-medium text-foreground">
                {isCerrado ? `🔒 ${cerradoLabel}` : fullyDelivered ? '✅ Completamente surtido' : '⏳ Pendiente'}
              </p>
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
                    <td className="py-1.5 px-4 text-right text-[12px] text-muted-foreground">{fmtC(Number(l.precio_unitario))}</td>
                    <td className="py-1.5 px-4 text-right text-[12px] font-medium">
                      {faltante > 0 ? fmtC(faltante * Number(l.precio_unitario)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Create entrega options */}
        {!fullyDelivered && !isCerrado && (
          <div id="opciones-entrega" className="bg-card border border-border rounded-md p-4 space-y-3">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Almacén y repartidor para la entrega</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label-odoo label-required">Almacén origen</label>
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

        {/* Embedded entrega detail(s) — same controls as /logistica/entregas/:id */}
        {entregasActivas.map((e: any) => (
          <div key={`embed-${e.id}`} className="bg-card border border-border rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-accent/30 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" /> Detalle de entrega {e.folio ?? e.id.slice(0,8)}
              </h3>
              <Link to={`/logistica/entregas/${e.id}`} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                Abrir en pantalla completa <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <Suspense fallback={<div className="p-4"><TableSkeleton rows={4} cols={3} /></div>}>
              <EntregaFormPage entregaIdProp={e.id} embedded />
            </Suspense>
          </div>
        ))}
      </div>

      <AlertDialog open={cerrarOpen} onOpenChange={(v) => { setCerrarOpen(v); if (!v) setCerrarAck(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-warning" /> Cerrar pedido {pedido.folio}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Este pedido quedará <strong>cerrado</strong>. A partir de ahora se tomará como total real lo entregado y no se aceptarán nuevas entregas.</p>
                <div className="rounded border border-border bg-muted/40 p-3 grid grid-cols-2 gap-y-1 text-[12px]">
                  <span className="text-muted-foreground">Total original del pedido:</span>
                  <span className="text-right font-medium">{fmtC(totalOriginal)}</span>
                  <span className="text-muted-foreground">Total entregado (cobrable):</span>
                  <span className="text-right font-bold text-primary">{fmtC(totalEfectivo)}</span>
                  <span className="text-muted-foreground">Diferencia no entregada:</span>
                  <span className="text-right font-medium text-warning">{fmtC(Math.max(0, totalOriginal - totalEfectivo))}</span>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={cerrarAck} onCheckedChange={(v) => setCerrarAck(!!v)} className="mt-0.5" />
                  <span className="text-[13px]">Confirmo que ya no se harán más entregas de este pedido.</span>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cerrarBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cerrarAck || cerrarBusy}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={(e) => { e.preventDefault(); doCerrar(); }}
            >
              {cerrarBusy ? 'Cerrando…' : 'Cerrar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PinDialog />
    </div>
  );
}
