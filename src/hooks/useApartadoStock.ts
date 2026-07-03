import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';

/**
 * Lista de almacenes habilitados por la empresa para apartar stock en pedidos móviles.
 * Devuelve [] si el flag está apagado.
 */
export function useApartadoAlmacenes() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const enabled = !!empresa?.apartar_stock_pedidos;
  const ids = empresa?.apartado_almacenes_ids ?? [];

  return useQuery({
    queryKey: ['apartado-almacenes', empresaId, ids.join(',')],
    enabled: hasEmpresa(empresaId) && enabled && ids.length > 0,
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'useApartadoAlmacenes');
      const { data, error } = await supabase
        .from('almacenes')
        .select('id, nombre')
        .eq('empresa_id', eid)
        .in('id', ids);
      if (error) throw error;
      // Ordenar según orden de configuración
      const order = new Map(ids.map((id, i) => [id, i]));
      return (data ?? []).sort((a: any, b: any) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    },
  });
}

/**
 * Mapa producto_id → disponible (stock_almacen − stock_apartado) para un almacén.
 */
export function useDisponiblePorAlmacen(almacenId: string | null | undefined) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  // Tiempo real: el disponible depende de stock_almacen (existencias) y de
  // stock_apartado (reservado). Escuchamos ambas en vez de consultar cada 30s.
  useRealtimeInvalidate({
    table: 'stock_apartado',
    empresaId,
    queryKeys: [['apartado-disponible']],
  });
  useRealtimeInvalidate({
    table: 'stock_almacen',
    empresaId,
    queryKeys: [['apartado-disponible']],
  });
  return useQuery({
    queryKey: ['apartado-disponible', empresaId, almacenId],
    enabled: hasEmpresa(empresaId) && !!almacenId,
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'useDisponiblePorAlmacen');
      const [stockRes, apartRes] = await Promise.all([
        supabase.from('stock_almacen').select('producto_id, cantidad').eq('empresa_id', eid).eq('almacen_id', almacenId!),
        supabase.from('stock_apartado').select('producto_id, cantidad').eq('empresa_id', eid).eq('almacen_id', almacenId!),
      ]);
      const map = new Map<string, number>();
      (stockRes.data ?? []).forEach((r: any) => map.set(r.producto_id, Number(r.cantidad) || 0));
      (apartRes.data ?? []).forEach((r: any) => {
        map.set(r.producto_id, (map.get(r.producto_id) ?? 0) - (Number(r.cantidad) || 0));
      });
      return map;
    },
    refetchInterval: 5 * 60_000, // red de seguridad amplia; el realtime hace el trabajo fino
    staleTime: 15000,
  });
}
