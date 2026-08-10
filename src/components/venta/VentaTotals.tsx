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
  /** Suma de los descuentos de promoción GUARDADOS en las líneas (con impuestos).
   *  Cuando viene, manda sobre el cálculo en vivo para que el resumen cuadre
   *  exactamente con la columna "Descuento" de cada línea. */
  promoTotalGuardado?: number | null;
  /** Suma de los subtotales SIN impuestos guardados en las líneas
   *  (precio de lista × cantidad). Cuando viene, manda sobre la
   *  reconstrucción para que el resumen cuadre al centavo con las líneas. */
  subtotalNetoGuardado?: number | null;
  /** Suma de los descuentos SIN impuestos guardados en las líneas. */
  descuentoNetoGuardado?: number | null;
}

export function VentaTotals({ subtotal, descuento_total, iva_total, ieps_total, total, isMobile, saldoPendiente, promoResults, descuento_promo, descuento_extra_amt, currencyCode, promoTotalGuardado, subtotalNetoGuardado, descuentoNetoGuardado }: VentaTotalsProps) {
  const { fmt } = useCurrency();
  const money = (value: number | null | undefined) => currencyCode ? formatCurrency(value, currencyCode) : fmt(value);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // Resumen VISUAL alineado con Ticket y VentaExpandedRow
  const promoLive = (promoResults ?? []).reduce((s, pr) => s + (Number(pr.descuento) || 0), 0);
  const promoTotalBruto = (promoTotalGuardado ?? 0) > 0 ? (promoTotalGuardado as number) : promoLive;
  const promoFactor = promoLive > 0 ? promoTotalBruto / promoLive : 1;

  const gravable = (total || 0) - (iva_total || 0) - (ieps_total || 0);
  const totalReal = (total || 0);

  // Descuento manual (extra + line descuento manual)
  const manualTotalBruto = (descuento_total || 0) - promoTotalBruto;
  const manualNeto = totalReal > 0 ? r2(Math.max(0, manualTotalBruto) * (gravable / totalReal)) : r2(Math.max(0, manualTotalBruto) / 1.16);
  const promoNeto = totalReal > 0 ? r2(promoTotalBruto * (gravable / totalReal)) : r2(promoTotalBruto / 1.16);

  const useGuardado = (subtotalNetoGuardado ?? 0) > 0;
  const grossSubtotal = useGuardado ? r2(subtotalNetoGuardado as number) : r2(gravable + manualNeto + promoNeto);

  // Con subtotal guardado, el descuento se deriva para que siempre cuadre
  const totalDescuentosNeto = useGuardado
    ? r2((descuentoNetoGuardado ?? 0) > 0 ? (descuentoNetoGuardado as number) : grossSubtotal - gravable)
    : r2(manualNeto + promoNeto);

  const gravableShown = useGuardado ? r2(grossSubtotal - totalDescuentosNeto) : gravable;

  const pagadoAmt = saldoPendiente != null ? Math.max(0, (total || 0) - saldoPendiente) : null;

  return (
    <div className="flex justify-end pt-2 max-lg:sticky max-lg:bottom-0 lg:sticky lg:top-4 bg-card pb-2">
      <div className={cn("bg-accent rounded-md p-3 space-y-1.5 text-[13px]", isMobile ? "w-full" : "w-80")}>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal sin impuestos</span>
          <span>{money(grossSubtotal)}</span>
        </div>
        {manualNeto > 0.005 && (
          <div className="flex justify-between text-primary">
            <span>Descuento manual</span>
            <span>-{money(manualNeto)}</span>
          </div>
        )}
        {promoNeto > 0.005 && (
          <div className="flex justify-between text-primary">
            <span>Desc. promociones</span>
            <span>-{money(promoNeto)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal gravable</span>
          <span>{money(gravableShown)}</span>
        </div>
        {ieps_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IEPS</span>
            <span>{money(ieps_total)}</span>
          </div>
        )}
        {iva_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span>{money(iva_total)}</span>
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
                  <span className="font-bold text-primary tabular-nums shrink-0">
                    -{money(Math.round(pr.descuento * promoFactor * 100) / 100)}
                    <span className="text-[9px] text-muted-foreground ml-1 font-normal">(c/imp)</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
