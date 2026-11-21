import { useState } from 'react';
import { CalendarClock, History } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type ModoGuardado = 'adelante' | 'historico';

interface Props {
  nombre: string;
  onCancel: () => void;
  onConfirm: (modo: ModoGuardado) => void;
  saving?: boolean;
}

/**
 * Pregunta si los cambios de un esquema existente aplican solo hacia adelante
 * (nueva versión con vigencia desde hoy) o también al histórico no pagado.
 */
export default function EsquemaVigenciaDialog({ nombre, onCancel, onConfirm, saving }: Props) {
  const [modo, setModo] = useState<ModoGuardado>('adelante');

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle>¿Cómo aplicamos el cambio?</DialogTitle>
          <DialogDescription className="text-xs">
            Estás modificando el esquema <span className="font-medium">{nombre}</span>. Los recibos ya generados nunca se modifican.
          </DialogDescription>
        </DialogHeader>

        <label className={`flex gap-3 items-start border rounded p-3 cursor-pointer ${modo === 'adelante' ? 'border-primary bg-primary/5' : 'border-border'}`}>
          <input type="radio" className="mt-1" checked={modo === 'adelante'} onChange={() => setModo('adelante')} />
          <div>
            <div className="text-sm font-medium flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Solo de aquí en adelante</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Se crea una nueva versión del esquema vigente desde hoy y se reasigna a los vendedores que lo tenían.
              Los periodos anteriores conservan las condiciones viejas. Recomendado.
            </div>
          </div>
        </label>

        <label className={`flex gap-3 items-start border rounded p-3 cursor-pointer ${modo === 'historico' ? 'border-warning bg-warning/5' : 'border-border'}`}>
          <input type="radio" className="mt-1" checked={modo === 'historico'} onChange={() => setModo('historico')} />
          <div>
            <div className="text-sm font-medium flex items-center gap-1"><History className="h-3.5 w-3.5" /> Actualizar también el histórico</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Se edita el esquema actual: todos los periodos aún no pagados se recalculan con las condiciones nuevas y los montos pendientes cambiarán.
            </div>
          </div>
        </label>

        <DialogFooter className="gap-2 sm:space-x-0">
          <button onClick={onCancel} className="btn-cancelar btn-odoo-secondary">Cancelar</button>
          <button onClick={() => onConfirm(modo)} disabled={saving} className="btn-odoo-primary">
            {saving ? 'Guardando...' : 'Aplicar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
