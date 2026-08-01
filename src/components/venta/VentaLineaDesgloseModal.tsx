import { X } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface VentaLineaDesgloseModalProps {
  open: boolean;
  onClose: () => void;
  linea: any;
  fmt?: (n: number) => string;
  currencyCode?: string | null;
}

export function VentaLineaDesgloseModal({
  open,
  onClose,
  linea,
  fmt: customFmt,
  currencyCode,
}: VentaLineaDesgloseModalProps) {
  const { fmt: defaultFmt } = useCurrency();
  const fmt = customFmt || ((n: number) =>
    currencyCode ? formatCurrency(n, currencyCode) : defaultFmt(n)
  );

  const r2 = (n: number | null | undefined) => {
    if (n == null) return null;
    return Math.round(Number(n) * 100) / 100;
  };

  if (!open) return null;

  // Check if this line has desglose data
  const hasDesglose = linea.precio_lista_unitario != null &&
    linea.importe_bruto != null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between sticky top-0 bg-card z-10">
          <h2 className="text-[16px] font-bold text-foreground">
            Desglose de línea: {linea.productos?.nombre || linea.descripcion || '—'}
          </h2>
          <button onClick={onClose} className="p-1">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {!hasDesglose ? (
          <div className="bg-accent/40 rounded-lg p-4 text-center">
            <p className="text-[13px] text-foreground">
              Esta línea no tiene desglose detallado disponible.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              (Datos de ventas anteriores a la implementación del sistema)
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Producto Info */}
            <div className="bg-accent/30 rounded-lg p-3">
              <p className="text-[12px] font-bold text-foreground mb-2">
                {linea.productos?.nombre || linea.descripcion}
              </p>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Cantidad:</span>
                <span className="font-medium">{linea.cantidad} {linea.unidades?.abreviatura || 'PZA'}</span>
              </div>
            </div>

            {/* Precios y Descuentos - 3 column layout */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sección 1: Precios */}
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-[11px] font-bold uppercase text-muted-foreground mb-3 pb-2 border-b border-border">
                  💰 Precios (Pre-Promo)
                </div>
                <div className="space-y-2">
                  <DesgloseRow
                    label="Precio lista (neto)"
                    value={r2(linea.precio_lista_unitario)}
                    fmt={fmt}
                  />
                  <DesgloseRow
                    label="Precio lista (bruto)"
                    value={r2(linea.precio_lista_unitario ?
                      linea.precio_lista_unitario *
                      (1 + (linea.iva_pct || 0) / 100) *
                      (1 + (linea.ieps_pct || 0) / 100)
                      : null)}
                    fmt={fmt}
                  />
                  <DesgloseRow
                    label="Precio pagado (post-promo)"
                    value={r2(linea.total ? linea.total / linea.cantidad : null)}
                    fmt={fmt}
                    highlight
                  />
                </div>
              </div>

              {/* Sección 2: Descuentos */}
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-[11px] font-bold uppercase text-muted-foreground mb-3 pb-2 border-b border-border">
                  🎁 Descuentos
                </div>
                <div className="space-y-2">
                  {linea.promocion_nombre && (
                    <DesgloseRow
                      label="Promo aplicada"
                      value={linea.promocion_nombre}
                      isText
                    />
                  )}
                  {linea.cantidad_bonificada > 0 && (
                    <DesgloseRow
                      label="Cant. bonif."
                      value={String(linea.cantidad_bonificada)}
                      isText
                    />
                  )}
                  <DesgloseRow
                    label="Desc. promo"
                    value={r2(linea.descuento_promocion_monto)}
                    fmt={fmt}
                    isNegative
                  />
                  <DesgloseRow
                    label="Desc. manual %"
                    value={linea.descuento_manual ? `${linea.descuento_pct || 0}%` : '0%'}
                    isText
                  />
                  <DesgloseRow
                    label="Desc. manual $"
                    value={r2(linea.descuento_manual_monto)}
                    fmt={fmt}
                  />
                </div>
              </div>

              {/* Sección 3: Bases de Impuestos */}
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-[11px] font-bold uppercase text-muted-foreground mb-3 pb-2 border-b border-border">
                  📊 Montos y Bases
                </div>
                <div className="space-y-2">
                  <DesgloseRow
                    label="Importe bruto"
                    value={r2(linea.importe_bruto)}
                    fmt={fmt}
                  />
                  <DesgloseRow
                    label="Subtotal neto"
                    value={r2(linea.base_descuento_manual || linea.subtotal)}
                    fmt={fmt}
                    highlight
                  />
                  <DesgloseRow
                    label="Base IEPS"
                    value={r2(linea.base_ieps)}
                    fmt={fmt}
                  />
                  <DesgloseRow
                    label="Base IVA"
                    value={r2(linea.base_iva)}
                    fmt={fmt}
                  />
                </div>
              </div>
            </div>

            {/* Resumen Final */}
            <div className="bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-lg p-4 space-y-2">
              <SummaryRow
                label={`Bruto (${linea.cantidad} × ${fmt(r2(linea.precio_lista_unitario) || 0)})`}
                value={r2(linea.importe_bruto)}
                fmt={fmt}
              />
              {linea.descuento_promocion_monto > 0 && (
                <SummaryRow
                  label={linea.promocion_nombre ? `Descuento ${linea.promocion_nombre}` : 'Descuento promo'}
                  value={r2(linea.descuento_promocion_monto)}
                  fmt={fmt}
                  isNegative
                />
              )}
              {linea.descuento_manual_monto > 0 && (
                <SummaryRow
                  label="Descuento manual"
                  value={r2(linea.descuento_manual_monto)}
                  fmt={fmt}
                  isNegative
                />
              )}
              <SummaryRow
                label="Subtotal neto"
                value={r2(linea.base_descuento_manual || linea.subtotal)}
                fmt={fmt}
              />
              {linea.ieps_monto > 0 && (
                <SummaryRow
                  label={`IEPS ${linea.ieps_pct}% (sobre ${fmt(r2(linea.base_ieps) || 0)})`}
                  value={r2(linea.ieps_monto)}
                  fmt={fmt}
                />
              )}
              {linea.iva_monto > 0 && (
                <SummaryRow
                  label={`IVA ${linea.iva_pct}% (sobre ${fmt(r2(linea.base_iva) || 0)})`}
                  value={r2(linea.iva_monto)}
                  fmt={fmt}
                />
              )}
              <div className="border-t border-white/30 pt-2 mt-2 flex justify-between">
                <span className="font-bold">TOTAL LÍNEA</span>
                <span className="text-xl font-bold text-green-400">{fmt(r2(linea.total) || 0)}</span>
              </div>
            </div>

            {/* Additional Info */}
            {(linea.motivo_descuento_manual || linea.es_bonificacion || linea.objeto_impuesto) && (
              <div className="bg-accent/20 rounded-lg p-3 space-y-2">
                {linea.motivo_descuento_manual && (
                  <div className="text-[12px]">
                    <span className="text-muted-foreground">Motivo descuento:</span>
                    <span className="ml-2 text-foreground font-medium">{linea.motivo_descuento_manual}</span>
                  </div>
                )}
                {linea.es_bonificacion && (
                  <div className="text-[12px]">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="ml-2 text-foreground font-medium">Es bonificación/regalo</span>
                  </div>
                )}
                {linea.objeto_impuesto && (
                  <div className="text-[12px]">
                    <span className="text-muted-foreground">Objeto impuesto (SAT):</span>
                    <span className="ml-2 text-foreground font-medium">{linea.objeto_impuesto}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DesgloseRowProps {
  label: string;
  value: number | string | null;
  fmt?: (n: number) => string;
  isText?: boolean;
  isNegative?: boolean;
  highlight?: boolean;
}

function DesgloseRow({
  label,
  value,
  fmt,
  isText,
  isNegative,
  highlight,
}: DesgloseRowProps) {
  if (value == null) return null;

  const displayValue = isText
    ? value
    : fmt
      ? fmt(Number(value))
      : String(value);

  return (
    <div className={cn(
      "flex justify-between text-[12px] px-2 py-1 rounded",
      highlight && "bg-blue-50 dark:bg-blue-950/30"
    )}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        "font-medium",
        isNegative && "text-red-600 dark:text-red-400",
        highlight && "text-blue-700 dark:text-blue-300 font-bold"
      )}>
        {isNegative && value != null && "−"}
        {displayValue}
      </span>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: number | null;
  fmt: (n: number) => string;
  isNegative?: boolean;
}

function SummaryRow({ label, value, fmt, isNegative }: SummaryRowProps) {
  if (value == null) return null;

  return (
    <div className="flex justify-between items-center text-[14px]">
      <span className="opacity-90">{label}</span>
      <span className={cn(
        "font-semibold",
        isNegative && "text-red-400"
      )}>
        {isNegative && "−"}
        {fmt(isNegative ? Math.abs(value) : value)}
      </span>
    </div>
  );
}
