import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import SearchableSelect from '@/components/SearchableSelect';
import { Loader2 } from 'lucide-react';
import { todayInTimezone } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function SaldoInicialModal({ open, onOpenChange }: Props) {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayInTimezone(empresa?.zona_horaria));
  const [concepto, setConcepto] = useState('Saldo anterior');
  const [saving, setSaving] = useState(false);

  const { data: clientes } = useQuery({
    queryKey: ['clientes-select', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, codigo')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  const clienteOptions = (clientes ?? []).map(c => ({
    value: c.id,
    label: `${c.codigo ?? ''} — ${c.nombre}`.trim(),
  }));

  const reset = () => {
    setClienteId('');
    setMonto('');
    setFecha(todayInTimezone(empresa?.zona_horaria));
    setConcepto('Saldo anterior');
  };

  const handleSave = async () => {
    if (!clienteId || !monto || parseFloat(monto) <= 0) {
      toast.error('Selecciona un cliente y un monto mayor a 0');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('registrar_saldo_inicial', {
        p_empresa_id: empresa!.id,
        p_cliente_id: clienteId,
        p_monto: parseFloat(monto),
        p_fecha: fecha,
        p_concepto: concepto || 'Saldo anterior',
      });
      if (error) throw error;
      toast.success('Saldo inicial registrado');
      qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar saldo inicial</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <SearchableSelect
              options={clienteOptions}
              value={clienteId}
              onChange={setClienteId}
              placeholder="Buscar cliente..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Monto adeudado *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={monto}
              onChange={e => setMonto(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Concepto</Label>
            <Input
              placeholder="Saldo anterior"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
