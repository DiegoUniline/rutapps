import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';

export type EntregaFechaTipo = 'levantamiento' | 'programada';

export interface EntregaWorkspaceCounts {
  total: number;
  borrador: number;
  surtido: number;
  asignado: number;
  cargado: number;
  en_ruta: number;
  hecho: number;
  no_entregado: number;
}

const ENTREGA_STATUSES = [
  'borrador',
  'surtido',
  'asignado',
  'cargado',
  'en_ruta',
  'hecho',
  'no_entregado',
  'cancelado',
] as const;

/**
 * Conteos de la barra de estados.
 * Conserva el alcance anterior (búsqueda + vendedor), pero PostgreSQL devuelve
 * únicamente COUNTs. Antes se descargaba todo el histórico de id/status para
 * contarlo en el navegador.
 */
export function useEntregasWorkspaceCounts(search?: string, vendedorFilter?: string) {
  const { empresa } = useAuth();
  const deferredSearch = useDeferredValue((search ?? '').trim());

  return useQuery<any>({
    queryKey: ['entregas-list', 'counts', empresa?.id, deferredSearch, vendedorFilter],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async (): Promise<EntregaWorkspaceCounts> => {
      const pairs = await Promise.all(
        ENTREGA_STATUSES.map(async status => {
          let q = supabase
            .from('entregas')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresa!.id)
            .eq('status', status as any);

          if (deferredSearch) q = q.or(`folio.ilike.%${deferredSearch}%`);
          if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);

          const { count, error } = await q;
          if (error) throw error;
          return [status, count ?? 0] as const;
        }),
      );

      const byStatus = Object.fromEntries(pairs) as Record<string, number>;
      return {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        borrador: byStatus.borrador ?? 0,
        surtido: byStatus.surtido ?? 0,
        asignado: byStatus.asignado ?? 0,
        cargado: byStatus.cargado ?? 0,
        en_ruta: byStatus.en_ruta ?? 0,
        hecho: byStatus.hecho ?? 0,
        no_entregado: byStatus.no_entregado ?? 0,
      };
    },
  });
}

/**
 * Lista operativa. Los filtros de estado/ruta/fecha se aplican en PostgreSQL.
 * Las partidas de entrega NO viajan en la carga inicial: productos y almacenes
 * por línea se consultan sólo al expandir una entrega mediante
 * useEntregaWorkspaceLineas(). Para la columna de almacén origen se conserva el
 * almacén de cabecera de la entrega como fallback ligero.
 *
 * Semántica de fechas:
 * - levantamiento: ventas.fecha del pedido origen.
 * - programada: entregas.fecha.
 *
 * Un rango vacío siempre significa TODO el histórico. Incluso si el selector
 * dice "levantamiento", no se fuerza INNER JOIN si no hay fechas, para no excluir
 * entregas sin pedido origen.
 */
export function useEntregasWorkspaceList({
  search,
  vendedorFilter,
  statusFilter,
  rutaFilter,
  fechaTipo = 'programada',
  fechaDesde,
  fechaHasta,
}: {
  search?: string;
  vendedorFilter?: string;
  statusFilter?: string;
  rutaFilter?: string;
  fechaTipo?: EntregaFechaTipo;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  const { empresa } = useAuth();
  const deferredSearch = useDeferredValue((search ?? '').trim());
  const filterByLevantamiento = fechaTipo === 'levantamiento' && !!(fechaDesde || fechaHasta);

  return useQuery({
    queryKey: [
      'entregas-list',
      'workspace',
      empresa?.id,
      deferredSearch,
      vendedorFilter,
      statusFilter,
      rutaFilter,
      fechaTipo,
      fechaDesde,
      fechaHasta,
    ],
    enabled: !!empresa?.id,
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => fetchAllPages<any>((from, to) => {
      const ventasRelation = filterByLevantamiento
        ? 'ventas!entregas_pedido_id_fkey!inner(folio, fecha)'
        : 'ventas!entregas_pedido_id_fkey(folio, fecha)';

      let q = supabase
        .from('entregas')
        .select(`id, folio, fecha, fecha_entrega, status, notas, pedido_id, vendedor_id, cliente_id, almacen_id, vendedor_ruta_id, fecha_asignacion, fecha_carga, validado_at, created_at, clientes(nombre), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre, telefono, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), ${ventasRelation}, almacenes(nombre), vendedor_ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre, telefono, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre))`)
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (deferredSearch) q = q.or(`folio.ilike.%${deferredSearch}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      if (rutaFilter === 'sin_ruta') q = q.is('vendedor_ruta_id', null);
      else if (rutaFilter && rutaFilter !== 'todos') q = q.eq('vendedor_ruta_id', rutaFilter);

      if (filterByLevantamiento) {
        if (fechaDesde) q = q.gte('ventas.fecha', fechaDesde);
        if (fechaHasta) q = q.lte('ventas.fecha', fechaHasta);
      } else if (fechaTipo === 'programada') {
        if (fechaDesde) q = q.gte('fecha', fechaDesde);
        if (fechaHasta) q = q.lte('fecha', fechaHasta);
      }

      return q;
    }),
  });
}

/** Detalle pesado de productos: sólo se ejecuta para la fila expandida. */
export function useEntregaWorkspaceLineas(entregaId?: string | null) {
  const { empresa } = useAuth();

  return useQuery({
    queryKey: ['entregas-list', 'lineas', entregaId],
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
