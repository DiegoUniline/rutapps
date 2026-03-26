import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, SlidersHorizontal, Layers, X, Check, CalendarDays, ChevronRight, Filter, Star, Bookmark } from 'lucide-react';
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
  /** Storage key for favorites */
  favoritesKey?: string;
}

/* ── Saved search favorites ── */
interface SavedFilter {
  name: string;
  filters: Record<string, string[]>;
  groupBy: string;
  dateFrom: string;
  dateTo: string;
}

function loadFavorites(key: string): SavedFilter[] {
  try {
    return JSON.parse(localStorage.getItem(`fav-${key}`) || '[]');
  } catch { return []; }
}
function saveFavorites(key: string, favs: SavedFilter[]) {
  localStorage.setItem(`fav-${key}`, JSON.stringify(favs));
}

/* ── Expandable filter category inside Filtros column ── */
function FilterCategory({
  filter, selected, onToggle, onSetAll,
}: {
  filter: FilterOption; selected: string[];
  onToggle: (v: string) => void; onSetAll: (v: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const count = selected.length;
  const filtered = filter.options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] font-medium transition-colors hover:bg-accent",
          count > 0 ? "text-primary" : "text-foreground"
        )}
      >
        <span className="flex items-center gap-1.5">
          {filter.label}
          {count > 0 && (
            <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
              {count}
            </span>
          )}
        </span>
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="ml-2 pl-2 border-l border-border mt-0.5 space-y-0.5">
          {filter.options.length > 5 && (
            <div className="relative mb-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="w-full pl-7 pr-2 py-1 text-[11px] rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          )}
          <button
            onClick={() => onSetAll([])}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors",
              count === 0 ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
            )}
          >
            <div className={cn("h-3 w-3 rounded border flex items-center justify-center shrink-0",
              count === 0 ? "bg-primary border-primary" : "border-border"
            )}>
              {count === 0 && <Check className="h-2 w-2 text-primary-foreground" />}
            </div>
            Todos
          </button>
          <div className="max-h-[180px] overflow-y-auto space-y-0.5">
            {filtered.map(opt => {
              const sel = selected.includes(opt.value);
              return (
                <button key={opt.value} onClick={() => onToggle(opt.value)}
                  className={cn("w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors",
                    sel ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
                  )}
                >
                  <div className={cn("h-3 w-3 rounded border flex items-center justify-center shrink-0",
                    sel ? "bg-primary border-primary" : "border-border"
                  )}>
                    {sel && <Check className="h-2 w-2 text-primary-foreground" />}
                  </div>
                  <span className="truncate">{opt.label}</span>
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
  favoritesKey,
}: OdooFilterBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const storageKey = favoritesKey || 'default';
  const [favorites, setFavorites] = useState<SavedFilter[]>(() => loadFavorites(storageKey));
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

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
    let c = 0;
    if (activeFilters) c += Object.values(activeFilters).filter(v => v && v.length > 0).length;
    if (hasDateFilter) c++;
    if (hasGroupBy) c++;
    return c;
  }, [activeFilters, hasDateFilter, hasGroupBy]);

  const filterChips = useMemo(() => {
    if (!activeFilters || !filterOptions) return [];
    const chips: { filterKey: string; filterLabel: string; values: { value: string; label: string }[] }[] = [];
    for (const fo of filterOptions) {
      const sel = activeFilters[fo.key];
      if (sel && sel.length > 0) {
        chips.push({
          filterKey: fo.key, filterLabel: fo.label,
          values: sel.map(v => ({ value: v, label: fo.options.find(o => o.value === v)?.label ?? v })),
        });
      }
    }
    return chips;
  }, [activeFilters, filterOptions]);

  const hasAnyFilter = filterChips.length > 0 || hasDateFilter || hasGroupBy;

  const handleSaveFavorite = useCallback(() => {
    if (!savingName.trim()) return;
    const fav: SavedFilter = {
      name: savingName.trim(),
      filters: activeFilters ?? {},
      groupBy: activeGroupBy ?? '',
      dateFrom: dateFrom ?? '',
      dateTo: dateTo ?? '',
    };
    const updated = [...favorites, fav];
    setFavorites(updated);
    saveFavorites(storageKey, updated);
    setSavingName('');
    setShowSaveInput(false);
  }, [savingName, activeFilters, activeGroupBy, dateFrom, dateTo, favorites, storageKey]);

  const handleLoadFavorite = useCallback((fav: SavedFilter) => {
    // Apply filters
    if (onClearFilters) onClearFilters();
    for (const [key, vals] of Object.entries(fav.filters)) {
      if (vals.length > 0) onSetFilter?.(key, vals);
    }
    if (fav.groupBy) onGroupByChange?.(fav.groupBy);
    onDateFromChange?.(fav.dateFrom);
    onDateToChange?.(fav.dateTo);
    setPanelOpen(false);
  }, [onClearFilters, onSetFilter, onGroupByChange, onDateFromChange, onDateToChange]);

  const handleDeleteFavorite = useCallback((idx: number) => {
    const updated = favorites.filter((_, i) => i !== idx);
    setFavorites(updated);
    saveFavorites(storageKey, updated);
  }, [favorites, storageKey]);

  return (
    <div className="space-y-2">
      {/* Odoo-style centered search bar */}
      <div ref={barRef} className="relative flex justify-center">
        <div className="relative w-full max-w-2xl">
          <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text" value={search} onChange={e => onSearchChange(e.target.value)}
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

          {/* ── Mega dropdown: 3 columns ── */}
          {panelOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl animate-in fade-in-0 slide-in-from-top-2 duration-150">
              <div className="flex divide-x divide-border">

                {/* Column 1: Filtros */}
                <div className="flex-1 p-4 space-y-1 min-w-0">
                  <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5" /> Filtros
                  </p>

                  {/* Date sub-section */}
                  {onDateFromChange && onDateToChange && (
                    <div className="mb-2">
                      <p className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> Fecha
                      </p>
                      <div className="flex items-center gap-1.5 ml-2">
                        <input
                          type="date" value={dateFrom ?? ''} onChange={e => onDateFromChange(e.target.value)}
                          className="px-2 py-1 text-[11px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 w-[120px]"
                        />
                        <span className="text-[10px] text-muted-foreground">al</span>
                        <input
                          type="date" value={dateTo ?? ''} onChange={e => onDateToChange(e.target.value)}
                          className="px-2 py-1 text-[11px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 w-[120px]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Filter categories with expandable sub-lists */}
                  {filterOptions && filterOptions.length > 0 && onToggleFilter && filterOptions.map(fo => (
                    <FilterCategory
                      key={fo.key}
                      filter={fo}
                      selected={activeFilters?.[fo.key] ?? []}
                      onToggle={(val) => onToggleFilter(fo.key, val)}
                      onSetAll={(vals) => onSetFilter?.(fo.key, vals)}
                    />
                  ))}
                </div>

                {/* Column 2: Agrupar por */}
                {groupByOptions && groupByOptions.length > 0 && onGroupByChange && (
                  <div className="p-4 min-w-[180px]">
                    <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" /> Agrupar por
                    </p>
                    <div className="space-y-0.5">
                      <button
                        onClick={() => onGroupByChange('')}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors",
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
                            "w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors",
                            activeGroupBy === g.value ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
                          )}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Column 3: Favoritos */}
                <div className="p-4 min-w-[200px]">
                  <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" /> Favoritos
                  </p>

                  {favorites.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {favorites.map((fav, i) => (
                        <div key={i} className="flex items-center gap-1 group">
                          <button
                            onClick={() => handleLoadFavorite(fav)}
                            className="flex-1 text-left px-2 py-1.5 rounded text-[12px] hover:bg-accent text-foreground transition-colors flex items-center gap-1.5"
                          >
                            <Bookmark className="h-3 w-3 text-muted-foreground" />
                            {fav.name}
                          </button>
                          <button
                            onClick={() => handleDeleteFavorite(i)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!showSaveInput ? (
                    <button
                      onClick={() => setShowSaveInput(true)}
                      className="w-full text-left px-2 py-1.5 rounded text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      Guardar búsqueda actual…
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text" value={savingName} onChange={e => setSavingName(e.target.value)}
                        placeholder="Nombre del filtro…"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveFavorite()}
                        className="w-full px-2 py-1.5 text-[12px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                      <div className="flex gap-1">
                        <button onClick={handleSaveFavorite}
                          className="flex-1 px-2 py-1 text-[11px] rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                        >
                          Guardar
                        </button>
                        <button onClick={() => { setShowSaveInput(false); setSavingName(''); }}
                          className="px-2 py-1 text-[11px] rounded border border-border hover:bg-accent"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Clear bar */}
              {activeCount > 0 && onClearFilters && (
                <div className="px-4 py-2 border-t border-border">
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

      {/* Active filter chips */}
      {(hasAnyFilter || children) && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {hasDateFilter && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2.5 py-0.5">
              <CalendarDays className="h-2.5 w-2.5" />
              {dateFrom || '…'} → {dateTo || '…'}
              <button onClick={() => { onDateFromChange?.(''); onDateToChange?.(''); }} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {filterChips.map(chip =>
            chip.values.map(v => (
              <span key={`${chip.filterKey}-${v.value}`}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2.5 py-0.5"
              >
                {chip.filterLabel}: {v.label}
                <button onClick={() => onToggleFilter?.(chip.filterKey, v.value)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          )}
          {hasGroupBy && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium rounded-full px-2.5 py-0.5">
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
