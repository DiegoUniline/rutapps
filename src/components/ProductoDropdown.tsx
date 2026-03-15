import { RefObject, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ProductOption {
  id: string;
  codigo: string;
  nombre: string;
  precio_principal?: number;
}

interface ProductoDropdownProps {
  inputRef: RefObject<HTMLInputElement>;
  resultados: ProductOption[];
  visible: boolean;
  search: string;
  highlightIdx: number;
  onHover: (index: number) => void;
  onSelect: (product: ProductOption) => void;
  dropdownRef: RefObject<HTMLDivElement>;
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

export default function ProductoDropdown({
  inputRef,
  resultados,
  visible,
  search,
  highlightIdx,
  onHover,
  onSelect,
  dropdownRef,
}: ProductoDropdownProps) {
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [inputRef]);

  useEffect(() => {
    if (!visible) {
      setPosition(null);
      return;
    }

    updatePosition();

    const handleScroll = () => updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [visible, updatePosition]);

  if (!visible || !inputRef.current || !position) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: position.width,
        zIndex: 99999,
      }}
      className="bg-popover border border-border rounded-md shadow-xl max-h-60 overflow-y-auto"
    >
      {resultados.length === 0 ? (
        <div className="px-3 py-2.5 text-[12px] text-muted-foreground">Sin resultados</div>
      ) : (
        resultados.map((p, i) => (
          <div
            key={p.id}
            onMouseDown={e => {
              e.preventDefault();
              onSelect(p);
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'px-3 py-2 text-[12px] cursor-pointer flex items-center justify-between gap-2 transition-colors',
              i === highlightIdx ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent'
            )}
          >
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground font-mono mr-1.5">{highlightMatch(p.codigo, search)}</span>
              {highlightMatch(p.nombre, search)}
            </span>
            {p.precio_principal != null && (
              <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                ${Number(p.precio_principal).toFixed(2)}
              </span>
            )}
          </div>
        ))
      )}
    </div>,
    document.body
  );
}
