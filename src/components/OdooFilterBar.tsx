import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Filter, ChevronDown, Layers, X, Check } from 'lucide-react';
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
}

function FilterPanel({
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
  const allValues = filter.options.map(o => o.value);
  const filtered = filter.options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const allSelected = selected.length === 0 || selected.length === allValues.length;

  return (
    <div className="flex flex-col h-full">
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
  );
}

export function OdooFilterBar({
  search, onSearchChange, placeholder = 'Buscar...', children,
  filterOptions, activeFilters, onToggleFilter, onSetFilter,
  groupByOptions, activeGroupBy, onGroupByChange, onClearFilters,
}: OdooFilterBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const filterRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen && !groupOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (groupOpen && groupRef.current && !groupRef.current.contains(e.target as Node)) setGroupOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen, groupOpen]);

  const activeCount = useMemo(() => {
    if (!activeFilters) return 0;
    return Object.values(activeFilters).filter(v => v && v.length > 0).length;
  }, [activeFilters]);

  const hasGroupBy = !!activeGroupBy;

  // Active filter chips
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
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="input-odoo pl-8"
          />
        </div>

        {/* Filters dropdown */}
        {filterOptions && filterOptions.length > 0 && onToggleFilter && (
          <div ref={filterRef} className="relative">
            <button
              onClick={() => { setFilterOpen(!filterOpen); setGroupOpen(false); }}
              className={cn(
                "btn-odoo-secondary flex items-center gap-1",
                activeCount > 0 && "border-primary text-primary"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {activeCount > 0 && (
                <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {activeCount}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
            {filterOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 w-[280px]">
                {/* Tabs */}
                <div className="flex border-b border-border overflow-x-auto">
                  {filterOptions.map((fo, i) => {
                    const sel = activeFilters?.[fo.key] ?? [];
                    return (
                      <button
                        key={fo.key}
                        onClick={() => setActiveTab(i)}
                        className={cn(
                          "px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 shrink-0",
                          activeTab === i
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {fo.label}
                        {sel.length > 0 && (
                          <span className="ml-1 bg-primary text-primary-foreground text-[9px] rounded-full px-1.5 py-0.5">
                            {sel.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Active tab content */}
                {filterOptions[activeTab] && (
                  <FilterPanel
                    filter={filterOptions[activeTab]}
                    selected={activeFilters?.[filterOptions[activeTab].key] ?? []}
                    onToggle={(val) => onToggleFilter(filterOptions[activeTab].key, val)}
                    onSetAll={(vals) => onSetFilter?.(filterOptions[activeTab].key, vals)}
                  />
                )}
                {/* Clear */}
                {activeCount > 0 && onClearFilters && (
                  <div className="border-t border-border px-3 py-2">
                    <button onClick={() => { onClearFilters(); }} className="text-[11px] text-destructive hover:underline flex items-center gap-1">
                      <X className="h-3 w-3" /> Limpiar todos los filtros
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Group by dropdown */}
        {groupByOptions && groupByOptions.length > 0 && onGroupByChange && (
          <div ref={groupRef} className="relative">
            <button
              onClick={() => { setGroupOpen(!groupOpen); setFilterOpen(false); }}
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
          {onClearFilters && (
            <button onClick={onClearFilters} className="text-[10px] text-destructive hover:underline ml-1">
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
