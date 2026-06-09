import { useMemo, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string | null;
  dir: SortDir;
}

/**
 * Generic client-side sortable table helper.
 * - getValue: extracts the comparable value for a row given the column key.
 *   If omitted, falls back to row[key].
 */
export function useSortableTable<T = any>(
  items: T[],
  getValue?: (row: T, key: string) => any,
  initial: SortState = { key: null, dir: 'asc' },
) {
  const [sort, setSort] = useState<SortState>(initial);

  const toggle = useCallback((key: string) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sort.key) return items;
    const key = sort.key;
    const mul = sort.dir === 'asc' ? 1 : -1;
    const get = getValue ?? ((r: any, k: string) => r?.[k]);
    const arr = [...items];
    arr.sort((a, b) => {
      const av = get(a, key);
      const bv = get(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * mul;
      return String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' }) * mul;
    });
    return arr;
  }, [items, sort, getValue]);

  return { sorted, sort, toggle, setSort };
}

interface SortableThProps {
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  children: React.ReactNode;
}

export function SortableTh({ sortKey, sort, onToggle, align = 'left', className, children }: SortableThProps) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={cn('cursor-pointer select-none hover:text-foreground transition-colors', className)}
      onClick={() => onToggle(sortKey)}
    >
      <span className={cn('inline-flex items-center gap-1', justify, align === 'right' && 'w-full')}>
        {children}
        <Icon className={cn('h-3 w-3', active ? 'text-primary' : 'text-muted-foreground/50')} />
      </span>
    </th>
  );
}
