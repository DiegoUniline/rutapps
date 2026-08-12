import { useState } from 'react';
import { X, CalendarClock, History } from 'lucide-react';

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
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">¿Cómo aplicamos el cambio?</h3>
          <button onClick={onCancel} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Estás modificando el esquema <span className="font-medium">{nombre}</span>. Los recibos ya generados nunca se modifican.
        </p>

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

        <label className={`flex gap-3 items-start border rounded p-3 cursor-pointer ${modo === 'historico' ? 'border-amber-500 bg-amber-500/5' : 'border-border'}`}>
          <input type="radio" className="mt-1" checked={modo === 'historico'} onChange={() => setModo('historico')} />
          <div>
            <div className="text-sm font-medium flex items-center gap-1"><History className="h-3.5 w-3.5" /> Actualizar también el histórico</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Se edita el esquema actual: todos los periodos aún no pagados se recalculan con las condiciones nuevas y los montos pendientes cambiarán.
            </div>
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="btn-odoo-secondary">Cancelar</button>
          <button onClick={() => onConfirm(modo)} disabled={saving} className="btn-odoo-primary">
            {saving ? 'Guardando...' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
