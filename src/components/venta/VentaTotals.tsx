import { cn } from '@/lib/utils';

interface VentaTotalsProps {
  subtotal: number;
  descuento_total: number;
  iva_total: number;
  ieps_total: number;
  total: number;
  isMobile: boolean;
}

export function VentaTotals({ subtotal, descuento_total, iva_total, ieps_total, total, isMobile }: VentaTotalsProps) {
  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex justify-end pt-2 sticky bottom-0 bg-card pb-2">
      <div className={cn("bg-accent rounded-md p-3 space-y-1.5 text-[13px]", isMobile ? "w-full" : "w-72")}>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${fmt(subtotal)}</span>
        </div>
        {descuento_total > 0 && (
          <div className="flex justify-between text-destructive">
            <span>Descuento</span>
            <span>-${fmt(descuento_total)}</span>
          </div>
        )}
        {ieps_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IEPS</span>
            <span>${fmt(ieps_total)}</span>
          </div>
        )}
        {iva_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span>${fmt(iva_total)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 font-semibold text-[15px]">
          <span>Total</span>
          <span>${fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
