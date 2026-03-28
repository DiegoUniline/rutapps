import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { Tag, Gift } from 'lucide-react';
import type { PromoResult } from '@/hooks/usePromociones';

interface VentaTotalsProps {
  subtotal: number;
  descuento_total: number;
  iva_total: number;
  ieps_total: number;
  total: number;
  isMobile: boolean;
  saldoPendiente?: number;
  promoResults?: PromoResult[];
  descuento_promo?: number;
  descuento_extra_amt?: number;
}

export function VentaTotals({ subtotal, descuento_total, iva_total, ieps_total, total, isMobile, saldoPendiente, promoResults, descuento_promo }: VentaTotalsProps) {
  const { fmt } = useCurrency();
  const lineDescuento = descuento_total - (descuento_promo ?? 0);

  return (
    <div className="flex justify-end pt-2 sticky bottom-0 bg-card pb-2">
      <div className={cn("bg-accent rounded-md p-3 space-y-1.5 text-[13px]", isMobile ? "w-full" : "w-80")}>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {lineDescuento > 0 && (
          <div className="flex justify-between text-destructive">
            <span>Descuento</span>
            <span>-{fmt(lineDescuento)}</span>
          </div>
        )}
        {/* Promo results */}
        {promoResults && promoResults.length > 0 && (
          <div className="space-y-1 border-t border-border pt-1.5">
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold text-primary">Promociones</span>
            </div>
            {promoResults.map((pr, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-foreground flex items-center gap-1 truncate max-w-[200px]">
                  {pr.tipo === 'producto_gratis' ? <Gift className="h-3 w-3 text-primary shrink-0" /> : <Tag className="h-3 w-3 text-primary shrink-0" />}
                  {pr.descripcion}
                </span>
                {pr.descuento > 0 && (
                  <span className="font-bold text-primary tabular-nums shrink-0">-{fmt(pr.descuento)}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {ieps_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IEPS</span>
            <span>{fmt(ieps_total)}</span>
          </div>
        )}
        {iva_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span>{fmt(iva_total)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 font-semibold text-[15px]">
          <span>Total</span>
          <span>{fmt(total)}</span>
        </div>
        {saldoPendiente != null && saldoPendiente > 0 && (
          <div className="flex justify-between pt-1">
            <span className="text-destructive font-medium text-[13px]">Saldo pendiente</span>
            <span className="text-destructive font-semibold text-[13px]">{fmt(saldoPendiente)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
