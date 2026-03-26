import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, Layers, X, Check, CalendarDays, ChevronDown, Filter } from 'lucide-react';
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
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (val: string) => void;
  onDateToChange?: (val: string) => void;
}

/* ── Filter column inside the mega-dropdown ── */
function FilterColumn({
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
  const [search, setSearch] = useState('');
  const filtered = filter.options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const allSelected = selected.length === 0;

  return (
    <div className="min-w-[180px]">
      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <Filter className="h-3 w-3" />
        {filter.label}
      </p>
      {filter.options.length > 5 && (
        <div className="relative mb-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar…`}
            className="w-full pl-7 pr-2 py-1 text-[11px] rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      )}
      <div className="max-h-[200px] overflow-y-auto space-y-0.5">
        <button
          onClick={() => onSetAll([])}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors",
            allSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
          )}
        >
          <div className={cn(
            "h-3 w-3 rounded border flex items-center justify-center shrink-0",
            allSelected ? "bg-primary border-primary" : "border-border"
          )}>
            {allSelected && <Check className="h-2 w-2 text-primary-foreground" />}
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
                "w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors",
                isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
              )}
            >
              <div className={cn(
                "h-3 w-3 rounded border flex items-center justify-center shrink-0",
                isSelected ? "bg-primary border-primary" : "border-border"
              )}>
                {isSelected && <Check className="h-2 w-2 text-primary-foreground" />}
              </div>
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OdooFilterBar({
  search, onSearchChange, placeholder = 'Buscar...', children,
  filterOptions, activeFilters, onToggleFilter, onSetFilter,
  groupByOptions, activeGroupBy, onGroupByChange, onClearFilters,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
}: OdooFilterBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const hasDateFilter = !!(dateFrom || dateTo);
  const hasGroupBy = !!activeGroupBy;

  const activeCount = useMemo(() => {
    let count = 0;
    if (activeFilters) count += Object.values(activeFilters).filter(v => v && v.length > 0).length;
    if (hasDateFilter) count++;
    if (hasGroupBy) count++;
    return count;
  }, [activeFilters, hasDateFilter, hasGroupBy]);

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

  const hasAnyFilter = filterChips.length > 0 || hasDateFilter || hasGroupBy;

  return (
    <div className="space-y-2">
      {/* Odoo-style centered search bar */}
      <div ref={barRef} className="relative flex justify-center">
        <div className="relative w-full max-w-2xl">
          {/* Search input + filter toggle button */}
          <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-10 pr-3 py-2 text-[13px] bg-transparent focus:outline-none"
              />
            </div>
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 border-l border-border text-[12px] font-medium transition-colors hover:bg-accent shrink-0",
                panelOpen ? "bg-accent text-primary" : "text-muted-foreground"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {activeCount > 0 && (
                <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* Mega dropdown panel */}
          {panelOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl animate-in fade-in-0 slide-in-from-top-2 duration-150 p-4">
              <div className="flex gap-6 flex-wrap">
                {/* Date range column */}
                {onDateFromChange && onDateToChange && (
                  <div className="min-w-[180px]">
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Fecha
                    </p>
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Desde</label>
                        <input
                          type="date"
                          value={dateFrom ?? ''}
                          onChange={e => onDateFromChange(e.target.value)}
                          className="w-full px-2 py-1.5 text-[12px] rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Hasta</label>
                        <input
                          type="date"
                          value={dateTo ?? ''}
                          onChange={e => onDateToChange(e.target.value)}
                          className="w-full px-2 py-1.5 text-[12px] rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Filter columns */}
                {filterOptions && filterOptions.length > 0 && onToggleFilter && filterOptions.map(fo => (
                  <FilterColumn
                    key={fo.key}
                    filter={fo}
                    selected={activeFilters?.[fo.key] ?? []}
                    onToggle={(val) => onToggleFilter(fo.key, val)}
                    onSetAll={(vals) => onSetFilter?.(fo.key, vals)}
                  />
                ))}

                {/* Group by column */}
                {groupByOptions && groupByOptions.length > 0 && onGroupByChange && (
                  <div className="min-w-[160px]">
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      Agrupar por
                    </p>
                    <div className="space-y-0.5">
                      <button
                        onClick={() => onGroupByChange('')}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded text-[11px] transition-colors",
                          !activeGroupBy ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
                        )}
                      >
                        Sin agrupación
                      </button>
                      {groupByOptions.map(g => (
                        <button
                          key={g.value}
                          onClick={() => onGroupByChange(g.value)}
                          className={cn(
                            "w-full text-left px-2 py-1 rounded text-[11px] transition-colors",
                            activeGroupBy === g.value ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
                          )}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Clear inside panel */}
              {(activeCount > 0) && onClearFilters && (
                <div className="mt-3 pt-3 border-t border-border">
                  <button
                    onClick={() => { onClearFilters(); onDateFromChange?.(''); onDateToChange?.(''); onGroupByChange?.(''); }}
                    className="text-[11px] text-destructive hover:underline flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpiar todos los filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active filter chips + children row */}
      {(hasAnyFilter || children) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasDateFilter && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2 py-0.5">
              <CalendarDays className="h-2.5 w-2.5" />
              {dateFrom || '…'} → {dateTo || '…'}
              <button onClick={() => { onDateFromChange?.(''); onDateToChange?.(''); }} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {filterChips.map(chip =>
            chip.values.map(v => (
              <span
                key={`${chip.filterKey}-${v.value}`}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2 py-0.5"
              >
                {chip.filterLabel}: {v.label}
                <button onClick={() => onToggleFilter?.(chip.filterKey, v.value)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          )}
          {hasGroupBy && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2 py-0.5">
              <Layers className="h-2.5 w-2.5" />
              {groupByOptions?.find(g => g.value === activeGroupBy)?.label ?? activeGroupBy}
              <button onClick={() => onGroupByChange?.('')} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
