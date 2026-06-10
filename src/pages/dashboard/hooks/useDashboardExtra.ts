import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { DateRange } from '@/hooks/useDashboardData';

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export function useDashboardVisitas(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-visitas', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) => {
        let q = supabase.from('visitas')
          .select('id, fecha, user_id, cliente_id, venta_id')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', fmt(range.from)).lte('fecha', fmt(range.to))
          .range(from, to);
        if (vendedorId) q = q.eq('user_id', vendedorId);
        return q;
      });
    },
  });
}

export function useClientesActivos() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-clientes-activos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const data = await fetchAllPages((from, to) => supabase.from('clientes')
        .select('id, nombre, status, vendedor_id')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo' as any)
        .range(from, to));
      return data;
    },
  });
}

export function useUltimaCompraPorCliente() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-ultima-compra', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const data = await fetchAllPages((from, to) => supabase.from('ventas')
        .select('cliente_id, fecha')
        .eq('empresa_id', empresa!.id)
        .neq('status', 'cancelado' as any)
        .order('fecha', { ascending: false })
        .range(from, to));
      const map = new Map<string, string>();
      (data ?? []).forEach((v: any) => {
        if (v.cliente_id && !map.has(v.cliente_id)) map.set(v.cliente_id, v.fecha);
      });
      return map;
    },
  });
}
