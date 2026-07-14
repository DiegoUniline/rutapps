import { X, Loader2, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BulkAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'primary';
  loading?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface Props {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
  noun?: string; // "venta", "compra", etc. Used for label.
  position?: 'top' | 'bottom';
}

/**
 * Floating bar that appears when one or more rows are selected.
 * Provides a unified place for bulk actions (export, print, delete, status, etc.).
 * `position="top"` fija la barra en la parte superior; por defecto va abajo-centro.
 */
export function BulkActionsBar({ count, onClear, actions, noun = 'elemento', position = 'bottom' }: Props) {
  if (count === 0) return null;
  const label = count === 1 ? `1 ${noun} seleccionado` : `${count} ${noun}s seleccionados`;
  const visible = actions.filter(a => !a.hidden);

  return (
    <div className={cn(
      'fixed left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]',
      position === 'top' ? 'top-4' : 'bottom-4'
    )}>

      <div className="bg-foreground text-background rounded-full shadow-2xl flex items-center gap-1 pl-4 pr-1.5 py-1.5 border border-foreground/20">
        <button
          onClick={onClear}
          className="text-background/70 hover:text-background transition-colors mr-1"
          title="Limpiar selección"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold whitespace-nowrap mr-2">{label}</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {visible.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                onClick={a.onClick}
                disabled={a.disabled || a.loading}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  a.variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                  a.variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  (!a.variant || a.variant === 'default') && 'bg-background/10 hover:bg-background/20 text-background'
                )}
              >
                {a.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon && <Icon className="h-3.5 w-3.5" />}
                {a.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
