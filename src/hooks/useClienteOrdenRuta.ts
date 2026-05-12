import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Reads `cliente_orden_ruta` (the same table the desktop "Mapa de Clientes"
 * persists optimized routes into) and returns a Map<cliente_id, orden>
 * scoped to a vendedor + day, so mobile shows EXACTLY the same numbering
 * the supervisor sees on desktop.
 */
export function useClienteOrdenRuta(vendedorId?: string | null, dia?: string | null) {
  const { empresa } = useAuth();
  const queryKey = ['cliente-orden-ruta', empresa?.id, vendedorId ?? null, dia ?? null];

  const query = useQuery({
    queryKey,
    enabled: !!empresa?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('cliente_orden_ruta' as any)
        .select('cliente_id, orden, vendedor_id')
        .eq('empresa_id', empresa!.id)
        .order('orden', { ascending: true });
      q = dia ? q.ilike('dia', dia) : q.is('dia', null);
      // First try with the vendor scope (route optimized for that seller).
      if (vendedorId) q = q.eq('vendedor_id', vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      let rows = ((data ?? []) as unknown) as { cliente_id: string; orden: number; vendedor_id: string | null }[];

      // Fallback: if vendor has no specific route saved, use the global
      // (vendedor_id IS NULL) route the supervisor saved for that day.
      if (vendedorId && rows.length === 0) {
        let gq = supabase
          .from('cliente_orden_ruta' as any)
          .select('cliente_id, orden, vendedor_id')
          .eq('empresa_id', empresa!.id)
          .is('vendedor_id', null)
          .order('orden', { ascending: true });
        gq = dia ? gq.ilike('dia', dia) : gq.is('dia', null);
        const { data: gdata } = await gq;
        rows = (gdata ?? []) as any;
      }
      return rows;
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, number>();
    (query.data ?? []).forEach(r => m.set(r.cliente_id, r.orden));
    return m;
  }, [query.data]);

  return { ordenMap: map, isLoading: query.isLoading, refetch: query.refetch, queryKey };
}

/**
 * Persists a swap of two clients in cliente_orden_ruta for the given
 * vendedor + dia. If no row exists yet we seed the full visible list
 * from the provided `currentOrder` so future reorders are stable.
 */
export async function swapOrdenRuta(opts: {
  empresaId: string;
  vendedorId: string | null;
  dia: string | null;
  currentOrder: string[]; // full ordered list of cliente_ids visible to user
  fromIdx: number;
  toIdx: number;
}) {
  const { empresaId, vendedorId, dia, currentOrder, fromIdx, toIdx } = opts;
  if (fromIdx === toIdx) return;
  const next = [...currentOrder];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);

  // Wipe the scope and rewrite. Same strategy desktop uses.
  let delQ = (supabase.from('cliente_orden_ruta' as any) as any)
    .delete().eq('empresa_id', empresaId);
  delQ = dia ? delQ.eq('dia', dia) : delQ.is('dia', null);
  delQ = vendedorId ? delQ.eq('vendedor_id', vendedorId) : delQ.is('vendedor_id', null);
  await delQ;

  const rows = next.map((cid, idx) => ({
    empresa_id: empresaId,
    cliente_id: cid,
    dia: dia || null,
    vendedor_id: vendedorId,
    orden: idx + 1,
  }));
  if (rows.length > 0) {
    const { error } = await (supabase.from('cliente_orden_ruta' as any) as any).insert(rows);
    if (error) throw error;
  }
}

export function useInvalidateOrdenRuta() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['cliente-orden-ruta'] });
}
