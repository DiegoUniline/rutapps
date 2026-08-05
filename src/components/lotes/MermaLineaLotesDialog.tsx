import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmtDate, fmtNum } from '@/lib/utils';
import { getLotesDisponibles, pickFefo, type LoteDisponible } from '@/lib/lotesFefo';

export interface MermaLoteAsignacion {
  lote_id: string;
  codigo: string;
  fecha_caducidad: string | null;
  cantidad: number;
}

interface Props {
  open: boolean;
  empresaId: string;
  almacenOrigenId: string;
  producto: { id: string; nombre: string };
  cantidadTotal: number;
  asignaciones: MermaLoteAsignacion[];
  onChange: (asignaciones: MermaLoteAsignacion[]) => void;
  onClose: () => void;
}

/**
 * Reparto de lotes de una línea de merma. La merma aún no existe cuando se
 * captura, por eso las asignaciones viven en memoria y se envían dentro del
 * payload de `registrar_merma`.
 */
export function MermaLineaLotesDialog({
  open, empresaId, almacenOrigenId, producto, cantidadTotal, asignaciones, onChange, onClose,
}: Props) {
  const [disponibles, setDisponibles] = useState<LoteDisponible[]>([]);
  const [loteId, setLoteId] = useState('');
  const [cantidad, setCantidad] = useState(0);
  const [loading, setLoading] = useState(false);

  const asignado = useMemo(
    () => asignaciones.reduce((sum, item) => sum + Number(item.cantidad || 0), 0),
    [asignaciones],
  );
  const pendiente = Math.max(0, cantidadTotal - asignado);
  const loteElegido = disponibles.find(lote => lote.lote_id === loteId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getLotesDisponibles({ empresaId, almacenId: almacenOrigenId, productoId: producto.id });
      const conStock = rows.filter(row => row.cantidad > 0);
      setDisponibles(conStock);
      if (asignaciones.length === 0) {
        const sugerido = pickFefo(conStock, cantidadTotal);
        setLoteId(sugerido?.lote_id ?? '');
      }
    } catch (error: any) {
      toast.error(error?.message || 'No se pudieron cargar los lotes');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenOrigenId, cantidadTotal, empresaId, producto.id]);

  useEffect(() => {
    if (open) load();
  }, [load, open]);
  useEffect(() => setCantidad(pendiente), [pendiente]);

  const asignar = () => {
    const qty = Number(cantidad || 0);
    if (!loteId || !loteElegido) return toast.error('Elige un lote');
    if (qty <= 0) return toast.error('Indica una cantidad válida');
    if (qty > pendiente + 0.0001) return toast.error(`Solo faltan ${fmtNum(pendiente)} por asignar`);
    const existente = asignaciones.find(item => item.lote_id === loteId);
    const yaAsignado = Number(existente?.cantidad ?? 0);
    if (qty + yaAsignado > loteElegido.cantidad + 0.0001) {
      return toast.error(`Ese lote solo tiene ${fmtNum(loteElegido.cantidad)} en existencia`);
    }
    const siguiente = existente
      ? asignaciones.map(item => item.lote_id === loteId ? { ...item, cantidad: yaAsignado + qty } : item)
      : [...asignaciones, {
          lote_id: loteId,
          codigo: loteElegido.codigo,
          fecha_caducidad: loteElegido.fecha_caducidad,
          cantidad: qty,
        }];
    onChange(siguiente);
    setLoteId('');
  };

  const quitar = (item: MermaLoteAsignacion) => {
    onChange(asignaciones.filter(row => row.lote_id !== item.lote_id));
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Lotes de {producto.nombre}</DialogTitle>
          <DialogDescription>Selecciona uno o varios lotes y cuánto se mermará de cada uno.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 rounded border border-border bg-muted/40 p-3 text-sm text-center">
          <span>A mermar<br /><strong>{fmtNum(cantidadTotal)}</strong></span>
          <span>Asignado<br /><strong className="text-emerald-600">{fmtNum(asignado)}</strong></span>
          <span>Pendiente<br /><strong className="text-amber-600">{fmtNum(pendiente)}</strong></span>
        </div>
        {loading ? <div className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></div> : (
          <div className="space-y-3">
            {asignaciones.length > 0 && <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm"><thead><tr className="bg-muted/40 border-b border-border">
                <th className="p-2 text-left">Lote</th><th className="p-2 text-left">Caducidad</th><th className="p-2 text-right">Cantidad</th><th className="w-10" />
              </tr></thead><tbody>{asignaciones.map(item => <tr key={item.lote_id} className="border-b border-border last:border-0">
                <td className="p-2 font-medium">{item.codigo}</td>
                <td className="p-2 text-muted-foreground">{item.fecha_caducidad ? fmtDate(item.fecha_caducidad) : '—'}</td>
                <td className="p-2 text-right tabular-nums">{fmtNum(item.cantidad)}</td>
                <td><Button size="icon" variant="ghost" onClick={() => quitar(item)} aria-label="Quitar lote"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
              </tr>)}</tbody></table>
            </div>}
            {pendiente > 0 && <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end border-t border-border pt-3">
              <div><Label>Lote</Label><select className="input-odoo w-full" value={loteId} onChange={event => setLoteId(event.target.value)}>
                <option value="">Selecciona un lote…</option>
                {disponibles.map(lote => <option key={lote.lote_id} value={lote.lote_id}>{lote.codigo} · {lote.fecha_caducidad ? fmtDate(lote.fecha_caducidad) : 'sin caducidad'} · exist. {fmtNum(lote.cantidad)}</option>)}
              </select></div>
              <div><Label>Cantidad</Label><Input type="number" min={0} step="0.001" value={cantidad} onChange={event => setCantidad(Number(event.target.value))} /></div>
              <Button onClick={asignar}>Asignar</Button>
            </div>}
            {disponibles.length === 0 && <p className="text-sm text-destructive">No hay lotes con existencia en el almacén origen.</p>}
            {pendiente === 0 && <p className="text-sm font-medium text-emerald-600">La cantidad está asignada al 100%.</p>}
          </div>
        )}
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
