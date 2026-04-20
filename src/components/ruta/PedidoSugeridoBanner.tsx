import { Sparkles, RotateCw, X, Info, ListChecks, History } from 'lucide-react';

interface Props {
  manualCount: number;       // products in cliente_pedido_sugerido
  historialCount: number;    // products from average of last 3 sales
  lastSaleCount: number;     // products in client's last sale
  onApplyManual: () => void;
  onApplyHistorial: () => void;
  onRepeatLastSale: () => void;
  onDismiss: () => void;
}

/**
 * Banner shown above products step. Lets the vendor explicitly choose:
 *  - Lista configurada (manual)
 *  - Promedio del historial (last 3 sales avg)
 *  - Repetir última venta
 * Always renders (with empty-state if nothing available).
 */
export default function PedidoSugeridoBanner({
  manualCount, historialCount, lastSaleCount,
  onApplyManual, onApplyHistorial, onRepeatLastSale, onDismiss,
}: Props) {
  const empty = manualCount === 0 && historialCount === 0 && lastSaleCount === 0;

  if (empty) {
    return (
      <div className="mx-3 mb-2 rounded-xl bg-accent/40 border border-border/60 px-3 py-2 flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-[10.5px] text-muted-foreground flex-1 leading-snug">
          Cliente sin historial. Tras la 1ª venta podrás <b>repetir</b> o usar <b>pedido sugerido</b>.
        </p>
        <button onClick={onDismiss} className="w-6 h-6 rounded-full bg-background flex items-center justify-center shrink-0 active:scale-95">
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 px-3 py-2.5">
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground">Cargar productos rápido</p>
          <p className="text-[10px] text-muted-foreground">Elige cómo precargar el pedido</p>
        </div>
        <button onClick={onDismiss} className="w-6 h-6 rounded-full bg-accent/60 flex items-center justify-center shrink-0 active:scale-95">
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {manualCount > 0 && (
          <button
            onClick={onApplyManual}
            className="flex items-center justify-between gap-2 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-[12px] font-semibold active:scale-[0.98] transition-transform shadow-sm shadow-primary/20"
          >
            <span className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />Lista configurada</span>
            <span className="text-[10.5px] opacity-90">{manualCount} productos</span>
          </button>
        )}
        {historialCount > 0 && (
          <button
            onClick={onApplyHistorial}
            className="flex items-center justify-between gap-2 bg-card border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-foreground active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-primary" />Promedio últimas 3 ventas</span>
            <span className="text-[10.5px] text-muted-foreground">{historialCount} productos</span>
          </button>
        )}
        {lastSaleCount > 0 && (
          <button
            onClick={onRepeatLastSale}
            className="flex items-center justify-between gap-2 bg-card border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-foreground active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center gap-1.5"><RotateCw className="h-3.5 w-3.5 text-primary" />Repetir última venta</span>
            <span className="text-[10.5px] text-muted-foreground">{lastSaleCount} productos</span>
          </button>
        )}
      </div>
    </div>
  );
}
