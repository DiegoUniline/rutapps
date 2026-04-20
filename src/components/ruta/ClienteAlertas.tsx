import { useState } from 'react';
import { AlertCircle, ChevronDown, Clock, Wallet, Tag, Package2, CalendarOff } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  saldoPendiente: number;
  creditoInfo: { limite: number; disponible: number; dias: number } | null;
  diasSinVisita: number | null;
  missedProducts: { producto_id: string; nombre: string; diasSinPedir: number; ultimaCantidad: number }[];
  promosAplicables: any[];
}

/**
 * Compact contextual alerts banner shown when the vendor opens a client.
 * Collapsable to keep the focus on the sale flow.
 */
export default function ClienteAlertas({ saldoPendiente, creditoInfo, diasSinVisita, missedProducts, promosAplicables }: Props) {
  const { fmt, symbol } = useCurrency();
  const [expanded, setExpanded] = useState(true);

  const alertCount =
    (saldoPendiente > 0 ? 1 : 0) +
    (creditoInfo ? 1 : 0) +
    (missedProducts.length > 0 ? 1 : 0) +
    (promosAplicables.length > 0 ? 1 : 0);

  if (alertCount === 0) return null;

  return (
    <div className="mx-3 mb-2 rounded-xl bg-card border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 active:bg-accent/30 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <AlertCircle className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[12px] font-semibold text-foreground">
            {alertCount} {alertCount === 1 ? 'alerta' : 'alertas'} de este cliente
          </p>
          {!expanded && (
            <p className="text-[10px] text-muted-foreground truncate">
              {saldoPendiente > 0 && `Debe ${symbol}${fmt(saldoPendiente)}`}
              {saldoPendiente > 0 && (missedProducts.length > 0 || promosAplicables.length > 0) && ' · '}
              {missedProducts.length > 0 && `${missedProducts.length} prod. dejados`}
              {missedProducts.length > 0 && promosAplicables.length > 0 && ' · '}
              {promosAplicables.length > 0 && `${promosAplicables.length} promo`}
            </p>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5 border-t border-border/40 pt-2">
          {/* Saldo pendiente */}
          {saldoPendiente > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/8 px-2.5 py-1.5">
              <Clock className="h-3.5 w-3.5 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-destructive">Saldo pendiente</p>
                <p className="text-[10px] text-destructive/80">{symbol}{fmt(saldoPendiente)} por cobrar</p>
              </div>
            </div>
          )}

          {/* Crédito disponible */}
          {creditoInfo && (
            <div className="flex items-center gap-2 rounded-lg bg-accent/50 px-2.5 py-1.5">
              <Wallet className="h-3.5 w-3.5 text-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-foreground">Crédito disponible</p>
                <p className="text-[10px] text-muted-foreground">
                  {symbol}{fmt(creditoInfo.disponible)} de {symbol}{fmt(creditoInfo.limite)} · {creditoInfo.dias}d
                </p>
              </div>
            </div>
          )}

          {/* Días sin visita */}
          {diasSinVisita !== null && diasSinVisita > 7 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5">
              <CalendarOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Sin compras hace {diasSinVisita} días</p>
              </div>
            </div>
          )}

          {/* Productos no pedidos */}
          {missedProducts.length > 0 && (
            <div className="rounded-lg bg-blue-500/8 px-2.5 py-1.5">
              <div className="flex items-center gap-2 mb-1">
                <Package2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Solía pedir y dejó de hacerlo</p>
              </div>
              <div className="flex flex-wrap gap-1 pl-5">
                {missedProducts.slice(0, 4).map(p => (
                  <span key={p.producto_id} className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                    {p.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Promociones */}
          {promosAplicables.length > 0 && (
            <div className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{promosAplicables.length} promoción{promosAplicables.length !== 1 ? 'es' : ''} activa{promosAplicables.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex flex-wrap gap-1 pl-5">
                {promosAplicables.slice(0, 3).map((p: any) => (
                  <span key={p.id} className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-medium truncate max-w-[180px]">
                    {p.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
