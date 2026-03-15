import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Props {
  onSelect: (product: { id: string; codigo: string; nombre: string; cantidad?: number }) => void;
  placeholder?: string;
}

export default function ProductQuickSearch({ onSelect, placeholder = 'Buscar producto...' }: Props) {
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!search || search.length < 2 || !empresa?.id) {
      setResults([]);
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, codigo, nombre, cantidad')
        .eq('empresa_id', empresa.id)
        .eq('status', 'activo')
        .or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%`)
        .order('nombre')
        .limit(15);
      setResults(data ?? []);
      setOpen(true);
    }, 250);
  }, [search, empresa?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        className="pl-9"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex justify-between"
              onClick={() => { onSelect(p); setSearch(''); setOpen(false); }}
            >
              <span className="truncate">{p.codigo} - {p.nombre}</span>
              <span className="text-muted-foreground ml-2 text-xs">Stock: {p.cantidad ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
