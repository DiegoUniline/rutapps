import { Sparkles, RotateCw, X } from 'lucide-react';

interface Props {
  hasSuggestion: boolean;
  hasLastSale: boolean;
  suggestedSource: 'manual' | 'historial' | null;
  suggestedCount: number;
  lastSaleCount: number;
  onApplySuggestion: () => void;
  onRepeatLastSale: () => void;
  onDismiss: () => void;
}

/**
 * Sticky banner shown at the top of the products step offering one-tap
 * suggestion or repeat-last-sale actions.
 */
export default function PedidoSugeridoBanner({
  hasSuggestion, hasLastSale, suggestedSource, suggestedCount, lastSaleCount,
  onApplySuggestion, onRepeatLastSale, onDismiss,
}: Props) {
  if (!hasSuggestion && !hasLastSale) return null;

  return (
    <div className="mx-3 mb-2 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 px-3 py-2.5">
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground">Acelera la venta</p>
          <p className="text-[10px] text-muted-foreground">
            {suggestedSource === 'manual'
              ? 'Pedido típico configurado para este cliente'
              : 'Sugerencia basada en sus últimas compras'}
          </p>
        </div>
        <button onClick={onDismiss} className="w-6 h-6 rounded-full bg-accent/60 flex items-center justify-center shrink-0 active:scale-95">
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      <div className="flex gap-1.5">
        {hasSuggestion && (
          <button
            onClick={onApplySuggestion}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-lg py-2 text-[12px] font-semibold active:scale-[0.98] transition-transform shadow-sm shadow-primary/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pedido sugerido ({suggestedCount})
          </button>
        )}
        {hasLastSale && (
          <button
            onClick={onRepeatLastSale}
            className="flex-1 flex items-center justify-center gap-1.5 bg-card border border-border rounded-lg py-2 text-[12px] font-semibold text-foreground active:scale-[0.98] transition-transform"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Repetir última ({lastSaleCount})
          </button>
        )}
      </div>
    </div>
  );
}
