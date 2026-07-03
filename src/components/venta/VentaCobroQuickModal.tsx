import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { roundMoney, todayInTimezone } from '@/lib/utils';
import { Banknote, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  venta: { id: string; folio?: string | null; cliente_id: string; saldo_pendiente?: number; total?: number; status?: string };
  fmt: (v: number | null | undefined) => string;
  onSuccess?: () => void;
}

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

export function VentaCobroQuickModal({ open, onClose, venta, fmt, onSuccess }: Props) {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const saldo = roundMoney(Math.max(0, Number(venta.saldo_pendiente ?? venta.total ?? 0)));
  const [monto, setMonto] = useState<string>(String(saldo));
  const [metodo, setMetodo] = useState<string>('efectivo');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState<string>(() => todayInTimezone(empresa?.zona_horaria));
  const [saving, setSaving] = useState(false);
  // Guardia síncrona: evita que un doble-clic (antes de que el botón se
  // deshabilite por re-render) registre el cobro dos veces.
  const savingRef = useRef(false);

  const montoNum = roundMoney(Math.max(0, Number(monto) || 0));
  const exceedsSaldo = montoNum > saldo;

  const submit = async () => {
    if (!user || !empresa?.id) return;
    if (montoNum <= 0) { toast.error('Monto inválido'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const aplicado = Math.min(montoNum, saldo);
      const { data: cobro, error: cErr } = await supabase
        .from('cobros')
        .insert({
          empresa_id: empresa.id,
          cliente_id: venta.cliente_id,
          user_id: user.id,
          monto: montoNum,
          metodo_pago: metodo,
          referencia: referencia || null,
          fecha,
        })
        .select('id')
        .single();
      if (cErr) throw cErr;

      const { error: aErr } = await supabase
        .from('cobro_aplicaciones')
        .insert([{ cobro_id: cobro!.id, venta_id: venta.id, monto_aplicado: aplicado }]);
      if (aErr) throw aErr;

      const newSaldo = roundMoney(saldo - aplicado);
      if (newSaldo <= 0.01 && venta.status === 'borrador') {
        await supabase.from('ventas').update({ status: 'confirmado' as any }).eq('id', venta.id);
      }

      toast.success(`Cobro registrado a ${venta.folio ?? 'venta'} por ${fmt(aplicado)}`);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cobros-desktop'] });
      qc.invalidateQueries({ queryKey: ['venta-expanded', venta.id] });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al registrar el cobro');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Registrar cobro · {venta.folio ?? 'Venta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{fmt(venta.total ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendiente</span><span className="font-bold text-warning">{fmt(saldo)}</span></div>
          </div>

          <div>
            <Label htmlFor="monto">Monto a cobrar</Label>
            <Input
              id="monto"
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
            />
            <div className="flex gap-1 mt-1">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMonto(String(saldo))}>
                Saldar ({fmt(saldo)})
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMonto(String(roundMoney(saldo / 2)))}>
                50%
              </Button>
            </div>
            {exceedsSaldo && (
              <p className="text-[11px] text-warning mt-1">El monto supera el saldo; sólo se aplicará {fmt(saldo)}.</p>
            )}
          </div>

          <div>
            <Label>Método de pago</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METODOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="referencia">Referencia (opcional)</Label>
            <Input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="No. transferencia, folio..." />
          </div>

          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || montoNum <= 0}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando</> : <>Registrar cobro</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
