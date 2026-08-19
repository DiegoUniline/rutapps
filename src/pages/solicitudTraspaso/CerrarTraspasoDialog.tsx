import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fmtNum } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pendiente: number;
  ejecutando?: boolean;
  onConfirm: (motivo: string | null) => void;
}

export function CerrarTraspasoDialog({ open, onOpenChange, pendiente, ejecutando, onConfirm }: Props) {
  const [motivo, setMotivo] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[60] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Cerrar traspaso</DialogTitle></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <p>
            Esta solicitud todavía tiene <strong>{fmtNum(pendiente)}</strong> piezas pendientes.
            Al cerrar el traspaso, esas cantidades ya no podrán surtirse posteriormente y quedarán
            únicamente como referencia histórica.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">Motivo (opcional)</span>
            <input className="input-odoo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ya no se requiere el faltante..." />
          </label>
        </div>
        <DialogFooter>
          <button className="btn-odoo" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button className="btn-odoo-primary" disabled={ejecutando} onClick={() => onConfirm(motivo.trim() || null)}>
            {ejecutando ? 'Cerrando...' : 'Cerrar traspaso'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CerrarTraspasoDialog;
