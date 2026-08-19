import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import type { MatrizAlmacen } from './MinMaxMatrixTable';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  almacenes: MatrizAlmacen[];
  almacenInicial?: string;
  seleccionados: number;
  totalFiltrados: number;
  onConfirm: (almacenIds: string[], min: number | null, max: number | null, soloSel: boolean) => void;
}

export function AsignarValoresDialog({ open, onOpenChange, almacenes, almacenInicial, seleccionados, totalFiltrados, onConfirm }: Props) {
  const [destinos, setDestinos] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [soloSel, setSoloSel] = useState(false);

  useEffect(() => {
    if (open) { setDestinos(almacenInicial ? [almacenInicial] : []); setMin(''); setMax(''); setSoloSel(seleccionados > 0); }
  }, [open, almacenInicial, seleccionados]);

  const toggle = (id: string) => setDestinos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const nMin = min === '' ? null : Number(min);
  const nMax = max === '' ? null : Number(max);
  const invalido = nMin != null && nMax != null && nMax < nMin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[60] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Asignar valores</DialogTitle></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[12px] text-muted-foreground">Mínimo</label>
              <input type="number" min={0} step="0.001" className="input-odoo w-full text-right" value={min} onChange={e => setMin(e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground">Máximo</label>
              <input type="number" min={0} step="0.001" className="input-odoo w-full text-right" value={max} onChange={e => setMax(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div>
            <p className="text-[12px] text-muted-foreground mb-1">Aplicar a</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {almacenes.map(a => (
                <label key={a.id} className="flex items-center gap-2">
                  <Checkbox checked={destinos.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                  <span>{a.nombre}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={soloSel} disabled={seleccionados === 0} onCheckedChange={v => setSoloSel(!!v)} />
            <span>{seleccionados > 0 ? `Solo los ${seleccionados} productos seleccionados` : `Aplicar a los ${totalFiltrados} productos filtrados`}</span>
          </label>
          {invalido && <p className="text-[12px] text-destructive">El máximo no puede ser menor al mínimo.</p>}
        </div>
        <DialogFooter>
          <button className="btn-odoo" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button
            className="btn-odoo-primary"
            disabled={destinos.length === 0 || invalido || (nMin == null && nMax == null)}
            onClick={() => { onConfirm(destinos, nMin, nMax, soloSel); onOpenChange(false); }}
          >Aplicar valores</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AsignarValoresDialog;
