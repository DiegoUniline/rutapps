import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/currency';
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
  currencyCode?: string | null;
}

export function VentaTotals({ subtotal, descuento_total, iva_total, ieps_total, total, isMobile, saldoPendiente, promoResults, descuento_promo, descuento_extra_amt, currencyCode }: VentaTotalsProps) {
  const { fmt } = useCurrency();
  const money = (value: number | null | undefined) => currencyCode ? formatCurrency(value, currencyCode) : fmt(value);
  const lineDescuento = descuento_total - (descuento_promo ?? 0) - (descuento_extra_amt ?? 0);

  // Subtotal en BRUTO (antes de descuentos/promos), reconstruido desde el Total +
  // las rebajas que se muestran abajo. Así SIEMPRE cuadra (Subtotal − descuentos +
  // impuestos = Total), sin importar si la venta guardó el descuento en el
  // encabezado o solo lo tiene la promo recalculada en vivo (p. ej. líneas gratis
  // neteadas a $0). Es solo presentación: no cambia ningún dato guardado.
  const promoTotal = (promoResults ?? []).reduce((s, pr) => s + (Number(pr.descuento) || 0), 0);
  const shownLineDesc = lineDescuento > 0 ? lineDescuento : 0;
  const shownExtra = (descuento_extra_amt ?? 0) > 0 ? (descuento_extra_amt ?? 0) : 0;
  const grossSubtotal = (total || 0) - (iva_total || 0) - (ieps_total || 0) + shownLineDesc + promoTotal + shownExtra;

  // Desglose fiscal (mismo que la fila expandible de la lista):
  // Subtotal sin impuestos − Descuentos/promociones = Subtotal gravable;
  // + IVA + IEPS (por separado) = Total.
  const totalDescuentos = shownLineDesc + promoTotal + shownExtra;
  const gravable = (total || 0) - (iva_total || 0) - (ieps_total || 0);
  const pagadoAmt = saldoPendiente != null ? Math.max(0, (total || 0) - saldoPendiente) : null;

  return (
    <div className="flex justify-end pt-2 max-lg:sticky max-lg:bottom-0 lg:sticky lg:top-4 bg-card pb-2">
      <div className={cn("bg-accent rounded-md p-3 space-y-1.5 text-[13px]", isMobile ? "w-full" : "w-80")}>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal sin impuestos</span>
          <span>{money(grossSubtotal)}</span>
        </div>
        {totalDescuentos > 0 && (
          <div className="flex justify-between text-primary">
            <span>Descuentos / promociones</span>
            <span>-{money(totalDescuentos)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal gravable</span>
          <span>{money(gravable)}</span>
        </div>
        {iva_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span>{money(iva_total)}</span>
          </div>
        )}
        {ieps_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IEPS</span>
            <span>{money(ieps_total)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 font-semibold text-[15px]">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
        {pagadoAmt != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pagado</span>
            <span>{money(pagadoAmt)}</span>
          </div>
        )}
        {saldoPendiente != null && saldoPendiente > 0 && (
          <div className="flex justify-between pt-1">
            <span className="text-destructive font-medium text-[13px]">Saldo pendiente</span>
            <span className="text-destructive font-semibold text-[13px]">{money(saldoPendiente)}</span>
          </div>
        )}
        {saldoPendiente != null && saldoPendiente < 0 && (
          <div className="flex justify-between pt-1">
            <span className="text-success font-medium text-[13px]">Saldo a favor</span>
            <span className="text-success font-semibold text-[13px]">{money(Math.abs(saldoPendiente))}</span>
          </div>
        )}
        {/* Promociones aplicadas (detalle de cada promo) */}
        {promoResults && promoResults.length > 0 && (
          <div className="space-y-1 border-t border-border pt-1.5">
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold text-primary">Promociones aplicadas</span>
            </div>
            {promoResults.map((pr, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-foreground flex items-center gap-1 truncate max-w-[200px]">
                  {pr.tipo === 'producto_gratis' ? <Gift className="h-3 w-3 text-primary shrink-0" /> : <Tag className="h-3 w-3 text-primary shrink-0" />}
                  {pr.descripcion}
                </span>
                {pr.descuento > 0 && (
                  <span className="font-bold text-primary tabular-nums shrink-0">-{money(pr.descuento)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
