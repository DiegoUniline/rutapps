import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ventaIds: string[];
  fmt: (n: number) => string;
  onDone?: () => void;
}

interface Elegible {
  id: string;
  folio: string;
  totalPedido: number;
  totalEntregado: number;
  cobrado: number;
  faltantes: number;
}

/**
 * Diálogo reutilizable para CERRAR MASIVAMENTE pedidos "a lo entregado".
 * Filtra las ventas dadas y deja solo:
 *   - tipo='pedido' + politica_cobro='entregado'
 *   - status 'confirmado' o 'entregado'
 *   - al menos una entrega 'hecho' con faltante
 * Ejecuta el RPC `cerrar_pedido_parcial` por cada elegible.
 */
export function BulkCerrarPedidosDialog({ open, onOpenChange, ventaIds, fmt, onDone }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ elegibles: Elegible[]; noElegibles: number } | null>(null);

  useEffect(() => {
    if (!open || ventaIds.length === 0) { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: ventas }, { data: entregas }, { data: lineas }, { data: aplic }] = await Promise.all([
          (supabase as any).from('ventas').select('id, folio, total, tipo, politica_cobro, status').in('id', ventaIds),
          (supabase as any).from('entregas').select('id, pedido_id, status, entrega_lineas(producto_id, cantidad_entregada)').in('pedido_id', ventaIds),
          (supabase as any).from('venta_lineas').select('venta_id, producto_id, cantidad, total, subtotal, iva_monto, ieps_monto').in('venta_id', ventaIds),
          (supabase as any).from('cobro_aplicaciones').select('venta_id, monto_aplicado, cobros!inner(status)').in('venta_id', ventaIds),
        ]);
        const elegibles: Elegible[] = [];
        for (const v of (ventas ?? [])) {
          if (v.tipo !== 'pedido' || v.politica_cobro !== 'entregado') continue;
          if (v.status !== 'confirmado' && v.status !== 'entregado') continue;
          const vLineas = (lineas ?? []).filter((l: any) => l.venta_id === v.id);
          const hechas = (entregas ?? []).filter((e: any) => e.pedido_id === v.id && e.status === 'hecho');
          if (hechas.length === 0) continue;
          const entPorProd = new Map<string, number>();
          for (const e of hechas) for (const l of (e.entrega_lineas ?? [])) {
            entPorProd.set(l.producto_id, (entPorProd.get(l.producto_id) ?? 0) + Number(l.cantidad_entregada ?? 0));
          }
          let totalEntregado = 0, pzasPed = 0, pzasEnt = 0;
          for (const vl of vLineas) {
            const ped = Number(vl.cantidad ?? 0);
            const ent = Math.min(entPorProd.get(vl.producto_id) ?? 0, ped);
            const lt = Number(vl.total ?? 0) > 0 ? Number(vl.total) : Number(vl.subtotal ?? 0) + Number(vl.iva_monto ?? 0) + Number(vl.ieps_monto ?? 0);
            if (ped > 0) totalEntregado += lt * (ent / ped);
            pzasPed += ped; pzasEnt += ent;
          }
          const faltantes = pzasPed - pzasEnt;
          if (faltantes <= 0) continue;
          const cobrado = (aplic ?? [])
            .filter((a: any) => a.venta_id === v.id && a.cobros?.status === 'activo')
            .reduce((s: number, a: any) => s + Number(a.monto_aplicado ?? 0), 0);
          elegibles.push({
            id: v.id, folio: v.folio || v.id.slice(0, 8),
            totalPedido: Number(v.total ?? 0), totalEntregado, cobrado, faltantes,
          });
        }
        if (!cancelled) setPreview({ elegibles, noElegibles: ventaIds.length - elegibles.length });
      } catch (e: any) {
        toast.error(e.message || 'Error preparando cierre');
        if (!cancelled) onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, ventaIds]);

  const doClose = async () => {
    if (!preview || preview.elegibles.length === 0) return;
    setBusy(true);
    let ok = 0, fail = 0;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      for (const el of preview.elegibles) {
        try {
          const { error } = await supabase.rpc('cerrar_pedido_parcial', {
            p_venta_id: el.id, p_user_id: userRes.user?.id ?? null,
          } as any);
          if (error) throw error;
          ok++;
        } catch (e) { console.error('bulk close', el.id, e); fail++; }
      }
    } finally {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['pedidos-pendientes'] });
      qc.invalidateQueries({ queryKey: ['demanda'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      setBusy(false);
      onOpenChange(false);
      setPreview(null);
      onDone?.();
    }
    if (ok > 0) toast.success(`${ok} pedido${ok !== 1 ? 's' : ''} cerrado${ok !== 1 ? 's' : ''} a lo entregado.`);
    if (fail > 0) toast.error(`${fail} pedido(s) no se pudieron cerrar`);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) setPreview(null); } }}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Cerrar pedidos a lo entregado
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción cierra cada pedido usando lo realmente entregado como total final. Las piezas no entregadas se marcan como <b>canceladas por cierre</b> (no afectan inventario ni saldo). No se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando pedidos seleccionados…
          </div>
        ) : preview && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-accent/40 p-3 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Seleccionados</span><b>{ventaIds.length}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Elegibles para cerrar</span><b className="text-warning">{preview.elegibles.length}</b></div>
              {preview.noElegibles > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">No elegibles (se omiten)</span><b>{preview.noElegibles}</b></div>
              )}
            </div>

            {preview.elegibles.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5">Folio</th>
                      <th className="text-right px-2 py-1.5">Pedido</th>
                      <th className="text-right px-2 py-1.5">Nuevo total</th>
                      <th className="text-right px-2 py-1.5">Cobrado</th>
                      <th className="text-right px-2 py-1.5">Saldo</th>
                      <th className="text-right px-2 py-1.5">Pzas canc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.elegibles.map(el => {
                      const saldo = Math.max(0, el.totalEntregado - el.cobrado);
                      return (
                        <tr key={el.id} className="border-t border-border">
                          <td className="px-2 py-1.5 font-medium">{el.folio}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground line-through tabular-nums">{fmt(el.totalPedido)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(el.totalEntregado)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(el.cobrado)}</td>
                          <td className={cn("px-2 py-1.5 text-right tabular-nums", saldo > 0 ? 'text-warning font-semibold' : '')}>{fmt(saldo)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{el.faltantes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Ninguna venta seleccionada es elegible. Requisitos: tipo pedido con cobro al entregar, estatus confirmado o entregado, y al menos una entrega hecha con piezas faltantes.
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            disabled={busy || loading || !preview || preview.elegibles.length === 0}
            onClick={(e) => { e.preventDefault(); doClose(); }}
          >
            {busy
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cerrando…</>
              : <><Lock className="h-3.5 w-3.5 mr-1.5" /> Cerrar {preview?.elegibles.length ?? 0} pedido(s)</>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
