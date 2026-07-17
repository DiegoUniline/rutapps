import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface StickyListToolbarProps {
  /** Left cluster: search, filters, group-by. */
  left: ReactNode;
  /** Right cluster: pagination, export, primary actions. */
  right: ReactNode;
  className?: string;
  /**
   * Distance from the top of the scroll container. Defaults to 0.
   * Use a value like `top-12` if the page has its own sticky header above.
   */
  topClassName?: string;
}

/**
 * Odoo-style sticky toolbar. Keeps search + filters on the left and
 * pagination + actions on the right, wraps below on narrow viewports,
 * and stays pinned while the list scrolls.
 */
export function StickyListToolbar({ left, right, className, topClassName = 'top-0' }: StickyListToolbarProps) {
  return (
    <div
      className={cn(
        'sticky z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-transparent',
        '[&.is-stuck]:border-border [&.is-stuck]:shadow-[0_1px_0_hsl(var(--border))]',
        topClassName,
        className,
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
        <div className="flex-1 min-w-0">{left}</div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap md:flex-nowrap justify-end">
          {right}
        </div>
      </div>
    </div>
  );
}
