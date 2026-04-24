import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Receipt } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: 'retiro' | 'deposito' | 'gasto';
}

const META = {
  retiro:   { label: 'Retiro de efectivo', icon: ArrowUp,  color: 'text-destructive' },
  deposito: { label: 'Depósito a caja',    icon: ArrowDown, color: 'text-emerald-600' },
  gasto:    { label: 'Gasto de caja',      icon: Receipt,  color: 'text-amber-600' },
} as const;

export function MovimientoCajaModal({ open, onOpenChange, tipo }: Props) {
  const { registrarMovimiento } = useCajaTurno();
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);

  const meta = META[tipo];
  const Icon = meta.icon;

  const handleSubmit = async () => {
    const v = parseFloat(monto) || 0;
    if (v <= 0) { toast.error('Monto inválido'); return; }
    setBusy(true);
    try {
      await registrarMovimiento.mutateAsync({ tipo, monto: v, motivo: motivo.trim() || undefined });
      toast.success(`${meta.label} registrado`);
      onOpenChange(false);
      setMonto(''); setMotivo('');
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${meta.color}`} /> {meta.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <Label>{tipo === 'gasto' ? 'Concepto del gasto' : 'Motivo'}</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === 'gasto' ? 'Ej. Papelería' : 'Opcional'} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={busy}>{busy ? 'Guardando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
