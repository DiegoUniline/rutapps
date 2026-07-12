import { useMemo, useState, useCallback } from 'react';
import { Filter as FilterIcon, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type NumericOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'between';

export interface TextFilter { kind: 'text'; values: string[] } // OR of selected values (equals) — empty = no filter
export interface NumberFilter { kind: 'number'; op: NumericOp; a?: number; b?: number }
export type ColumnFilter = TextFilter | NumberFilter;

export type ColumnFilterType = 'text' | 'number';

export interface ColumnFilterDef {
  key: string;
  type: ColumnFilterType;
  label: string;
}

export function useSmartColumnFilters<T = any>(
  items: T[],
  defs: ColumnFilterDef[],
  getValue?: (row: T, key: string) => any,
) {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const get = getValue ?? ((r: any, k: string) => r?.[k]);

  const setFilter = useCallback((key: string, f: ColumnFilter | null) => {
    setFilters(prev => {
      const next = { ...prev };
      if (!f) delete next[key];
      else next[key] = f;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setFilters({}), []);

  // Unique text values per text column (for selectable list)
  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const d of defs) {
      if (d.type !== 'text') continue;
      const set = new Set<string>();
      for (const row of items) {
        const v = get(row, d.key);
        if (v == null || v === '') continue;
        set.add(String(v));
      }
      map[d.key] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
      );
    }
    return map;
  }, [items, defs, get]);

  const filtered = useMemo(() => {
    const entries = Object.entries(filters);
    if (entries.length === 0) return items;
    return items.filter(row =>
      entries.every(([key, f]) => {
        const raw = get(row, key);
        if (f.kind === 'text') {
          if (!f.values || f.values.length === 0) return true;
          const s = raw == null ? '' : String(raw);
          return f.values.includes(s);
        }
        // number
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!isFinite(n)) return false;
        const a = f.a;
        const b = f.b;
        switch (f.op) {
          case '=': return a != null && n === a;
          case '!=': return a != null && n !== a;
          case '>': return a != null && n > a;
          case '>=': return a != null && n >= a;
          case '<': return a != null && n < a;
          case '<=': return a != null && n <= a;
          case 'between': return a != null && b != null && n >= Math.min(a, b) && n <= Math.max(a, b);
          default: return true;
        }
      })
    );
  }, [items, filters, get]);

  const hasActive = Object.keys(filters).length > 0;
  const activeCount = Object.keys(filters).length;

  return { filtered, filters, setFilter, clearAll, hasActive, activeCount, uniqueValues };
}

/* ─────────────── UI: Column filter trigger in <th> ─────────────── */

function isFilterActive(f?: ColumnFilter): boolean {
  if (!f) return false;
  if (f.kind === 'text') return f.values.length > 0;
  if (f.op === 'between') return f.a != null && f.b != null;
  return f.a != null;
}

interface ColumnFilterButtonProps {
  columnKey: string;
  label: string;
  type: ColumnFilterType;
  filter?: ColumnFilter;
  onChange: (f: ColumnFilter | null) => void;
  uniqueValues?: string[];
}

export function ColumnFilterButton({ columnKey, label, type, filter, onChange, uniqueValues = [] }: ColumnFilterButtonProps) {
  const active = isFilterActive(filter);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded transition-colors',
            active
              ? 'text-primary bg-primary/10 hover:bg-primary/20'
              : 'text-muted-foreground/40 hover:text-foreground hover:bg-accent'
          )}
          aria-label={`Filtrar ${label}`}
          onClick={e => e.stopPropagation()}
        >
          <FilterIcon className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2"
        align="start"
        onClick={e => e.stopPropagation()}
      >
        {type === 'text' ? (
          <TextFilterEditor
            label={label}
            uniqueValues={uniqueValues}
            filter={filter?.kind === 'text' ? filter : undefined}
            onChange={onChange}
          />
        ) : (
          <NumberFilterEditor
            label={label}
            filter={filter?.kind === 'number' ? filter : undefined}
            onChange={onChange}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function TextFilterEditor({
  label,
  uniqueValues,
  filter,
  onChange,
}: {
  label: string;
  uniqueValues: string[];
  filter?: TextFilter;
  onChange: (f: ColumnFilter | null) => void;
}) {
  const [q, setQ] = useState('');
  const selected = new Set(filter?.values ?? []);
  const list = q ? uniqueValues.filter(v => v.toLowerCase().includes(q.toLowerCase())) : uniqueValues;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    if (next.size === 0) onChange(null);
    else onChange({ kind: 'text', values: Array.from(next) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">Filtrar {label}</span>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"
          >
            <X className="h-3 w-3" /> Limpiar
          </button>
        )}
      </div>
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar…"
        className="w-full h-7 px-2 rounded border border-input bg-card text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
        autoFocus
      />
      <div className="max-h-52 overflow-y-auto space-y-0.5 border border-border rounded">
        {list.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-4">Sin valores</div>
        )}
        {list.map(v => {
          const isOn = selected.has(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={cn(
                'w-full text-left flex items-center gap-2 px-2 py-1 text-[12px] hover:bg-accent',
                isOn && 'bg-primary/5 text-primary font-medium'
              )}
            >
              <span className={cn(
                'inline-flex h-3.5 w-3.5 items-center justify-center rounded border',
                isOn ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
              )}>
                {isOn && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate">{v}</span>
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {selected.size > 0 ? `${selected.size} seleccionado${selected.size > 1 ? 's' : ''}` : `${uniqueValues.length} valores`}
      </div>
    </div>
  );
}

const NUM_OPS: { value: NumericOp; label: string }[] = [
  { value: '=', label: 'Igual a' },
  { value: '!=', label: 'Distinto de' },
  { value: '>', label: 'Mayor que' },
  { value: '>=', label: 'Mayor o igual' },
  { value: '<', label: 'Menor que' },
  { value: '<=', label: 'Menor o igual' },
  { value: 'between', label: 'Entre' },
];

function NumberFilterEditor({
  label,
  filter,
  onChange,
}: {
  label: string;
  filter?: NumberFilter;
  onChange: (f: ColumnFilter | null) => void;
}) {
  const op = filter?.op ?? '>=';
  const a = filter?.a;
  const b = filter?.b;

  const commit = (nextOp: NumericOp, nextA: number | undefined, nextB: number | undefined) => {
    if (nextA == null && nextB == null) {
      onChange(null);
      return;
    }
    onChange({ kind: 'number', op: nextOp, a: nextA, b: nextB });
  };

  const parse = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = Number(s);
    return isFinite(n) ? n : undefined;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">Filtrar {label}</span>
        {(a != null || b != null) && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"
          >
            <X className="h-3 w-3" /> Limpiar
          </button>
        )}
      </div>
      <select
        value={op}
        onChange={e => commit(e.target.value as NumericOp, a, e.target.value === 'between' ? b : undefined)}
        className="w-full h-7 px-2 rounded border border-input bg-card text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
      >
        {NUM_OPS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={a ?? ''}
          onChange={e => commit(op, parse(e.target.value), b)}
          placeholder={op === 'between' ? 'Mínimo' : 'Valor'}
          className="w-full h-7 px-2 rounded border border-input bg-card text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
        />
        {op === 'between' && (
          <>
            <span className="text-[11px] text-muted-foreground">y</span>
            <input
              type="number"
              value={b ?? ''}
              onChange={e => commit(op, a, parse(e.target.value))}
              placeholder="Máximo"
              className="w-full h-7 px-2 rounded border border-input bg-card text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
            />
          </>
        )}
      </div>
    </div>
  );
}
