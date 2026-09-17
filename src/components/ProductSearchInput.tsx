import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ProductoDropdown from '@/components/ProductoDropdown';

interface ProductOption {
  id: string;
  codigo: string;
  nombre: string;
  formula?: string | null;
  precio_principal?: number;
  _stock?: number;
}

export interface PresentacionOption {
  id: string;
  producto_id: string;
  nombre: string;
  factor_base: number;
  precio_especial?: number | null;
  activo?: boolean;
  codigo_barras?: string | null;
}

/** Opción expandida: producto base o producto + presentación (caja/paquete). */
interface ExpandedOption extends ProductOption {
  productoId: string;
  presentacion?: PresentacionOption;
  _barcode?: string | null;
}

interface Props {
  products: ProductOption[];
  /** Presentaciones activas de la empresa: se listan como opciones propias. */
  presentaciones?: PresentacionOption[];
  value: string; // producto_id
  displayText?: string; // shown when not editing
  onSelect: (id: string, presentacion?: PresentacionOption) => void;
  onNavigate?: (dir: 'next' | 'prev') => void;
  autoFocus?: boolean;
  readOnly?: boolean;
  /** Callback to register the focusable element for grid navigation (setCellRef) */
  registerRef?: (el: HTMLElement | null) => void;
}

const fmtNum = (n: number) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 3 });

export default function ProductSearchInput({ products, presentaciones, value, displayText, onSelect, onNavigate, autoFocus, readOnly, registerRef }: Props) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cada presentación activa se muestra como una opción propia del buscador,
  // igual que en el punto de venta: seleccionarla ya deja la línea armada.
  const options = useMemo<ExpandedOption[]>(() => {
    const byProducto = new Map<string, PresentacionOption[]>();
    (presentaciones ?? []).forEach(p => {
      if (p.activo === false || !(Number(p.factor_base) > 0)) return;
      const list = byProducto.get(p.producto_id) ?? [];
      list.push(p);
      byProducto.set(p.producto_id, list);
    });
    const out: ExpandedOption[] = [];
    products.forEach(p => {
      out.push({ ...p, productoId: p.id });
      (byProducto.get(p.id) ?? []).forEach(pres => {
        const factor = Number(pres.factor_base) || 1;
        const precio = pres.precio_especial != null
          ? Number(pres.precio_especial)
          : (p.precio_principal != null ? Number(p.precio_principal) * factor : undefined);
        out.push({
          ...p,
          id: `${p.id}::${pres.id}`,
          productoId: p.id,
          presentacion: pres,
          nombre: `${p.nombre} · ${pres.nombre} (${fmtNum(factor)})`,
          precio_principal: precio,
          _stock: p._stock != null ? Math.floor(Number(p._stock) / factor) : undefined,
          _barcode: pres.codigo_barras ?? null,
        });
      });
    });
    return out;
  }, [products, presentaciones]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options.slice(0, 10);
    const q = search.toLowerCase();
    return options
      .filter(p =>
        p.nombre.toLowerCase().includes(q)
        || p.codigo.toLowerCase().includes(q)
        || (p.formula ?? '').toLowerCase().includes(q)
        || (p._barcode ?? '').toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [search, options]);

  // No auto-focus on mount — the parent uses focusCell() to explicitly
  // focus the input when a user adds a new line or navigates via keyboard.

  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length, search]);

  useEffect(() => {
    if (!showDropdown || !dropdownRef.current || filtered.length === 0) return;
    const item = dropdownRef.current.children[Math.max(0, highlightIdx)] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, showDropdown, filtered.length]);

  const selectProduct = useCallback((option: ExpandedOption) => {
    onSelect(option.productoId, option.presentacion);
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
        const selected = filtered[Math.max(0, highlightIdx)];
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
        ref={el => registerRef?.(el)}
        tabIndex={0}
        onClick={startEditing}
        onFocus={startEditing}
        className="text-[12px] py-1 px-1 cursor-text min-h-[28px] flex items-center hover:bg-secondary/50 rounded transition-colors outline-none"
      >
        {displayText || '—'}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={el => { inputRef.current = el; registerRef?.(el); }}
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
        placeholder="Buscar producto o presentación..."
        autoComplete="off"
      />

      <ProductoDropdown
        inputRef={inputRef}
        resultados={filtered}
        visible={showDropdown}
        search={search}
        highlightIdx={highlightIdx}
        onHover={setHighlightIdx}
        onSelect={p => selectProduct(p as ExpandedOption)}
        dropdownRef={dropdownRef}
      />
    </div>
  );
}
