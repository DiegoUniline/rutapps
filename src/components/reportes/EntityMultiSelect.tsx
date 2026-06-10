import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, X } from 'lucide-react';

export interface MSOption { id: string; label: string; sub?: string }

interface Props {
  label: string;
  options: MSOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  loading?: boolean;
}

export function EntityMultiSelect({ label, options, value, onChange, placeholder, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter(o => o.label.toLowerCase().includes(t) || (o.sub ?? '').toLowerCase().includes(t));
  }, [q, options]);
  const labelById = useMemo(() => new Map(options.map(o => [o.id, o.label])), [options]);
  const toggle = (id: string) => {
    const set = new Set(value);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange(Array.from(set));
  };
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange([]); };

  return (
    <div>
      <label className="text-xs font-medium">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between h-9 px-2 mt-1 font-normal"
          >
            <span className="truncate text-xs">
              {value.length === 0
                ? (placeholder ?? `Todos`)
                : value.length <= 2
                  ? value.map(id => labelById.get(id) ?? id).join(', ')
                  : `${value.length} seleccionados`}
            </span>
            <span className="flex items-center gap-1">
              {value.length > 0 && (
                <span onClick={clear} className="rounded p-0.5 hover:bg-muted cursor-pointer">
                  <X className="w-3 h-3" />
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2 z-[70]" align="start">
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar…"
            className="h-8 text-sm mb-2"
          />
          <div className="max-h-64 overflow-y-auto divide-y">
            {loading && <div className="p-2 text-xs text-muted-foreground">Cargando…</div>}
            {!loading && filtered.length === 0 && (
              <div className="p-2 text-xs text-muted-foreground">Sin resultados</div>
            )}
            {filtered.map(o => {
              const checked = value.includes(o.id);
              return (
                <label key={o.id} className="flex items-start gap-2 p-1.5 hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={() => toggle(o.id)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">{o.label}</div>
                    {o.sub && <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>}
                  </div>
                </label>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="flex justify-between items-center pt-2 border-t mt-1">
              <Badge variant="secondary" className="text-[10px]">{value.length} sel.</Badge>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange([])}>Limpiar</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
