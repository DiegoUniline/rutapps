import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useCancelarDevolucion } from '@/hooks/useDevoluciones';
import { fmtDate } from '@/lib/utils';
import { DESTINO_DEVOLUCION_CORTO } from '@/lib/devolucionGuardado';
import { ACCION_DEVOLUCION_LABELS, MOTIVO_DEVOLUCION_LABELS } from '@/lib/ticketModelo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RotateCcw } from 'lucide-react';

interface DevolucionDetalle {
  id: string;
  fecha: string;
  tipo: string;
  notas: string | null;
  venta_id: string | null;
  turno_id: string | null;
  cancelado_at: string | null;
  cancelado_motivo: string | null;
  clientes: { nombre: string } | null;
  ventas: { folio: string | null } | null;
  devolucion_lineas: {
    id: string; cantidad: number; motivo: string; accion: string; monto_credito: number | null;
    destino: string | null; aplica_venta: boolean | null;
    productos: { codigo: string | null; nombre: string } | null;
  }[];
}

/** Detalle de una devolución con «Cancelar devolución» (F2, D-049). */
export function DevolucionDetalleDialog({ devolucionId, onClose }: { devolucionId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const cancelar = useCancelarDevolucion();
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const { data: dev, isLoading } = useQuery({
    queryKey: ['devoluciones', 'detalle', devolucionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devoluciones' as never)
        .select('id, fecha, tipo, notas, venta_id, turno_id, cancelado_at, cancelado_motivo, clientes(nombre), ventas(folio), devolucion_lineas(id, cantidad, motivo, accion, monto_credito, destino, aplica_venta, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))')
        .eq('id', devolucionId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DevolucionDetalle | null;
    },
  });

  const total = (dev?.devolucion_lineas ?? []).reduce((s, l) => s + (Number(l.monto_credito) || 0), 0);

  const confirmar = async () => {
    await cancelar.mutateAsync({ id: devolucionId, motivo });
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" /> Devolución{dev?.clientes?.nombre ? ` · ${dev.clientes.nombre}` : ''}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !dev ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{isLoading ? 'Cargando…' : 'No se encontró la devolución'}</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{fmtDate(dev.fecha)}</span>
              {dev.ventas?.folio && (
                <button type="button" className="text-primary font-mono font-semibold" onClick={() => { onClose(); navigate(`/ventas/${dev.venta_id}`); }}>
                  Venta {dev.ventas.folio}
                </button>
              )}
              {dev.turno_id && <span>Dinero devuelto desde caja</span>}
            </div>
            {dev.cancelado_at && (
              <div className="rounded-md bg-destructive/10 text-destructive text-xs px-3 py-2">
                Cancelada el {fmtDate(dev.cancelado_at)}{dev.cancelado_motivo ? `: ${dev.cancelado_motivo}` : ''}
              </div>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-1.5 font-medium">Producto</th>
                  <th className="text-right py-1.5 font-medium">Cant.</th>
                  <th className="text-left py-1.5 font-medium pl-3">Destino</th>
                  <th className="text-left py-1.5 font-medium">Motivo</th>
                  <th className="text-left py-1.5 font-medium">Acción</th>
                  <th className="text-right py-1.5 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {dev.devolucion_lineas.map(l => (
                  <tr key={l.id} className="border-b border-border/60">
                    <td className="py-1.5">{l.productos?.nombre ?? '—'}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{l.cantidad}</td>
                    <td className="py-1.5 pl-3">
                      {l.destino ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${l.destino === 'merma' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                          {DESTINO_DEVOLUCION_CORTO[l.destino] ?? l.destino}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-1.5">{MOTIVO_DEVOLUCION_LABELS[l.motivo] ?? l.motivo}</td>
                    <td className="py-1.5">{l.aplica_venta ? 'Nota aplicada a la venta' : (ACCION_DEVOLUCION_LABELS[l.accion] ?? l.accion)}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(l.monto_credito) > 0 ? fmt(Number(l.monto_credito)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {total > 0 && (
                <tfoot>
                  <tr className="font-semibold"><td colSpan={5} className="py-1.5 text-right text-muted-foreground">Total</td><td className="py-1.5 text-right tabular-nums">{fmt(total)}</td></tr>
                </tfoot>
              )}
            </table>
            {dev.notas && <p className="text-xs text-muted-foreground">Notas: {dev.notas}</p>}
            {!dev.cancelado_at && pidiendoMotivo && (
              <div className="space-y-1.5">
                <label htmlFor="motivo-cancelar-dev" className="text-xs font-semibold">Motivo de la cancelación *</label>
                <Textarea id="motivo-cancelar-dev" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. se registró al cliente equivocado" />
                <p className="text-[11px] text-muted-foreground">Se revierte exacto: inventario (desde donde quedó), nota de crédito, pago aplicado a la venta, dinero de caja y gasto.</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          {dev && !dev.cancelado_at && (
            pidiendoMotivo ? (
              <Button variant="destructive" onClick={confirmar} disabled={cancelar.isPending || !motivo.trim()} className="gap-1.5">
                {cancelar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar devolución
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setPidiendoMotivo(true)}>Cancelar devolución</Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
