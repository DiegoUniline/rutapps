import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Estilo de renglón para cualquier acción dentro del menú «⋯». */
export const CLASE_ITEM_MENU =
  'w-full flex items-center gap-2 px-2.5 py-2 text-[12px] font-medium rounded-md text-foreground hover:bg-muted transition-colors text-left whitespace-nowrap';

/**
 * Menú «⋯» de acciones secundarias. El contenido queda montado (solo se oculta) para que
 * los diálogos que abren sus acciones no se cierren al ocultar el menú.
 */
export function MenuAcciones({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest?.('[data-radix-popper-content-wrapper],[role="dialog"]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Más acciones"
        aria-expanded={open}
        className={cn(
          'h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors',
          open && 'bg-muted',
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <div
        className={cn(
          'absolute right-0 top-full mt-1.5 z-50 min-w-[200px] bg-popover border border-border rounded-xl shadow-lg p-1 flex flex-col',
          !open && 'hidden',
        )}
        onClick={e => {
          // Cierra al elegir una acción simple (botón directo del menú).
          if ((e.target as HTMLElement).closest('[data-cierra-menu]')) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
