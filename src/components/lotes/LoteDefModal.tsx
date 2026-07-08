import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';

export interface LoteDef {
  codigo: string;
  caducidad: string;
  fabricacion: string;
  costo: string;
}

interface Props {
  initial?: LoteDef | null;
  onClose: () => void;
  onConfirm: (def: LoteDef) => void;
}

/**
 * Modal para DEFINIR un lote (código, caducidad, fabricación, costo) que luego se
 * asigna masivamente a varios productos (p.ej. desde Ajustes de inventario).
 * No toca la base — solo devuelve los datos capturados.
 */
export function LoteDefModal({ initial, onClose, onConfirm }: Props) {
  const [codigo, setCodigo] = useState(initial?.codigo ?? '');
  const [caducidad, setCaducidad] = useState(initial?.caducidad ?? '');
  const [fabricacion, setFabricacion] = useState(initial?.fabricacion ?? '');
  const [costo, setCosto] = useState(initial?.costo ?? '');

  const confirmar = () => {
    if (!codigo.trim()) { toast.error('El código de lote es obligatorio'); return; }
    onConfirm({ codigo: codigo.trim(), caducidad, fabricacion, costo });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Definir lote
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            Se asignará a los productos contados con su existencia. El producto pasará a manejar lote.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label-odoo">Código de lote *</label>
            <input className="input-odoo w-full" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej. L-2026-014" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-odoo">Caducidad</label>
              <input type="date" className="input-odoo w-full" value={caducidad} onChange={e => setCaducidad(e.target.value)} />
            </div>
            <div>
              <label className="label-odoo">Fabricación</label>
              <input type="date" className="input-odoo w-full" value={fabricacion} onChange={e => setFabricacion(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-odoo">Costo por unidad</label>
            <input type="number" step="0.0001" min="0" className="input-odoo w-full" value={costo} onChange={e => setCosto(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo text-sm">Cancelar</button>
          <button onClick={confirmar} className="btn-odoo-primary text-sm">Usar este lote</button>
        </div>
      </div>
    </div>
  );
}
