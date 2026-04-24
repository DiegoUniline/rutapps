import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { toast } from 'sonner';
import { LockOpen } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AbrirTurnoModal({ open, onOpenChange }: Props) {
  const { abrirTurno } = useCajaTurno();
  const [cajaNombre, setCajaNombre] = useState('Caja Principal');
  const [fondo, setFondo] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const monto = parseFloat(fondo) || 0;
    if (monto < 0) { toast.error('El fondo no puede ser negativo'); return; }
    setBusy(true);
    try {
      await abrirTurno.mutateAsync({ caja_nombre: cajaNombre.trim() || 'Caja Principal', fondo_inicial: monto, notas: notas.trim() || undefined });
      toast.success('Turno abierto');
      onOpenChange(false);
      setFondo(''); setNotas('');
    } catch (e: any) {
      toast.error(e.message || 'Error al abrir turno');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5 text-primary" /> Abrir turno de caja
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nombre de caja</Label>
            <Input value={cajaNombre} onChange={(e) => setCajaNombre(e.target.value)} placeholder="Caja Principal" />
          </div>
          <div>
            <Label>Fondo inicial (efectivo en caja)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={busy}>{busy ? 'Abriendo…' : 'Abrir turno'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
