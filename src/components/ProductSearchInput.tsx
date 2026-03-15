import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface ProductOption {
  id: string;
  codigo: string;
  nombre: string;
  precio_principal?: number;
}

interface Props {
  products: ProductOption[];
  value: string; // producto_id
  displayText?: string; // shown when not editing
  onSelect: (id: string) => void;
  onNavigate?: (dir: 'next' | 'prev') => void;
  autoFocus?: boolean;
  readOnly?: boolean;
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

export default function ProductSearchInput({ products, value, displayText, onSelect, onNavigate, autoFocus, readOnly }: Props) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 8);
    const q = search.toLowerCase();
    return products.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, products]);

  useEffect(() => {
    if (autoFocus && !readOnly && !value) {
      setEditing(true);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [autoFocus, readOnly, value]);

  // Keep highlight in bounds
  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length, search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) return;
    const el = dropdownRef.current.children[highlightIdx] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, showDropdown]);

  const selectProduct = useCallback((id: string) => {
    onSelect(id);
    setEditing(false);
    setSearch('');
    setShowDropdown(false);
    // Move to next cell
    setTimeout(() => onNavigate?.('next'), 30);
  }, [onSelect, onNavigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (showDropdown && filtered.length > 0) {
        selectProduct(filtered[highlightIdx].id);
      } else if (!showDropdown) {
        onNavigate?.(e.shiftKey ? 'prev' : 'next');
      }
      return;
    }
  };

  const handleChange = (val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setShowDropdown(true);
    }, 150);
  };

  const startEditing = () => {
    if (readOnly) return;
    setEditing(true);
    setSearch('');
    setShowDropdown(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
  };

  // If not editing, show display text
  if (!editing && value) {
    return (
      <div
        onClick={startEditing}
        className="text-[12px] py-1 px-1 cursor-text min-h-[28px] flex items-center hover:bg-secondary/50 rounded transition-colors"
      >
        {displayText || '—'}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input-odoo text-[12px] !py-1 w-full"
        value={search}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { setShowDropdown(true); setHighlightIdx(0); }}
        onBlur={() => setTimeout(() => { setShowDropdown(false); if (!value) setEditing(false); }, 200)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar producto..."
        autoComplete="off"
      />
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border border-border rounded-md shadow-lg max-h-[240px] overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-[12px] text-muted-foreground">Sin resultados</div>
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                onMouseDown={e => { e.preventDefault(); selectProduct(p.id); }}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`px-3 py-2 text-[12px] cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                  i === highlightIdx ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-secondary/50'
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground font-mono mr-1.5">{highlightMatch(p.codigo, search)}</span>
                  {highlightMatch(p.nombre, search)}
                </span>
                {p.precio_principal != null && (
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px]">${Number(p.precio_principal).toFixed(2)}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
