import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { fmtMoney } from '@/lib/currency';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ArqueoRow = ({ label, esperadoVal, val, onChange }: { label: string; esperadoVal: number; val: string; onChange: (v: string) => void }) => (
  <div className="grid grid-cols-3 gap-2 items-center">
    <Label className="text-sm">{label}</Label>
    <div className="text-xs text-muted-foreground text-right">Esperado: <span className="font-medium text-foreground">{fmtMoney(esperadoVal)}</span></div>
    <Input type="number" inputMode="decimal" value={val} onChange={(e) => onChange(e.target.value)} placeholder="0.00" />
  </div>
);

export function CerrarTurnoModal({ open, onOpenChange }: Props) {
  const { turno, cerrarTurno, computeArqueo } = useCajaTurno();
  const [esperado, setEsperado] = useState({ efectivo_esperado: 0, tarjeta_esperado: 0, transferencia_esperado: 0, otros_esperado: 0 });
  const [efectivo, setEfectivo] = useState('');
  const [tarjeta, setTarjeta] = useState('');
  const [transfer, setTransfer] = useState('');
  const [otros, setOtros] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    computeArqueo().then((r) => {
      setEsperado(r);
      setTarjeta(r.tarjeta_esperado.toFixed(2));
      setTransfer(r.transferencia_esperado.toFixed(2));
      setOtros(r.otros_esperado.toFixed(2));
    });
  }, [open]);

  const efectivoNum = parseFloat(efectivo) || 0;
  const tarjetaNum = parseFloat(tarjeta) || 0;
  const transferNum = parseFloat(transfer) || 0;
  const otrosNum = parseFloat(otros) || 0;
  const totalContado = efectivoNum + tarjetaNum + transferNum + otrosNum;
  const totalEsperado = esperado.efectivo_esperado + esperado.tarjeta_esperado + esperado.transferencia_esperado + esperado.otros_esperado;
  const diferencia = totalContado - totalEsperado;

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await cerrarTurno.mutateAsync({
        efectivo_contado: efectivoNum,
        tarjeta_contado: tarjetaNum,
        transferencia_contado: transferNum,
        otros_contado: otrosNum,
        notas: notas.trim() || undefined,
      });
      toast.success('Turno cerrado');
      onOpenChange(false);
      setEfectivo(''); setNotas('');
    } catch (e: any) {
      toast.error(e.message || 'Error al cerrar');
    } finally {
      setBusy(false);
    }
  };

  if (!turno) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-destructive" /> Cerrar turno – Arqueo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">
            Caja: <span className="font-medium text-foreground">{turno.caja_nombre}</span> · Fondo inicial: <span className="font-medium text-foreground">{fmtMoney(turno.fondo_inicial)}</span>
          </div>
          <ArqueoRow label="Efectivo" esperadoVal={esperado.efectivo_esperado} val={efectivo} onChange={setEfectivo} />
          <ArqueoRow label="Tarjeta" esperadoVal={esperado.tarjeta_esperado} val={tarjeta} onChange={setTarjeta} />
          <ArqueoRow label="Transferencia" esperadoVal={esperado.transferencia_esperado} val={transfer} onChange={setTransfer} />
          <ArqueoRow label="Otros" esperadoVal={esperado.otros_esperado} val={otros} onChange={setOtros} />
          <div className="border-t border-border pt-3 mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total esperado</span><span className="font-medium">{fmtMoney(totalEsperado)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total contado</span><span className="font-medium">{fmtMoney(totalContado)}</span></div>
            <div className={`flex justify-between text-base font-bold ${diferencia === 0 ? 'text-foreground' : diferencia > 0 ? 'text-primary' : 'text-destructive'}`}>
              <span>Diferencia</span><span>{fmtMoney(diferencia)}</span>
            </div>
          </div>
          <div>
            <Label>Notas de cierre</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={busy}>{busy ? 'Cerrando…' : 'Cerrar turno'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
