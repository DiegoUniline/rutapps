import { useState, useRef, useEffect } from 'react';
import { Search, Filter, ChevronDown, Layers, X } from 'lucide-react';
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
  // New: filter/groupBy system
  filterOptions?: FilterOption[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  groupByOptions?: GroupByOption[];
  activeGroupBy?: string;
  onGroupByChange?: (value: string) => void;
  onClearFilters?: () => void;
}

function Dropdown({ trigger, children, open, onClose }: { trigger: React.ReactNode; children: React.ReactNode; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[200px] py-1 animate-in fade-in-0 zoom-in-95 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

export function OdooFilterBar({
  search, onSearchChange, placeholder = 'Buscar...', children,
  filterOptions, activeFilters, onFilterChange,
  groupByOptions, activeGroupBy, onGroupByChange, onClearFilters,
}: OdooFilterBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const hasActiveFilters = activeFilters && Object.values(activeFilters).some(v => v && v !== 'todos' && v !== '');
  const hasGroupBy = !!activeGroupBy;

  return (
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
      {filterOptions && filterOptions.length > 0 && onFilterChange ? (
        <Dropdown
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          trigger={
            <button
              onClick={() => { setFilterOpen(!filterOpen); setGroupOpen(false); }}
              className={cn(
                "btn-odoo-secondary flex items-center gap-1",
                hasActiveFilters && "border-primary text-primary"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {hasActiveFilters && (
                <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {Object.values(activeFilters!).filter(v => v && v !== 'todos').length}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
          }
        >
          {filterOptions.map(fo => (
            <div key={fo.key} className="px-3 py-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{fo.label}</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {fo.options.map(opt => {
                  const active = (activeFilters?.[fo.key] ?? 'todos') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { onFilterChange(fo.key, opt.value); }}
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-md transition-colors",
                        active
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "bg-accent text-foreground hover:bg-accent/80"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {hasActiveFilters && onClearFilters && (
            <div className="border-t border-border px-3 py-2">
              <button onClick={() => { onClearFilters(); setFilterOpen(false); }} className="text-[11px] text-destructive hover:underline flex items-center gap-1">
                <X className="h-3 w-3" /> Limpiar filtros
              </button>
            </div>
          )}
        </Dropdown>
      ) : (
        <button className="btn-odoo-secondary flex items-center gap-1">
          <Filter className="h-3.5 w-3.5" />
          Filtros
          <ChevronDown className="h-3 w-3" />
        </button>
      )}

      {/* Group by dropdown */}
      {groupByOptions && groupByOptions.length > 0 && onGroupByChange ? (
        <Dropdown
          open={groupOpen}
          onClose={() => setGroupOpen(false)}
          trigger={
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
          }
        >
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
        </Dropdown>
      ) : (
        <button className="btn-odoo-secondary flex items-center gap-1">
          Agrupar por
          <ChevronDown className="h-3 w-3" />
        </button>
      )}

      {children}
    </div>
  );
}
