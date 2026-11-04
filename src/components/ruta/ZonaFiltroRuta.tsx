import { useCallback, useMemo, useState } from 'react';
import { MapPinned, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { cn } from '@/lib/utils';

/** '' = todas las zonas · SIN_ZONA = clientes sin zona · otro = id de la zona. */
export const SIN_ZONA = '__sin_zona__';

const claveFiltro = (empresaId?: string | null) => `ruta_zona_filtro_${empresaId ?? ''}`;

function leer(empresaId?: string | null): string {
  try { return localStorage.getItem(claveFiltro(empresaId)) ?? ''; } catch { return ''; }
}

/**
 * Zona elegida en la app de ruta. Se guarda en el celular para que Clientes
 * (Pendientes) y Navegar muestren la misma zona sin elegirla dos veces.
 */
export function useZonaFiltroRuta() {
  const { empresa } = useAuth();
  const [zona, setZonaState] = useState<string>(() => leer(empresa?.id));
  const [empresaVista, setEmpresaVista] = useState(empresa?.id);
  if (empresaVista !== empresa?.id) {
    setEmpresaVista(empresa?.id);
    setZonaState(leer(empresa?.id));
  }
  const setZona = useCallback((z: string) => {
    setZonaState(z);
    try {
      if (z) localStorage.setItem(claveFiltro(empresa?.id), z);
      else localStorage.removeItem(claveFiltro(empresa?.id));
    } catch (e) {
      console.warn('[ruta] no se pudo guardar el filtro de zona:', (e as Error).message);
    }
  }, [empresa?.id]);
  return { zona, setZona };
}

export function clienteEnZona(cliente: { zona_id?: string | null } | null | undefined, zona: string): boolean {
  if (!zona) return true;
  if (zona === SIN_ZONA) return !cliente?.zona_id;
  return cliente?.zona_id === zona;
}

interface Props {
  value: string;
  onChange: (zona: string) => void;
  /** Clientes sobre los que se cuentan los de cada zona (las zonas sin clientes no se listan). */
  clientes: { zona_id?: string | null }[];
  className?: string;
}

export function ZonaFiltroRuta({ value, onChange, clientes, className }: Props) {
  const { empresa } = useAuth();
  const { data: zonas } = useOfflineQuery('zonas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id, orderBy: 'nombre' });

  const { opciones, sinZona } = useMemo(() => {
    const conteo = new Map<string, number>();
    let sz = 0;
    for (const c of clientes) {
      if (c.zona_id) conteo.set(c.zona_id, (conteo.get(c.zona_id) ?? 0) + 1); else sz++;
    }
    const lista = ((zonas ?? []) as any[])
      .filter(z => conteo.has(z.id) || z.id === value)
      .map(z => ({ id: z.id as string, nombre: String(z.nombre ?? 'Zona'), count: conteo.get(z.id) ?? 0 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { opciones: lista, sinZona: sz };
  }, [zonas, clientes, value]);

  const nombreActual = value === SIN_ZONA
    ? 'Sin zona'
    : value ? (((zonas ?? []) as any[]).find(z => z.id === value)?.nombre ?? 'Zona') : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "shrink-0 h-[44px] rounded-xl border flex items-center justify-center gap-1.5 px-3 text-xs font-semibold active:scale-95 transition-transform",
            value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground",
            className,
          )}
          title="Filtrar por zona"
          aria-label={nombreActual ? `Zona: ${nombreActual}` : 'Filtrar por zona'}
        >
          <MapPinned className="h-4 w-4" />
          {nombreActual && <span className="max-w-[90px] truncate">{nombreActual}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60vh] overflow-auto min-w-[200px]">
        <DropdownMenuItem onClick={() => onChange('')} className="justify-between">
          Todas las zonas {!value && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        {opciones.map(z => (
          <DropdownMenuItem key={z.id} onClick={() => onChange(z.id)} className="justify-between gap-3">
            <span className="truncate">{z.nombre} <span className="text-muted-foreground">({z.count})</span></span>
            {value === z.id && <Check className="h-4 w-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {(sinZona > 0 || value === SIN_ZONA) && (
          <DropdownMenuItem onClick={() => onChange(SIN_ZONA)} className="justify-between gap-3">
            <span>Sin zona <span className="text-muted-foreground">({sinZona})</span></span>
            {value === SIN_ZONA && <Check className="h-4 w-4 shrink-0" />}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
