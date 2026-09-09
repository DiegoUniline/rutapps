import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';

/**
 * Conteos de la barra de estados.
 * Mantiene exactamente el alcance anterior: búsqueda + vendedor, sin aplicar
 * estado/ruta/fecha, pero descarga únicamente id/status en lugar de toda la entrega.
 */
export function useEntregasWorkspaceCounts(search?: string, vendedorFilter?: string) {
  const { empresa } = useAuth();
  const deferredSearch = useDeferredValue((search ?? '').trim());

  return useQuery({
    queryKey: ['entregas-workspace-counts', empresa?.id, deferredSearch, vendedorFilter],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => fetchAllPages<{ id: string; status: string }>((from, to) => {
      let q = supabase
        .from('entregas')
        .select('id, status')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (deferredSearch) q = q.or(`folio.ilike.%${deferredSearch}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      return q;
    }),
  });
}

/**
 * Lista operativa. Los filtros de estado/ruta/fecha se aplican en PostgreSQL,
 * no después de descargar todas las entregas. Las líneas sólo incluyen el
 * almacén origen necesario para la columna compacta; productos/cantidades se
 * cargan bajo demanda al expandir una entrega.
 */
export function useEntregasWorkspaceList({
  search,
  vendedorFilter,
  statusFilter,
  rutaFilter,
  fechaDesde,
  fechaHasta,
}: {
  search?: string;
  vendedorFilter?: string;
  statusFilter?: string;
  rutaFilter?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  const { empresa } = useAuth();
  const deferredSearch = useDeferredValue((search ?? '').trim());

  return useQuery({
    queryKey: [
      'entregas-workspace-list',
      empresa?.id,
      deferredSearch,
      vendedorFilter,
      statusFilter,
      rutaFilter,
      fechaDesde,
      fechaHasta,
    ],
    enabled: !!empresa?.id,
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => fetchAllPages<any>((from, to) => {
      let q = supabase
        .from('entregas')
        .select('id, folio, fecha, fecha_entrega, status, notas, pedido_id, vendedor_id, cliente_id, almacen_id, vendedor_ruta_id, fecha_asignacion, fecha_carga, validado_at, created_at, clientes(nombre), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre, telefono, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), ventas!entregas_pedido_id_fkey(folio, fecha), almacenes(nombre), vendedor_ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre, telefono, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), entrega_lineas(almacen_origen_id, almacenes:almacen_origen_id(id, nombre))')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (deferredSearch) q = q.or(`folio.ilike.%${deferredSearch}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      if (rutaFilter === 'sin_ruta') q = q.is('vendedor_ruta_id', null);
      else if (rutaFilter && rutaFilter !== 'todos') q = q.eq('vendedor_ruta_id', rutaFilter);
      if (fechaDesde) q = q.gte('fecha', fechaDesde);
      if (fechaHasta) q = q.lte('fecha', fechaHasta);
      return q;
    }),
  });
}

/** Detalle pesado de productos: sólo se ejecuta para la fila expandida. */
export function useEntregaWorkspaceLineas(entregaId?: string | null) {
  const { empresa } = useAuth();

  return useQuery({
    queryKey: ['entrega-workspace-lineas', entregaId],
    enabled: !!empresa?.id && !!entregaId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entrega_lineas')
        .select('id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id, productos(codigo, nombre), almacenes:almacen_origen_id(id, nombre)')
        .eq('entrega_id', entregaId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
