import { ChevronLeft, ChevronRight } from 'lucide-react';

interface OdooPaginationProps {
  from: number;
  to: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

export function OdooPagination({ from, to, total, onPrev, onNext }: OdooPaginationProps) {
  return (
    <div className="flex items-center justify-end gap-2 py-2 px-3 text-xs text-muted-foreground">
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
