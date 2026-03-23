import { ArrowLeft, Check, Wallet, Banknote, CreditCard } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import type { CuentaPendiente } from './types';

interface Props {
  venta: any;
  clienteNombre: string;
  saldoActual: number;
  cuentasPendientes: CuentaPendiente[];
  totalAplicarOtras: number;
  totalACobrar: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta';
  setMetodoPago: (v: 'efectivo' | 'transferencia' | 'tarjeta') => void;
  montoRecibido: string;
  setMontoRecibido: (v: string) => void;
  referenciaPago: string;
  setReferenciaPago: (v: string) => void;
  cambio: number;
  saving: boolean;
  handleCobrar: () => void;
  updateCuentaMonto: (id: string, monto: number) => void;
  liquidarTodas: () => void;
  onBack: () => void;
  fmt: (n: number) => string;
}

export function CobrarView(p: Props) {
  const { symbol: s } = useCurrency();
  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={p.onBack} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
        <div className="flex-1 min-w-0"><h1 className="text-[16px] font-bold text-foreground">Cobrar</h1><p className="text-[11px] text-muted-foreground">{p.clienteNombre} · {p.venta.folio ?? 'Sin folio'}</p></div>
      </div>
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
        <section className="bg-card rounded-xl border border-border p-3.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Venta actual</p>
          <div className="flex justify-between items-baseline"><span className="text-[13px] text-foreground">{p.venta.folio ?? 'Sin folio'}</span><span className="text-[18px] font-bold text-foreground">{s}{p.fmt(p.saldoActual)}</span></div>
        </section>
        {p.cuentasPendientes.length > 0 && <CuentasPendientesSection {...p} s={s} />}
        <MetodoPagoSection {...p} s={s} />
        <ResumenSection {...p} s={s} />
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent">
        <button onClick={p.handleCobrar} disabled={p.saving || p.totalACobrar <= 0}
          className="w-full bg-green-600 text-white rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-green-600/20 flex items-center justify-center gap-1.5">
          <Check className="h-4 w-4" />{p.saving ? 'Procesando...' : `Cobrar ${s}${p.fmt(p.totalACobrar)}`}
        </button>
      </div>
    </div>
  );
}

function CuentasPendientesSection({ cuentasPendientes, updateCuentaMonto, liquidarTodas, totalAplicarOtras, fmt, s }: Props & { s: string }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Otras cuentas ({cuentasPendientes.length})</p>
        <button onClick={liquidarTodas} className="text-[10.5px] text-primary font-semibold">Liquidar todas</button>
      </div>
      <div className="space-y-1.5">
        {cuentasPendientes.map(cuenta => (
          <div key={cuenta.id} className="rounded-lg border border-border/60 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div><span className="text-[11px] font-semibold text-foreground">{cuenta.folio ?? '—'}</span><span className="text-[10px] text-muted-foreground ml-2">{fmtDate(cuenta.fecha)}</span></div>
              <span className="text-[11px] font-medium text-destructive">Debe: {s}{fmt(cuenta.saldo_pendiente)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateCuentaMonto(cuenta.id, cuenta.saldo_pendiente)} className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${cuenta.montoAplicar === cuenta.saldo_pendiente ? 'bg-primary text-primary-foreground' : 'bg-accent/60 text-foreground'}`}>Liquidar</button>
              <div className="flex-1 relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{s}</span><input type="number" inputMode="decimal" className="w-full bg-accent/40 rounded-md pl-5 pr-2 py-1.5 text-[12px] text-foreground font-medium focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={cuenta.montoAplicar || ''} placeholder="0.00" onChange={e => updateCuentaMonto(cuenta.id, parseFloat(e.target.value) || 0)} /></div>
              {cuenta.montoAplicar > 0 && <button onClick={() => updateCuentaMonto(cuenta.id, 0)} className="text-[10px] text-destructive font-medium">Quitar</button>}
            </div>
          </div>
        ))}
      </div>
      {totalAplicarOtras > 0 && <div className="mt-2 pt-2 border-t border-border/60 flex justify-between"><span className="text-[11px] text-muted-foreground">Total a cuentas anteriores</span><span className="text-[12px] font-bold text-foreground">{s}{fmt(totalAplicarOtras)}</span></div>}
    </section>
  );
}

function MetodoPagoSection({ metodoPago, setMetodoPago, montoRecibido, setMontoRecibido, referenciaPago, setReferenciaPago, totalACobrar, cambio, fmt, s }: Props & { s: string }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Método de pago</p>
      <div className="flex gap-1.5">
        {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Banknote], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
          <button key={val} onClick={() => setMetodoPago(val)} className={`flex-1 py-2.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 flex flex-col items-center gap-1 ${metodoPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      {metodoPago === 'efectivo' && (
        <div className="mt-2.5 space-y-1.5">
          <label className="text-[10px] text-muted-foreground font-medium">Monto recibido</label>
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">{s}</span><input type="number" inputMode="decimal" min="0" className="w-full bg-accent/40 rounded-lg pl-7 pr-3 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={montoRecibido} placeholder={fmt(totalACobrar)} onChange={e => { const val = parseFloat(e.target.value); if (e.target.value === '' || val >= 0) setMontoRecibido(e.target.value); }} /></div>
          {cambio > 0 && <div className="flex justify-between bg-green-50 dark:bg-green-950/30 rounded-md px-2.5 py-2"><span className="text-[12px] text-green-700 dark:text-green-400 font-medium">Cambio</span><span className="text-[14px] text-green-700 dark:text-green-400 font-bold">{s}{fmt(cambio)}</span></div>}
        </div>
      )}
      {metodoPago !== 'efectivo' && (
        <div className="mt-2.5"><label className="text-[10px] text-muted-foreground font-medium">Referencia (opcional)</label><input type="text" className="w-full mt-1 bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={referenciaPago} placeholder="No. de referencia" onChange={e => setReferenciaPago(e.target.value)} /></div>
      )}
    </section>
  );
}

function ResumenSection({ saldoActual, totalAplicarOtras, totalACobrar, fmt, s }: Props & { s: string }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5">
      <div className="space-y-1">
        <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Saldo de esta venta</span><span className="font-medium text-foreground tabular-nums">{s}{fmt(saldoActual)}</span></div>
        {totalAplicarOtras > 0 && <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Cuentas anteriores</span><span className="font-medium text-foreground tabular-nums">{s}{fmt(totalAplicarOtras)}</span></div>}
      </div>
      <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60"><span className="text-[13px] font-semibold text-foreground">Total a cobrar</span><span className="text-[20px] font-bold text-primary tabular-nums">{s}{fmt(totalACobrar)}</span></div>
    </section>
  );
}
