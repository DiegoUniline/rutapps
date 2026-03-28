import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import type { PageSizeOption } from '@/hooks/useTablePagination';

interface TablePaginationProps {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: PageSizeOption;
  onPageSizeChange: (size: PageSizeOption) => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
}

const SIZE_OPTIONS: { value: PageSizeOption; label: string }[] = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 'all', label: 'Todo' },
];

export function TablePagination({
  from, to, total, page, totalPages, pageSize,
  onPageSizeChange, onFirst, onPrev, onNext, onLast,
}: TablePaginationProps) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 text-xs text-muted-foreground">
      {/* Left: page size selector + indicator */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Mostrar</span>
        <select
          className="h-7 rounded border border-border bg-card px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={String(pageSize)}
          onChange={e => {
            const v = e.target.value;
            onPageSizeChange(v === 'all' ? 'all' : (Number(v) as 50 | 100 | 200));
          }}
        >
          {SIZE_OPTIONS.map(o => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
        <span className="hidden sm:inline">registros</span>
        <span className="text-muted-foreground">—</span>
        <span>{from}-{to} de <strong className="text-foreground">{total}</strong></span>
      </div>

      {/* Right: navigation */}
      <div className="flex items-center gap-1">
        <span className="mr-1.5 hidden sm:inline">Pág. {page} / {totalPages}</span>
        <button onClick={onFirst} disabled={page <= 1} className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors" title="Primera">
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={onPrev} disabled={page <= 1} className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors" title="Anterior">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={onNext} disabled={page >= totalPages} className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors" title="Siguiente">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button onClick={onLast} disabled={page >= totalPages} className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors" title="Última">
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
