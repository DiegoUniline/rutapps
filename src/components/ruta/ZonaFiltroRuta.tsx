import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPinned, Check, ChevronDown, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { cn, todayLocal } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { useVendedorRutaVista } from '@/hooks/useVendedorRutaVista';

/** '' = todas las zonas · SIN_ZONA = clientes sin zona · otro = id de la zona. */
export const SIN_ZONA = '__sin_zona__';

// La zona se recuerda solo durante el día: al día siguiente la app arranca con todas las zonas
// (antes quedaba elegida para siempre y la lista podía verse vacía sin que el vendedor lo notara).
const claveFiltro = (empresaId?: string | null) => `ruta_zona_filtro_${empresaId ?? ''}_${todayLocal()}`;

function leer(empresaId?: string | null): string {
  try { return localStorage.getItem(claveFiltro(empresaId)) ?? ''; } catch { return ''; }
}

// Un solo valor para toda la app de ruta: al cambiarlo, Clientes, Entregas, CxC y Navegar
// se actualizan a la vez.
const oyentes = new Set<() => void>();
function suscribir(cb: () => void) { oyentes.add(cb); return () => { oyentes.delete(cb); }; }

/**
 * Zona elegida en la app de ruta (universal). Se guarda en el celular solo por el día.
 */
export function useZonaFiltroRuta() {
  const { empresa } = useAuth();
  const zona = useSyncExternalStore(suscribir, () => leer(empresa?.id), () => '');
  const setZona = useCallback((z: string) => {
    try {
      if (z) localStorage.setItem(claveFiltro(empresa?.id), z);
      else localStorage.removeItem(claveFiltro(empresa?.id));
    } catch (e) {
      console.warn('[ruta] no se pudo guardar el filtro de zona:', (e as Error).message);
    }
    oyentes.forEach(cb => cb());
  }, [empresa?.id]);
  return { zona, setZona };
}

/** Opciones de zona con cuántos clientes tiene cada una (las zonas sin clientes no se listan). */
function useOpcionesZona(clientes: { zona_id?: string | null }[], value: string) {
  const { empresa } = useAuth();
  const { data: zonas } = useOfflineQuery('zonas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id, orderBy: 'nombre' });
  return useMemo(() => {
    const conteo = new Map<string, number>();
    let sz = 0;
    for (const c of clientes) {
      if (c.zona_id) conteo.set(c.zona_id, (conteo.get(c.zona_id) ?? 0) + 1); else sz++;
    }
    const opciones = ((zonas ?? []) as any[])
      .filter(z => conteo.has(z.id) || z.id === value)
      .map(z => ({ id: z.id as string, nombre: String(z.nombre ?? 'Zona'), count: conteo.get(z.id) ?? 0 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const nombreActual = value === SIN_ZONA
      ? 'Sin zona'
      : value ? (((zonas ?? []) as any[]).find(z => z.id === value)?.nombre ?? 'Zona') : null;
    return { opciones, sinZona: sz, nombreActual };
  }, [zonas, clientes, value]);
}

function OpcionesZonaMenu({ value, onChange, opciones, sinZona }: {
  value: string; onChange: (z: string) => void; opciones: { id: string; nombre: string; count: number }[]; sinZona: number;
}) {
  return (
    <DropdownMenuContent align="end" className="max-h-[60vh] overflow-auto min-w-[220px]">
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
  );
}

/**
 * Barra universal de zona (debajo de Clientes | Entregas | CxC). Cuenta los clientes
 * activos de la ruta que se está viendo (los del vendedor si la visibilidad es «propios»
 * o si el super admin eligió un vendedor).
 */
export function ZonaBarraRuta() {
  const { empresa } = useAuth();
  const { zona, setZona } = useZonaFiltroRuta();
  const { vendedorId, desdeServidor } = useVendedorRutaVista();
  const { clientesVisibilidad } = useDataVisibility('clientes');

  const { data: clientesOffline } = useOfflineQuery('clientes', { empresa_id: empresa?.id, status: 'activo' }, {
    enabled: !!empresa?.id && !desdeServidor, orderBy: 'orden',
  });
  // Misma consulta y llave que RutaClientes (modo super admin): se comparte el caché.
  const { data: clientesServidor } = useQuery({
    queryKey: ['sa-ruta-clientes', empresa?.id],
    enabled: !!empresa?.id && desdeServidor,
    queryFn: async () => (await fetchAllPages((from, to) =>
      supabase.from('clientes').select('*').eq('empresa_id', empresa!.id).eq('status', 'activo').order('orden').range(from, to)
    )) ?? [],
  });
  const clientes = useMemo(() => {
    const base = ((desdeServidor ? clientesServidor : clientesOffline) ?? []) as any[];
    const soloVendedor = desdeServidor || clientesVisibilidad === 'propios';
    return soloVendedor && vendedorId ? base.filter(c => c.vendedor_id === vendedorId) : base;
  }, [desdeServidor, clientesServidor, clientesOffline, clientesVisibilidad, vendedorId]);

  const { opciones, sinZona, nombreActual } = useOpcionesZona(clientes, zona);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex-1 min-w-0 h-9 rounded-lg border px-3 flex items-center gap-2 text-[12px] font-semibold active:scale-[0.99] transition-transform",
              zona ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground",
            )}
            aria-label={`Zona: ${nombreActual ?? 'Todas las zonas'}`}
          >
            <MapPinned className="h-4 w-4 shrink-0" />
            <span className="truncate">Zona: {nombreActual ?? 'Todas las zonas'}</span>
            <ChevronDown className="h-4 w-4 ml-auto shrink-0 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <OpcionesZonaMenu value={zona} onChange={setZona} opciones={opciones} sinZona={sinZona} />
      </DropdownMenu>
      {zona && (
        <button
          type="button"
          onClick={() => setZona('')}
          className="shrink-0 h-9 rounded-lg border border-border bg-card px-2.5 flex items-center gap-1 text-[12px] font-semibold text-muted-foreground active:scale-95"
          aria-label="Quitar filtro de zona"
        >
          <X className="h-3.5 w-3.5" /> Quitar
        </button>
      )}
    </div>
  );
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
  const { opciones, sinZona, nombreActual } = useOpcionesZona(clientes, value);
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
      <OpcionesZonaMenu value={value} onChange={onChange} opciones={opciones} sinZona={sinZona} />
    </DropdownMenu>
  );
}
