import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface ModalSelectProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

/**
 * A dropdown select designed to work INSIDE modals/dialogs.
 * Renders the dropdown list inline (position: absolute) instead of portaling to document.body,
 * avoiding all event conflicts with Radix Dialog overlays.
 */
export default function ModalSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar...',
}: ModalSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label ?? '';

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [search, options]);

  useEffect(() => { setHighlightIdx(0); }, [filtered.length, search]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  // Close on click outside using contains()
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const select = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange('');
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // CRITICAL: prevent modal from capturing arrows/Escape
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) select(filtered[highlightIdx].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setSearch('');
    } else if (e.key === 'Tab') {
      if (filtered[highlightIdx]) select(filtered[highlightIdx].value);
      else { setOpen(false); setSearch(''); }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <div
        onClick={() => { setOpen(true); setHighlightIdx(0); }}
        className={cn(
          "inline-edit-input flex items-center justify-between gap-1 cursor-pointer min-h-[28px] text-[13px]",
          !value && "text-muted-foreground"
        )}
      >
        <span className="truncate flex-1">{selectedLabel || placeholder || '—'}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {value && (
            <button
              type="button"
              onMouseDown={clear}
              className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      {/* Dropdown — rendered INLINE (absolute), NOT portaled */}
      {open && (
        <div
          className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-xl z-[99999] flex flex-col max-h-[280px]"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoComplete="off"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">Sin resultados</div>
            ) : (
              filtered.map((o, i) => (
                <div
                  key={o.value}
                  onMouseDown={e => e.preventDefault()}
                  onMouseUp={() => select(o.value)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={cn(
                    'px-3 py-2 text-[13px] cursor-pointer transition-colors truncate',
                    i === highlightIdx ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50',
                    o.value === value && 'font-semibold'
                  )}
                >
                  {highlightMatch(o.label, search)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
