import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { roundMoney } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  cobro: any | null;
}

const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'];

export function CobroEditDialog({ open, onClose, cobro }: Props) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const [saving, setSaving] = useState(false);

  const apps = (cobro?.cobro_aplicaciones ?? []) as any[];
  const multiAplic = apps.length > 1;

  useEffect(() => {
    if (cobro) {
      setMonto(String(cobro.monto ?? ''));
      setMetodo(cobro.metodo_pago ?? 'efectivo');
      setReferencia(cobro.referencia ?? '');
      setFecha(cobro.fecha ?? '');
    }
  }, [cobro]);

  const save = async () => {
    if (!cobro) return;
    const nuevoMonto = roundMoney(parseFloat(monto) || 0);
    if (nuevoMonto <= 0) { toast.error('Monto inválido'); return; }
    setSaving(true);
    try {
      // Update cobro itself
      const { error: cobroErr } = await supabase
        .from('cobros')
        .update({ monto: nuevoMonto, metodo_pago: metodo, referencia: referencia || null, fecha })
        .eq('id', cobro.id);
      if (cobroErr) throw cobroErr;

      // Update aplicacion only if single venta (avoid ambiguity with multi-folio FIFO)
      if (apps.length === 1) {
        const { error: aplErr } = await supabase
          .from('cobro_aplicaciones')
          .update({ monto_aplicado: nuevoMonto })
          .eq('cobro_id', cobro.id);
        if (aplErr) throw aplErr;
      }

      toast.success('Cobro actualizado');
      qc.invalidateQueries({ queryKey: ['cobros-desktop', empresa?.id] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cobro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {multiAplic && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2">
              Este cobro se aplicó a {apps.length} ventas. Solo se actualizarán método, referencia y fecha. Para cambiar el monto, cancélalo y crea uno nuevo.
            </div>
          )}
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              disabled={multiAplic}
            />
          </div>
          <div>
            <Label>Método de pago</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METODOS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referencia</Label>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
