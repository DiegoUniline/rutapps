import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Layers, X, Check, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface GroupByOption {
  value: string;
  label: string;
}

interface OdooFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  filterOptions?: FilterOption[];
  activeFilters?: Record<string, string[]>;
  onToggleFilter?: (key: string, value: string) => void;
  onSetFilter?: (key: string, values: string[]) => void;
  groupByOptions?: GroupByOption[];
  activeGroupBy?: string;
  onGroupByChange?: (value: string) => void;
  onClearFilters?: () => void;
  /** Date range filter */
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (val: string) => void;
  onDateToChange?: (val: string) => void;
}

function IndependentFilterDropdown({
  filter,
  selected,
  onToggle,
  onSetAll,
}: {
  filter: FilterOption;
  selected: string[];
  onToggle: (value: string) => void;
  onSetAll: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allValues = filter.options.map(o => o.value);
  const filtered = filter.options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const allSelected = selected.length === 0 || selected.length === allValues.length;
  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "btn-odoo-secondary flex items-center gap-1",
          count > 0 && "border-primary text-primary"
        )}
      >
        {filter.label}
        {count > 0 && (
          <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
            {count}
          </span>
        )}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 w-[240px]">
          {filter.options.length > 5 && (
            <div className="px-3 pt-2 pb-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Buscar ${filter.label.toLowerCase()}…`}
                  className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-md border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>
          )}
          <div className="px-1 py-1 max-h-[240px] overflow-y-auto">
            <button
              onClick={() => onSetAll([])}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] transition-colors",
                allSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
              )}
            >
              <div className={cn(
                "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                allSelected ? "bg-primary border-primary" : "border-border"
              )}>
                {allSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </div>
              Todos
            </button>
            {filtered.map(opt => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] transition-colors",
                    isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
                  )}
                >
                  <div className={cn(
                    "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                    isSelected ? "bg-primary border-primary" : "border-border"
                  )}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


export function OdooFilterBar({
  search, onSearchChange, placeholder = 'Buscar...', children,
  filterOptions, activeFilters, onToggleFilter, onSetFilter,
  groupByOptions, activeGroupBy, onGroupByChange, onClearFilters,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
}: OdooFilterBarProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupOpen) return;
    const handler = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setGroupOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [groupOpen]);

  const hasDateFilter = !!(dateFrom || dateTo);

  const activeCount = useMemo(() => {
    let count = 0;
    if (activeFilters) count += Object.values(activeFilters).filter(v => v && v.length > 0).length;
    if (hasDateFilter) count++;
    return count;
  }, [activeFilters, hasDateFilter]);

  const hasGroupBy = !!activeGroupBy;

  const filterChips = useMemo(() => {
    if (!activeFilters || !filterOptions) return [];
    const chips: { filterKey: string; filterLabel: string; values: { value: string; label: string }[] }[] = [];
    for (const fo of filterOptions) {
      const selected = activeFilters[fo.key];
      if (selected && selected.length > 0) {
        const labels = selected.map(v => {
          const opt = fo.options.find(o => o.value === v);
          return { value: v, label: opt?.label ?? v };
        });
        chips.push({ filterKey: fo.key, filterLabel: fo.label, values: labels });
      }
    }
    return chips;
  }, [activeFilters, filterOptions]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* 1. Date range – always first */}
        {onDateFromChange && onDateToChange && (
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="date"
              value={dateFrom ?? ''}
              onChange={e => onDateFromChange(e.target.value)}
              className="px-2 py-1 text-[12px] rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 w-[130px]"
            />
            <span className="text-[11px] text-muted-foreground">al</span>
            <input
              type="date"
              value={dateTo ?? ''}
              onChange={e => onDateToChange(e.target.value)}
              className="px-2 py-1 text-[12px] rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 w-[130px]"
            />
          </div>
        )}

        {/* 2. Search – centered, takes remaining space */}
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="input-odoo pl-8"
          />
        </div>

        {/* 3. Filter dropdowns */}
        {filterOptions && filterOptions.length > 0 && onToggleFilter && filterOptions.map(fo => (
          <IndependentFilterDropdown
            key={fo.key}
            filter={fo}
            selected={activeFilters?.[fo.key] ?? []}
            onToggle={(val) => onToggleFilter(fo.key, val)}
            onSetAll={(vals) => onSetFilter?.(fo.key, vals)}
          />
        ))}

        {/* 4. Group by */}
        {groupByOptions && groupByOptions.length > 0 && onGroupByChange && (
          <div ref={groupRef} className="relative">
            <button
              onClick={() => setGroupOpen(!groupOpen)}
              className={cn(
                "btn-odoo-secondary flex items-center gap-1",
                hasGroupBy && "border-primary text-primary"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              {hasGroupBy
                ? `Agrupado: ${groupByOptions.find(g => g.value === activeGroupBy)?.label ?? activeGroupBy}`
                : 'Agrupar por'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {groupOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[180px] py-1 animate-in fade-in-0 zoom-in-95 duration-150">
                <button
                  onClick={() => { onGroupByChange(''); setGroupOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[12px] hover:bg-accent transition-colors",
                    !activeGroupBy && "font-semibold text-primary"
                  )}
                >
                  Sin agrupación
                </button>
                {groupByOptions.map(g => (
                  <button
                    key={g.value}
                    onClick={() => { onGroupByChange(g.value); setGroupOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[12px] hover:bg-accent transition-colors",
                      activeGroupBy === g.value && "font-semibold text-primary"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. Clear all */}
        {activeCount > 0 && onClearFilters && (
          <button onClick={() => { onClearFilters(); onDateFromChange?.(''); onDateToChange?.(''); }} className="text-[11px] text-destructive hover:underline flex items-center gap-1">
            <X className="h-3 w-3" /> Limpiar
          </button>
        )}

        {children}
      </div>

      {/* Active filter chips */}
      {filterChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterChips.map(chip => (
            chip.values.map(v => (
              <span
                key={`${chip.filterKey}-${v.value}`}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2 py-0.5"
              >
                {chip.filterLabel}: {v.label}
                <button
                  onClick={() => onToggleFilter?.(chip.filterKey, v.value)}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          ))}
        </div>
      )}
    </div>
  );
}
