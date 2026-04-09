import { useState, useMemo } from 'react';
import { Wallet, Banknote, CreditCard, Package, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

type PayMode = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto';

interface Props {
  open: boolean;
  total: number;
  clienteNombre: string;
  clienteCredito?: boolean;
  clienteDiasCredito?: number;
  clienteLimiteCredito?: number;
  saving?: boolean;
  onConfirm: (pagos: { metodo: string; monto: number; referencia: string }[], condicion: 'contado' | 'credito') => void;
  onClose: () => void;
}

export function VentaCheckoutModal({
  open, total, clienteNombre, clienteCredito, clienteDiasCredito = 0, clienteLimiteCredito = 0,
  saving, onConfirm, onClose,
}: Props) {
  const { fmt } = useCurrency();
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('contado');
  const [payMode, setPayMode] = useState<PayMode>('efectivo');
  const [payEfectivo, setPayEfectivo] = useState(total.toFixed(2));
  const [payTransferencia, setPayTransferencia] = useState('');
  const [payTarjeta, setPayTarjeta] = useState('');
  const [refTransferencia, setRefTransferencia] = useState('');
  const [refTarjeta, setRefTarjeta] = useState('');

  const totalPagado = useMemo(() => {
    if (condicion === 'credito') return 0;
    return (parseFloat(payEfectivo) || 0) + (parseFloat(payTransferencia) || 0) + (parseFloat(payTarjeta) || 0);
  }, [payEfectivo, payTransferencia, payTarjeta, condicion]);

  const faltante = Math.max(0, total - totalPagado);
  const cambio = payMode === 'efectivo' && condicion === 'contado' ? Math.max(0, totalPagado - total) : 0;

  const quickAmounts = useMemo(() => {
    const amounts: number[] = [];
    const rounded = [
      Math.ceil(total / 10) * 10,
      Math.ceil(total / 20) * 20,
      Math.ceil(total / 50) * 50,
      Math.ceil(total / 100) * 100,
      Math.ceil(total / 200) * 200,
      Math.ceil(total / 500) * 500,
    ];
    const unique = [...new Set(rounded)].filter(a => a >= total && a > 0).slice(0, 4);
    return unique;
  }, [total]);

  const handleConfirm = () => {
    if (condicion === 'credito') {
      onConfirm([], 'credito');
      return;
    }
    const pagos: { metodo: string; monto: number; referencia: string }[] = [];
    const ef = parseFloat(payEfectivo) || 0;
    const tr = parseFloat(payTransferencia) || 0;
    const ta = parseFloat(payTarjeta) || 0;
    // For efectivo, cap at total (don't register change as payment)
    if (ef > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(ef, total), referencia: '' });
    if (tr > 0) pagos.push({ metodo: 'transferencia', monto: tr, referencia: refTransferencia });
    if (ta > 0) pagos.push({ metodo: 'tarjeta', monto: ta, referencia: refTarjeta });
    onConfirm(pagos, 'contado');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-end sm:items-center justify-center" onClick={() => !saving && onClose()}>
      <div className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden border border-border max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-bold text-foreground">Cobrar venta</h3>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-accent">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-[13px] text-muted-foreground">{clienteNombre}</span>
            <span className="text-[28px] font-black text-primary tabular-nums">{fmt(total)}</span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-auto flex-1">
          {/* Condición de pago */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Condición de pago</label>
            <div className="flex gap-2 mt-1.5">
              <button onClick={() => { setCondicion('contado'); setPayMode('efectivo'); setPayEfectivo(total.toFixed(2)); setPayTransferencia(''); setPayTarjeta(''); }}
                className={cn("flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all",
                  condicion === 'contado' ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground')}>
                Contado
              </button>
              {clienteCredito && (
                <button onClick={() => { setCondicion('credito'); setPayMode('efectivo'); setPayEfectivo(''); setPayTransferencia(''); setPayTarjeta(''); }}
                  className={cn("flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all",
                    condicion === 'credito' ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground')}>
                  Crédito
                </button>
              )}
            </div>
          </div>

          {/* Credit details */}
          {condicion === 'credito' && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Límite de crédito</span>
                <span className="font-semibold text-foreground">{fmt(clienteLimiteCredito)}</span>
              </div>
              {clienteDiasCredito > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Días de crédito</span>
                  <span className="font-semibold text-foreground">{clienteDiasCredito} días</span>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Se registrará a crédito — no se cobra ahora</p>
            </div>
          )}

          {/* Payment method selector — only for contado */}
          {condicion === 'contado' && (
            <>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Método de pago</label>
                <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                  {([
                    { key: 'efectivo' as PayMode, label: 'Efectivo', icon: Wallet },
                    { key: 'transferencia' as PayMode, label: 'Transfer.', icon: Banknote },
                    { key: 'tarjeta' as PayMode, label: 'Tarjeta', icon: CreditCard },
                    { key: 'mixto' as PayMode, label: 'Mixto', icon: Package },
                  ]).map(m => (
                    <button key={m.key} onClick={() => {
                      setPayMode(m.key);
                      if (m.key === 'efectivo') { setPayEfectivo(total.toFixed(2)); setPayTransferencia(''); setPayTarjeta(''); }
                      else if (m.key === 'transferencia') { setPayEfectivo(''); setPayTransferencia(total.toFixed(2)); setPayTarjeta(''); }
                      else if (m.key === 'tarjeta') { setPayEfectivo(''); setPayTransferencia(''); setPayTarjeta(total.toFixed(2)); }
                      else if (m.key === 'mixto') { setPayEfectivo(''); setPayTransferencia(''); setPayTarjeta(''); }
                    }}
                      className={cn("flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-all",
                        payMode === m.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground hover:bg-accent')}>
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Efectivo */}
              {(payMode === 'efectivo' || payMode === 'mixto') && (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="text-[12px] font-semibold text-foreground flex-1">Efectivo</span>
                    {payMode === 'mixto' && (
                      <button onClick={() => setPayEfectivo(Math.max(0, total - (parseFloat(payTransferencia) || 0) - (parseFloat(payTarjeta) || 0)).toFixed(2))}
                        className="text-[10px] text-primary font-semibold hover:underline">Exacto</button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">$</span>
                    <input type="number" inputMode="decimal" autoFocus
                      className="w-full bg-accent/30 border border-border rounded-lg pl-7 pr-2 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={payEfectivo} placeholder="0.00" onChange={e => setPayEfectivo(e.target.value)}
                    />
                  </div>
                  {payMode === 'efectivo' && quickAmounts.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {quickAmounts.map(a => (
                        <button key={a} onClick={() => setPayEfectivo(a.toString())}
                          className={cn("flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                            parseFloat(payEfectivo) === a ? 'bg-primary text-primary-foreground' : 'bg-accent/50 text-foreground border border-border hover:bg-accent')}>
                          {fmt(a)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Transferencia */}
              {(payMode === 'transferencia' || payMode === 'mixto') && (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-4 w-4 text-primary" />
                    <span className="text-[12px] font-semibold text-foreground flex-1">Transferencia</span>
                    {payMode === 'mixto' && (
                      <button onClick={() => setPayTransferencia(Math.max(0, total - (parseFloat(payEfectivo) || 0) - (parseFloat(payTarjeta) || 0)).toFixed(2))}
                        className="text-[10px] text-primary font-semibold hover:underline">Exacto</button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">$</span>
                    <input type="number" inputMode="decimal"
                      className="w-full bg-accent/30 border border-border rounded-lg pl-7 pr-2 py-2.5 text-[14px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={payTransferencia} placeholder="0.00" onChange={e => setPayTransferencia(e.target.value)}
                    />
                  </div>
                  <input type="text" className="w-full bg-accent/20 border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none mt-2"
                    value={refTransferencia} placeholder="Referencia (opcional)" onChange={e => setRefTransferencia(e.target.value)} />
                </div>
              )}

              {/* Tarjeta */}
              {(payMode === 'tarjeta' || payMode === 'mixto') && (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-[12px] font-semibold text-foreground flex-1">Tarjeta</span>
                    {payMode === 'mixto' && (
                      <button onClick={() => setPayTarjeta(Math.max(0, total - (parseFloat(payEfectivo) || 0) - (parseFloat(payTransferencia) || 0)).toFixed(2))}
                        className="text-[10px] text-primary font-semibold hover:underline">Exacto</button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">$</span>
                    <input type="number" inputMode="decimal"
                      className="w-full bg-accent/30 border border-border rounded-lg pl-7 pr-2 py-2.5 text-[14px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={payTarjeta} placeholder="0.00" onChange={e => setPayTarjeta(e.target.value)}
                    />
                  </div>
                  <input type="text" className="w-full bg-accent/20 border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none mt-2"
                    value={refTarjeta} placeholder="Referencia (opcional)" onChange={e => setRefTarjeta(e.target.value)} />
                </div>
              )}

              {/* Summary */}
              <div className="rounded-lg bg-accent/40 px-4 py-2.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-3 text-[12px]">
                    <span className="text-muted-foreground">Total pagado:</span>
                    <span className="font-bold text-foreground tabular-nums">{fmt(totalPagado)}</span>
                  </div>
                  {faltante > 0 && (
                    <div className="flex items-center gap-3 text-[12px]">
                      <span className="text-destructive font-medium">Faltante:</span>
                      <span className="font-bold text-destructive tabular-nums">{fmt(faltante)}</span>
                    </div>
                  )}
                </div>
                {cambio > 0 && (
                  <div className="text-right">
                    <span className="text-[11px] text-primary font-medium">Cambio</span>
                    <p className="text-[20px] text-primary font-bold tabular-nums leading-tight">{fmt(cambio)}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Confirm button */}
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={handleConfirm}
            disabled={saving || (condicion === 'contado' && faltante > 0 && payMode !== 'efectivo')}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-4 text-[16px] font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Check className="h-5 w-5" />
            {saving ? 'Guardando...' : condicion === 'credito' ? 'Confirmar venta a crédito' : `Confirmar ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
