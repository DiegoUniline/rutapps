import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { PageSizeOption } from '@/hooks/useTablePagination';
import { cn } from '@/lib/utils';

interface TablePaginationProps {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: PageSizeOption;
  onPageSizeChange: (size: PageSizeOption) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Optional — jump to first/last page. If omitted, only prev/next are shown. */
  onFirst?: () => void;
  onLast?: () => void;
  /** Discreet loading indicator (dot next to the range). */
  isLoading?: boolean;
  /** Compact = single line, no labels. Default true. Use false for legacy inline use. */
  compact?: boolean;
  className?: string;
}

const SIZE_OPTIONS: { value: PageSizeOption; label: string }[] = [
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 'all', label: 'Todos' },
];

/**
 * Odoo-style compact pagination. Renders as a single row of controls
 * intended to sit in the top-right of a list toolbar:
 *
 *     1–50 de 248   [50 ▾]   ‹  ›
 */
export function TablePagination({
  from, to, total, page, totalPages, pageSize,
  onPageSizeChange, onPrev, onNext,
  isLoading, compact = true, className,
}: TablePaginationProps) {
  if (total === 0 && !isLoading) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground select-none',
        !compact && 'py-2 px-3 justify-between flex-wrap',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" aria-label="Cargando" />
        )}
        <span className="tabular-nums whitespace-nowrap">
          <span className="text-foreground font-medium">{from}</span>
          <span className="mx-0.5">–</span>
          <span className="text-foreground font-medium">{to}</span>
          <span className="mx-1">de</span>
          <span className="text-foreground font-medium">{total}</span>
        </span>
      </div>

      <select
        aria-label="Registros por página"
        title="Registros por página"
        className="h-6 rounded border border-border bg-card px-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        value={String(pageSize)}
        onChange={e => {
          const v = e.target.value;
          onPageSizeChange(v === 'all' ? 'all' : (Number(v) as PageSizeOption));
        }}
      >
        {SIZE_OPTIONS.map(o => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>

      <div className="flex items-center">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          aria-label="Página anterior"
          title="Página anterior"
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-transparent hover:border-border hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-transparent transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
          title="Página siguiente"
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-transparent hover:border-border hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-transparent transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
