import { useMemo, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Generic per-column text filter helper for report tables.
 * - getValue(row, key) returns the value that should be tested against the filter string.
 *   Defaults to row[key]. Numbers/strings all coerced via String().toLowerCase().
 */
export function useColumnFilters<T = any>(
  items: T[],
  getValue?: (row: T, key: string) => any,
) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const setFilter = useCallback((key: string, val: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (!val) delete next[key];
      else next[key] = val;
      return next;
    });
  }, []);

  const clear = useCallback(() => setFilters({}), []);

  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v && v.trim().length > 0);
    if (active.length === 0) return items;
    const get = getValue ?? ((r: any, k: string) => r?.[k]);
    return items.filter(row =>
      active.every(([key, needle]) => {
        const v = get(row, key);
        if (v == null) return false;
        return String(v).toLowerCase().includes(needle.toLowerCase());
      })
    );
  }, [items, filters, getValue]);

  const hasActive = Object.values(filters).some(v => v && v.trim().length > 0);

  return { filtered, filters, setFilter, clear, hasActive };
}

interface FilterThProps {
  columnKey: string;
  filters: Record<string, string>;
  onFilter: (key: string, val: string) => void;
  placeholder?: string;
  align?: 'left' | 'right';
  className?: string;
}

export function FilterTh({ columnKey, filters, onFilter, placeholder, align = 'left', className }: FilterThProps) {
  const value = filters[columnKey] ?? '';
  return (
    <th className={cn('py-1 px-2', className)}>
      <div className={cn('relative flex items-center', align === 'right' && 'justify-end')}>
        <Search className="absolute left-1.5 h-3 w-3 text-muted-foreground/60 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={e => onFilter(columnKey, e.target.value)}
          placeholder={placeholder ?? 'Filtrar…'}
          className={cn(
            'w-full h-6 pl-5 pr-5 rounded border border-input bg-card text-[10px] font-normal normal-case tracking-normal',
            'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60',
            align === 'right' && 'text-right pr-6 pl-2',
          )}
        />
        {value && (
          <button
            type="button"
            onClick={() => onFilter(columnKey, '')}
            className="absolute right-1 text-muted-foreground/70 hover:text-destructive"
            aria-label="Limpiar filtro"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </th>
  );
}
