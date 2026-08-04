import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type Tabla = 'productos' | 'clientes';

/** Cuenta registros activos e inactivos de la empresa (sin traer filas). */
function useStatusCounts(tabla: Tabla) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: [`${tabla}-status-counts`, empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const count = async (status: string) => {
        const { count: c } = await (supabase.from(tabla) as any)
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa!.id)
          .eq('status', status);
        return c ?? 0;
      };
      const [activos, inactivos] = await Promise.all([count('activo'), count('inactivo')]);
      return { activos, inactivos };
    },
  });
}

/** Tarjetas con el número de registros activos e inactivos. */
export function StatusCountCards({ tabla, className }: { tabla: Tabla; className?: string }) {
  const { data } = useStatusCounts(tabla);
  const label = tabla === 'productos' ? 'Productos' : 'Clientes';
  const items = [
    { label: `${label} activos`, value: data?.activos, tone: 'text-primary' },
    { label: `${label} inactivos`, value: data?.inactivos, tone: 'text-muted-foreground' },
  ];
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:max-w-md', className)}>
      {items.map(it => (
        <div key={it.label} className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-[11px] text-muted-foreground truncate">{it.label}</div>
          <div className={cn('text-lg font-semibold tabular-nums', it.tone)}>
            {it.value === undefined ? '—' : it.value.toLocaleString('es-MX')}
          </div>
        </div>
      ))}
    </div>
  );
}
