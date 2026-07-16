import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/NumericInput';
import { toRequiredNumber } from '@/lib/numericInput';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { fmtMoney } from '@/lib/currency';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ArqueoRow = ({
  label,
  val,
  onChange,
}: {
  label: string;
  val: number | null;
  onChange: (v: number | null) => void;
}) => (
  <div className="grid grid-cols-2 gap-2 items-center">
    <Label className="text-sm">{label}</Label>
    <NumericInput value={val} onChange={onChange} placeholder="0.00" allowDecimals min={0} />
  </div>
);

export function CerrarTurnoModal({ open, onOpenChange }: Props) {
  const { turno, cerrarTurno, computeArqueo } = useCajaTurno();
  const [esperado, setEsperado] = useState({ efectivo_esperado: 0, tarjeta_esperado: 0, transferencia_esperado: 0, otros_esperado: 0 });
  const [efectivo, setEfectivo] = useState<number | null>(null);
  const [tarjeta, setTarjeta] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<number | null>(null);
  const [otros, setOtros] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    computeArqueo().then(setEsperado);
    setEfectivo(null); setTarjeta(null); setTransfer(null); setOtros(null); setNotas('');
  }, [open]);

  const efectivoNum = toRequiredNumber(efectivo);
  const tarjetaNum = toRequiredNumber(tarjeta);
  const transferNum = toRequiredNumber(transfer);
  const otrosNum = toRequiredNumber(otros);
  const totalContado = efectivoNum + tarjetaNum + transferNum + otrosNum;

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
      setEfectivo(null); setNotas('');
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
          <ArqueoRow label="Efectivo" val={efectivo} onChange={setEfectivo} />
          <ArqueoRow label="Tarjeta" val={tarjeta} onChange={setTarjeta} />
          <ArqueoRow label="Transferencia" val={transfer} onChange={setTransfer} />
          <ArqueoRow label="Otros" val={otros} onChange={setOtros} />
          <div className="border-t border-border pt-3 mt-2 text-sm">
            <div className="flex justify-between text-base font-bold"><span>Total contado</span><span>{fmtMoney(totalContado)}</span></div>
            <p className="text-xs text-muted-foreground mt-1">El comparativo con lo esperado se calculará al cerrar el turno.</p>
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
