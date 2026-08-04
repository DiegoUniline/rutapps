import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmtDate, fmtNum } from '@/lib/utils';

interface LoteDisponible {
  lote_id: string;
  codigo: string;
  fecha_caducidad: string | null;
  disponible: number;
}

interface Asignacion {
  id: string;
  lote_id: string;
  cantidad: number;
  lotes?: { codigo: string; fecha_caducidad: string | null } | null;
}

interface Props {
  open: boolean;
  empresaId: string;
  traspasoId: string;
  lineaId: string;
  producto: { id: string; nombre: string };
  almacenOrigenId: string;
  cantidadTotal: number;
  readOnly?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function TraspasoLineaLotesDialog({
  open, empresaId, traspasoId, lineaId, producto, almacenOrigenId,
  cantidadTotal, readOnly = false, onClose, onChanged,
}: Props) {
  const [disponibles, setDisponibles] = useState<LoteDisponible[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loteId, setLoteId] = useState('');
  const [cantidad, setCantidad] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const asignado = useMemo(() => asignaciones.reduce((sum, item) => sum + Number(item.cantidad || 0), 0), [asignaciones]);
  const pendiente = Math.max(0, cantidadTotal - asignado);
  const loteElegido = disponibles.find(lote => lote.lote_id === loteId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: stock, error: stockError }, { data: rows, error: rowsError }] = await Promise.all([
        (supabase.from as any)('stock_lotes')
          .select('lote_id, cantidad, lotes(codigo, fecha_caducidad)')
          .eq('empresa_id', empresaId)
          .eq('almacen_id', almacenOrigenId)
          .eq('producto_id', producto.id)
          .gt('cantidad', 0),
        (supabase.from as any)('traspaso_linea_lotes')
          .select('id, lote_id, cantidad, lotes(codigo, fecha_caducidad)')
          .eq('traspaso_linea_id', lineaId)
          .order('created_at'),
      ]);
      if (stockError) throw stockError;
      if (rowsError) throw rowsError;
      setDisponibles((stock ?? []).map((row: any) => ({
        lote_id: row.lote_id,
        codigo: row.lotes?.codigo ?? 'Lote',
        fecha_caducidad: row.lotes?.fecha_caducidad ?? null,
        disponible: Number(row.cantidad ?? 0),
      })));
      setAsignaciones((rows ?? []) as Asignacion[]);
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron cargar los lotes');
    } finally {
      setLoading(false);
    }
  }, [almacenOrigenId, empresaId, lineaId, producto.id]);

  useEffect(() => {
    if (open) {
      setLoteId('');
      load();
    }
  }, [load, open]);
  useEffect(() => setCantidad(pendiente), [pendiente]);

  const asignar = async () => {
    const qty = Number(cantidad || 0);
    if (!loteId || !loteElegido) return toast.error('Elige un lote');
    if (qty <= 0) return toast.error('Indica una cantidad válida');
    if (qty > pendiente + 0.0001) return toast.error(`Solo faltan ${fmtNum(pendiente)} por asignar`);
    const existente = asignaciones.find(item => item.lote_id === loteId);
    const yaAsignado = Number(existente?.cantidad ?? 0);
    if (qty + yaAsignado > loteElegido.disponible + 0.0001) {
      return toast.error(`Ese lote solo tiene ${fmtNum(loteElegido.disponible)} disponibles`);
    }
    setSaving(true);
    try {
      const payload = existente
        ? (supabase.from as any)('traspaso_linea_lotes').update({ cantidad: yaAsignado + qty }).eq('id', existente.id)
        : (supabase.from as any)('traspaso_linea_lotes').insert({
            empresa_id: empresaId, traspaso_id: traspasoId, traspaso_linea_id: lineaId,
            producto_id: producto.id, lote_id: loteId, cantidad: qty,
          });
      const { error } = await payload;
      if (error) throw error;
      setLoteId('');
      await load();
      onChanged();
      toast.success('Lote asignado al traspaso');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo asignar el lote');
    } finally {
      setSaving(false);
    }
  };

  const quitar = async (item: Asignacion) => {
    setSaving(true);
    try {
      const { error } = await (supabase.from as any)('traspaso_linea_lotes').delete().eq('id', item.id);
      if (error) throw error;
      await load();
      onChanged();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo quitar el lote');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Lotes de {producto.nombre}</DialogTitle>
          <DialogDescription>Selecciona uno o varios lotes y cuánto se moverá de cada uno.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 rounded border border-border bg-muted/40 p-3 text-sm text-center">
          <span>A traspasar<br /><strong>{fmtNum(cantidadTotal)}</strong></span>
          <span>Asignado<br /><strong className="text-emerald-600">{fmtNum(asignado)}</strong></span>
          <span>Pendiente<br /><strong className="text-amber-600">{fmtNum(pendiente)}</strong></span>
        </div>
        {loading ? <div className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></div> : (
          <div className="space-y-3">
            {asignaciones.length > 0 && <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm"><thead><tr className="bg-muted/40 border-b border-border">
                <th className="p-2 text-left">Lote</th><th className="p-2 text-left">Caducidad</th><th className="p-2 text-right">Cantidad</th><th className="w-10" />
              </tr></thead><tbody>{asignaciones.map(item => <tr key={item.id} className="border-b border-border last:border-0">
                <td className="p-2 font-medium">{item.lotes?.codigo ?? '—'}</td>
                <td className="p-2 text-muted-foreground">{item.lotes?.fecha_caducidad ? fmtDate(item.lotes.fecha_caducidad) : '—'}</td>
                <td className="p-2 text-right tabular-nums">{fmtNum(item.cantidad)}</td>
                <td>{!readOnly && <Button size="icon" variant="ghost" disabled={saving} onClick={() => quitar(item)} aria-label="Quitar lote"><Trash2 className="h-4 w-4 text-destructive" /></Button>}</td>
              </tr>)}</tbody></table>
            </div>}
            {!readOnly && pendiente > 0 && <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end border-t border-border pt-3">
              <div><Label>Lote</Label><select className="input-odoo w-full" value={loteId} onChange={event => setLoteId(event.target.value)}>
                <option value="">Selecciona un lote…</option>
                {disponibles.map(lote => <option key={lote.lote_id} value={lote.lote_id}>{lote.codigo} · {lote.fecha_caducidad ? fmtDate(lote.fecha_caducidad) : 'sin caducidad'} · disp. {fmtNum(lote.disponible)}</option>)}
              </select></div>
              <div><Label>Cantidad</Label><Input type="number" min={0} step="0.001" value={cantidad} onChange={event => setCantidad(Number(event.target.value))} /></div>
              <Button onClick={asignar} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Asignar</Button>
            </div>}
            {!readOnly && disponibles.length === 0 && <p className="text-sm text-destructive">No hay lotes con existencia en el origen seleccionado.</p>}
            {pendiente === 0 && <p className="text-sm font-medium text-emerald-600">La cantidad está asignada al 100%.</p>}
          </div>
        )}
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
      </DialogContent>
    </Dialog>
  );
}