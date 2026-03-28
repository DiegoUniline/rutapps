import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ProductoDropdown from '@/components/ProductoDropdown';

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
    return products
      .filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, products]);

  // Skip auto-focus during initial page load; only focus on user-added rows
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (autoFocus && !readOnly && !value) {
      // If component mounted more than 500ms ago or was mounted recently by user action
      // We use a small grace period: if the page just loaded, skip auto-focus
      const timeSinceMount = Date.now() - mountedAtRef.current;
      if (timeSinceMount > 100) {
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
  }, [autoFocus, readOnly, value]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length, search]);

  useEffect(() => {
    if (!showDropdown || !dropdownRef.current || filtered.length === 0) return;
    const item = dropdownRef.current.children[Math.max(0, highlightIdx)] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, showDropdown, filtered.length]);

  const selectProduct = useCallback((id: string) => {
    onSelect(id);
    setEditing(false);
    setSearch('');
    setShowDropdown(false);
    setTimeout(() => onNavigate?.('next'), 30);
  }, [onSelect, onNavigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      if (!value) setEditing(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      if (!filtered.length) return;
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!filtered.length) return;
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();

      if (showDropdown && filtered.length > 0) {
        const selected = filtered[Math.max(0, highlightIdx)]?.id;
        if (selected) selectProduct(selected);
      } else {
        onNavigate?.(e.shiftKey ? 'prev' : 'next');
      }
    }
  };

  const handleChange = (val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setShowDropdown(true);
    }, 120);
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
    <div>
      <input
        ref={inputRef}
        type="text"
        className="input-odoo text-[12px] !py-1 w-full"
        value={search}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => {
          setShowDropdown(true);
          setHighlightIdx(0);
        }}
        onBlur={() => {
          setTimeout(() => {
            setShowDropdown(false);
            if (!value) setEditing(false);
          }, 180);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Buscar producto..."
        autoComplete="off"
      />

      <ProductoDropdown
        inputRef={inputRef}
        resultados={filtered}
        visible={showDropdown}
        search={search}
        highlightIdx={highlightIdx}
        onHover={setHighlightIdx}
        onSelect={p => selectProduct(p.id)}
        dropdownRef={dropdownRef}
      />
    </div>
  );
}
