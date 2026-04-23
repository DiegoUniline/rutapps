import { AlertTriangle, CreditCard } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  saldoPendiente: number;
  creditoInfo: { limite: number; disponible: number; dias: number } | null;
  onCobrar?: () => void;
}

/**
 * Alerta visual cuando el cliente tiene saldo pendiente al iniciar una venta.
 * Indica el monto adeudado y el crédito disponible (si aplica).
 */
export default function SaldoPendienteBanner({ saldoPendiente, creditoInfo, onCobrar }: Props) {
  const { symbol: s } = useCurrency();
  if (saldoPendiente <= 0) return null;

  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sinCredito = creditoInfo && creditoInfo.disponible <= 0;

  return (
    <div className={`mx-3 mb-2 rounded-xl px-3 py-2.5 border ${sinCredito ? 'bg-destructive/10 border-destructive/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${sinCredito ? 'bg-destructive/20' : 'bg-amber-500/20'}`}>
          <AlertTriangle className={`h-3.5 w-3.5 ${sinCredito ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground">
            Adeuda <span className={sinCredito ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}>{fmt(saldoPendiente)}</span>
          </p>
          {creditoInfo ? (
            <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5">
              {sinCredito
                ? <>Sin crédito disponible · Límite {fmt(creditoInfo.limite)}</>
                : <>Crédito disponible: <b className="text-foreground">{fmt(creditoInfo.disponible)}</b> de {fmt(creditoInfo.limite)}</>}
            </p>
          ) : (
            <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5">Cliente sin línea de crédito</p>
          )}
        </div>
        {onCobrar && (
          <button onClick={onCobrar} className="shrink-0 inline-flex items-center gap-1 bg-primary text-primary-foreground rounded-lg px-2.5 py-1.5 text-[11px] font-semibold active:scale-95 transition-transform">
            <CreditCard className="h-3 w-3" />Cobrar
          </button>
        )}
      </div>
    </div>
  );
}
