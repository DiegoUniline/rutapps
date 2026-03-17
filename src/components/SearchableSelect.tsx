import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  onClose?: () => void;
  placeholder?: string;
  autoOpen?: boolean;
  /** When provided, shows a "Crear nuevo" option. Should return the new item's id. */
  onCreateNew?: (name: string) => Promise<string | undefined>;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  onClose,
  placeholder = 'Buscar...',
  autoOpen = false,
  onCreateNew,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(autoOpen);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedLabel = options.find(o => o.value === value)?.label ?? '';

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [search, options]);

  // Reset highlight on filter change
  useEffect(() => { setHighlightIdx(0); }, [filtered.length, search]);

  // Position dropdown
  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) });
  }, []);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const el = dropdownRef.current.children[highlightIdx + 1] as HTMLElement | undefined; // +1 because search is first child
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const select = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
    onClose?.();
  }, [onChange, onClose]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setSearch('');
    onClose?.();
  }, [onChange, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      onClose?.();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (filtered[highlightIdx]) select(filtered[highlightIdx].value);
      else { setOpen(false); setSearch(''); onClose?.(); }
    }
  };

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
      onClose?.();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setOpen(true)}
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

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
          }}
          className="bg-popover border border-border rounded-md shadow-xl flex flex-col max-h-[280px]"
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
            {filtered.length === 0 && !onCreateNew ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">Sin resultados</div>
            ) : filtered.length === 0 && onCreateNew && !search.trim() ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">Escribe un nombre para crear</div>
            ) : (
              <>
                {filtered.map((o, i) => (
                  <div
                    key={o.value}
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
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
                ))}
                {/* Quick-create option */}
                {onCreateNew && search.trim() && !filtered.some(o => o.label.toLowerCase() === search.trim().toLowerCase()) && (
                  <div
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                    onMouseUp={async () => {
                      if (creating) return;
                      setCreating(true);
                      try {
                        const newId = await onCreateNew(search.trim());
                        if (newId) {
                          select(newId);
                        }
                      } finally {
                        setCreating(false);
                      }
                    }}
                    className="px-3 py-2 text-[13px] cursor-pointer transition-colors flex items-center gap-1.5 text-primary font-medium hover:bg-accent/50 border-t border-border"
                  >
                    {creating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Crear "{search.trim()}"
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
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
