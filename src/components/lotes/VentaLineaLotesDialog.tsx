import { useCallback, useEffect, useState } from 'react';
import { Boxes, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';
import { getLotesDisponibles, type LoteDisponible } from '@/lib/lotesFefo';

interface Asignacion {
  id: string;
  cantidad: number;
  created_at: string;
  lote_id: string;
  lotes?: { codigo: string; fecha_caducidad: string | null } | null;
}

interface Props {
  open: boolean;
  empresaId: string;
  ventaId: string;
  lineaId: string;
  almacenId: string | null;
  producto: { id: string; nombre: string };
  cantidadTotal: number;
  userId?: string;
  /** Se puede editar la asignación (pedido no cancelado). */
  readOnly?: boolean;
  onClose: () => void;
  /** Notifica el lote principal + resumen para refrescar la línea en pantalla. */
  onChanged: (resumen: { loteId: string | null; label: string | null }) => void;
}

/**
 * Asignación de UNO O MÁS lotes a una línea de venta/pedido.
 * Cada renglón aparta stock del lote correspondiente (trigger en base de datos).
 */
export function VentaLineaLotesDialog({
  open, empresaId, ventaId, lineaId, almacenId, producto, cantidadTotal, userId, readOnly = false, onClose, onChanged,
}: Props) {
  const [disponibles, setDisponibles] = useState<LoteDisponible[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loteId, setLoteId] = useState('');
  const [cantidad, setCantidad] = useState(0);

  const asignado = asignaciones.reduce((s, a) => s + (Number(a.cantidad) || 0), 0);
  const pendiente = Math.max(0, cantidadTotal - asignado);

  const resumen = useCallback((rows: Asignacion[]) => {
    if (rows.length === 0) return { loteId: null, label: null };
    const orden = [...rows].sort((a, b) => Number(b.cantidad) - Number(a.cantidad));
    const label = rows.length === 1
      ? (orden[0].lotes?.codigo ?? 'Lote')
      : `${rows.length} lotes`;
    return { loteId: orden[0].lote_id, label };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: asg }, disp] = await Promise.all([
      (supabase.from as any)('venta_linea_lotes')
        .select('id, cantidad, created_at, lote_id, lotes(codigo, fecha_caducidad)')
        .eq('venta_linea_id', lineaId)
        .order('created_at', { ascending: true }),
      almacenId
        ? getLotesDisponibles({ empresaId, almacenId, productoId: producto.id, excluirVentaId: ventaId })
        : Promise.resolve([] as LoteDisponible[]),
    ]);
    setAsignaciones((asg ?? []) as Asignacion[]);
    setDisponibles(disp as LoteDisponible[]);
    setLoading(false);
  }, [empresaId, almacenId, producto.id, lineaId, ventaId]);

  useEffect(() => { if (open) { load(); setLoteId(''); } }, [open, load]);
  useEffect(() => { setCantidad(pendiente); }, [pendiente]);

  const asignar = async () => {
    const qty = Number(cantidad) || 0;
    if (!loteId) { toast.error('Elige un lote'); return; }
    if (qty <= 0) { toast.error('Indica la cantidad'); return; }
    if (qty > pendiente + 0.0001) { toast.error(`Solo quedan ${pendiente} por asignar`); return; }
    setSaving(true);
    try {
      const existente = asignaciones.find(a => a.lote_id === loteId);
      if (existente) {
        const { error } = await (supabase.from as any)('venta_linea_lotes')
          .update({ cantidad: Number(existente.cantidad) + qty, updated_at: new Date().toISOString() })
          .eq('id', existente.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)('venta_linea_lotes').insert({
          empresa_id: empresaId, venta_id: ventaId, venta_linea_id: lineaId,
          producto_id: producto.id, lote_id: loteId, almacen_id: almacenId,
          cantidad: qty, user_id: userId ?? null,
        });
        if (error) throw error;
      }
      setLoteId('');
      const { data: asg } = await (supabase.from as any)('venta_linea_lotes')
        .select('id, cantidad, created_at, lote_id, lotes(codigo, fecha_caducidad)')
        .eq('venta_linea_id', lineaId)
        .order('created_at', { ascending: true });
      const rows = (asg ?? []) as Asignacion[];
      setAsignaciones(rows);
      onChanged(resumen(rows));
      await load();
      toast.success('Lote asignado');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo asignar el lote');
    } finally { setSaving(false); }
  };

  const quitar = async (a: Asignacion) => {
    setSaving(true);
    try {
      const { error } = await (supabase.from as any)('venta_linea_lotes').delete().eq('id', a.id);
      if (error) throw error;
      const rows = asignaciones.filter(x => x.id !== a.id);
      setAsignaciones(rows);
      onChanged(resumen(rows));
      await load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Lotes de {producto.nombre}</DialogTitle>
          <DialogDescription>Puedes surtir esta línea desde uno o varios lotes. Lo asignado se aparta del stock de cada lote.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>Cantidad: <strong className="tabular-nums">{cantidadTotal.toLocaleString('es-MX')}</strong></span>
          <span>Asignado: <strong className="tabular-nums text-emerald-600">{asignado.toLocaleString('es-MX')}</strong></span>
          <span>Pendiente: <strong className="tabular-nums text-amber-600">{pendiente.toLocaleString('es-MX')}</strong></span>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Cargando…</div>
        ) : (
          <>
            {asignaciones.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-2 py-1 text-xs">Lote</th>
                    <th className="text-left px-2 py-1 text-xs">Caducidad</th>
                    <th className="text-right px-2 py-1 text-xs">Cantidad</th>
                    <th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {asignaciones.map(a => (
                      <tr key={a.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-1 font-medium">{a.lotes?.codigo ?? '—'}</td>
                        <td className="px-2 py-1 text-muted-foreground">{a.lotes?.fecha_caducidad ? fmtDate(a.lotes.fecha_caducidad) : '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(a.cantidad).toLocaleString('es-MX')}</td>
                        <td className="px-2 py-1 text-center">
                          {!readOnly && (
                            <button type="button" disabled={saving} onClick={() => quitar(a)} className="text-destructive hover:text-destructive/80" title="Quitar este lote">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {readOnly ? null : pendiente > 0 ? (
              <div className="space-y-3 border-t border-border pt-3">
                <div>
                  <Label>Lote</Label>
                  <select className="input-odoo w-full" value={loteId} onChange={e => setLoteId(e.target.value)}>
                    <option value="">Selecciona un lote…</option>
                    {disponibles.map(l => (
                      <option key={l.lote_id} value={l.lote_id}>
                        {l.codigo}{l.fecha_caducidad ? ` · vence ${fmtDate(l.fecha_caducidad)}` : ''} · disp. {Number(l.disponible).toLocaleString('es-MX')}
                      </option>
                    ))}
                  </select>
                  {disponibles.length === 0 && <p className="text-xs text-muted-foreground mt-1">No hay lotes con existencia en este almacén.</p>}
                </div>
                <div className="flex items-end gap-3">
                  <div className="w-40">
                    <Label>Cantidad</Label>
                    <Input type="number" min={0} step="0.001" value={cantidad} onChange={e => setCantidad(Number(e.target.value))} />
                  </div>
                  <Button onClick={asignar} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Asignar lote</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-emerald-600 font-medium border-t border-border pt-3">Línea asignada al 100%.</p>
            )}
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
