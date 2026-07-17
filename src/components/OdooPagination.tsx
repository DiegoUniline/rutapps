import { ChevronLeft, ChevronRight } from 'lucide-react';

interface OdooPaginationProps {
  from: number;
  to: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function OdooPagination({ from, to, total, onPrev, onNext, pageSize, onPageSizeChange, pageSizeOptions = [10, 50, 80, 200, 500, 0] }: OdooPaginationProps) {
  return (
    <div className="flex items-center justify-end gap-2 py-2 px-3 text-xs text-muted-foreground">
      {pageSize !== undefined && onPageSizeChange && (
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-transparent border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>{opt === 0 ? 'Todos' : opt}</option>
          ))}
        </select>
      )}
      <span>{from}-{to} / {total}</span>
      <button
        onClick={onPrev}
        disabled={from <= 1}
        className="p-0.5 hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={onNext}
        disabled={to >= total}
        className="p-0.5 hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
