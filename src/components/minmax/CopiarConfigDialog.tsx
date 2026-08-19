import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import type { MatrizAlmacen } from './MinMaxMatrixTable';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  almacenes: MatrizAlmacen[];
  origenInicial?: string;
  soloSeleccionados: number;
  onConfirm: (origen: string, destinos: string[], soloSel: boolean) => void;
}

export function CopiarConfigDialog({ open, onOpenChange, almacenes, origenInicial, soloSeleccionados, onConfirm }: Props) {
  const [origen, setOrigen] = useState(origenInicial ?? almacenes[0]?.id ?? '');
  const [destinos, setDestinos] = useState<string[]>([]);
  const [soloSel, setSoloSel] = useState(false);

  useEffect(() => {
    if (open) { setOrigen(origenInicial ?? almacenes[0]?.id ?? ''); setDestinos([]); setSoloSel(soloSeleccionados > 0); }
  }, [open, origenInicial, almacenes, soloSeleccionados]);

  const nombre = (id: string) => almacenes.find(a => a.id === id)?.nombre ?? '';
  const toggle = (id: string) => setDestinos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[60] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Copiar configuración</DialogTitle></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div>
            <label className="text-[12px] text-muted-foreground">Origen</label>
            <select className="input-odoo w-full" value={origen} onChange={e => setOrigen(e.target.value)}>
              {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[12px] text-muted-foreground mb-1">Destinos</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {almacenes.filter(a => a.id !== origen).map(a => (
                <label key={a.id} className="flex items-center gap-2">
                  <Checkbox checked={destinos.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                  <span>{a.nombre}</span>
                </label>
              ))}
            </div>
          </div>
          {soloSeleccionados > 0 && (
            <label className="flex items-center gap-2">
              <Checkbox checked={soloSel} onCheckedChange={v => setSoloSel(!!v)} />
              <span>Aplicar solo a los {soloSeleccionados} productos seleccionados</span>
            </label>
          )}
          {destinos.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Se copiarán los máximos y mínimos de {nombre(origen)} a {destinos.map(nombre).join(', ')}. No se modifican las existencias reales.
            </p>
          )}
        </div>
        <DialogFooter>
          <button className="btn-odoo" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button
            className="btn-odoo-primary"
            disabled={!origen || destinos.length === 0}
            onClick={() => { onConfirm(origen, destinos, soloSel); onOpenChange(false); }}
          >Copiar configuración</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CopiarConfigDialog;
