import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { usePermisos } from '@/hooks/usePermisos';
import { isCerradaParcial, sumCobrosActivos } from '@/lib/ventaCerrada';

interface Props {
  venta: any;
  fmt: (n: number) => string;
  compact?: boolean;
}

/**
 * Botón "Cerrar pedido a lo entregado" con diálogo de confirmación.
 * Solo aparece si:
 *  - venta.tipo = 'pedido' + politica_cobro = 'entregado'
 *  - status = 'confirmado' o 'entregado' (aún no cerrado)
 *  - hay al menos una entrega en 'hecho' con faltante
 *  - el usuario tiene permiso para editar ventas
 * Consume el RPC existente `cerrar_pedido_parcial`.
 */
export function CerrarPedidoButton({ venta, fmt, compact = false }: Props) {
  const qc = useQueryClient();
  const { hasPermiso } = usePermisos();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const puedeIntentar =
    !!venta &&
    !isCerradaParcial(venta) &&
    venta?.politica_cobro === 'entregado' &&
    venta?.tipo === 'pedido' &&
    (venta?.status === 'confirmado' || venta?.status === 'entregado') &&
    hasPermiso('ventas', 'editar');

  const { data: entregas } = useQuery({
    queryKey: ['cerrar-btn-entregas', venta?.id],
    enabled: !!venta?.id && puedeIntentar,
    queryFn: async () => {
      const { data } = await supabase
        .from('entregas')
        .select('id, status, entrega_lineas(producto_id, cantidad_pedida, cantidad_entregada)')
        .eq('pedido_id', venta.id);
      return data ?? [];
    },
  });

  if (!puedeIntentar) return null;

  const ventaLineas = (venta?.venta_lineas ?? []) as any[];
  const hechas = (entregas ?? []).filter((e: any) => e.status === 'hecho');
  const entregadoPorProd = new Map<string, number>();
  for (const e of hechas) {
    for (const l of (e as any).entrega_lineas ?? []) {
      entregadoPorProd.set(l.producto_id, (entregadoPorProd.get(l.producto_id) ?? 0) + Number(l.cantidad_entregada ?? 0));
    }
  }

  const lineTotalFull = (vl: any) => {
    const t = Number(vl?.total ?? 0);
    if (t > 0) return t;
    return Number(vl?.subtotal ?? 0) + Number(vl?.iva_monto ?? 0) + Number(vl?.ieps_monto ?? 0);
  };

  let totalEntregado = 0;
  let pzasPedidas = 0;
  let pzasEntregadas = 0;
  for (const vl of ventaLineas) {
    const ped = Number(vl.cantidad ?? 0);
    const ent = Math.min(entregadoPorProd.get(vl.producto_id) ?? 0, ped);
    if (ped > 0) totalEntregado += lineTotalFull(vl) * (ent / ped);
    pzasPedidas += ped;
    pzasEntregadas += ent;
  }
  const faltantes = pzasPedidas - pzasEntregadas;
  const totalPedido = Number(venta?.total ?? 0);
  const cobrado = sumCobrosActivos(venta);
  const saldoFinal = Math.max(0, totalEntregado - cobrado);

  // No mostrar botón si no hay entrega hecha o no hay faltante (nada que cerrar)
  if (hechas.length === 0 || faltantes <= 0) return null;

  const doCerrar = async () => {
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('cerrar_pedido_parcial', {
        p_venta_id: venta.id,
        p_user_id: userRes.user?.id ?? null,
      } as any);
      if (error) throw error;
      toast.success('Pedido cerrado a lo entregado.');
      setOpen(false);
      setAck(false);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta', venta.id] });
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['cerrar-btn-entregas', venta.id] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
    } catch (e: any) {
      toast.error(e.message || 'No se pudo cerrar el pedido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={`${compact ? 'h-7 text-xs' : ''} gap-1.5 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning`}
        onClick={() => setOpen(true)}
      >
        <Lock className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        Cerrar pedido
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setAck(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Cerrar pedido {venta.folio}
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Se entregaron <b className="text-foreground">{pzasEntregadas}</b> de <b className="text-foreground">{pzasPedidas}</b> pza.
              Al cerrar, el total real del pedido pasa a ser <b className="text-foreground">lo entregado</b> y las {faltantes} pza restantes quedan canceladas.
            </p>

            <div className="rounded-lg border border-border bg-accent/40 p-3 space-y-1.5">
              <Row label="Pedido original" value={fmt(totalPedido)} muted />
              <Row label="Total nuevo (cerrado)" value={fmt(totalEntregado)} bold />
              <Row label="Cobrado" value={fmt(cobrado)} />
              <div className="border-t border-border pt-1.5">
                <Row label="Saldo a cobrar" value={fmt(saldoFinal)} bold highlight={saldoFinal > 0 ? 'warning' : undefined} />
              </div>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
              <span className="text-[12px] text-foreground">Entiendo, cerrar este pedido a lo entregado. Esta acción no se puede deshacer.</span>
            </label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!ack || busy}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={(e) => { e.preventDefault(); doCerrar(); }}
            >
              {busy ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cerrando…</> : <><Lock className="h-3.5 w-3.5 mr-1.5" /> Confirmar cierre</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value, muted, bold, highlight }: { label: string; value: string; muted?: boolean; bold?: boolean; highlight?: 'warning' }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${highlight === 'warning' ? 'text-warning' : muted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
