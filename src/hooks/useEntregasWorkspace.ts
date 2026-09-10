import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type EntregaFechaTipo = 'levantamiento' | 'programada';

export interface EntregaWorkspaceCounts {
  total: number;
  borrador: number;
  surtido: number;
  asignado: number;
  cargado: number;
  en_ruta: number;
  listo?: number;
  hecho: number;
  no_entregado: number;
  cancelado?: number;
}

const EMPTY_COUNTS: EntregaWorkspaceCounts = {
  total: 0,
  borrador: 0,
  surtido: 0,
  asignado: 0,
  cargado: 0,
  en_ruta: 0,
  listo: 0,
  hecho: 0,
  no_entregado: 0,
  cancelado: 0,
};

/**
 * Compatibilidad para consumidores antiguos. Entrega sólo conteos y ya no hace
 * nueve COUNTs separados: usa la misma función V2 paginada del workspace.
 */
export function useEntregasWorkspaceCounts(search?: string, vendedorFilter?: string) {
  const { empresa } = useAuth();
  const deferredSearch = useDeferredValue((search ?? '').trim());

  return useQuery({
    queryKey: ['entregas-list', 'counts-v2', empresa?.id, deferredSearch, vendedorFilter],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EntregaWorkspaceCounts> => {
      const { data, error } = await (supabase as any).rpc('fn_logistica_entregas_workspace_v2', {
        p_empresa_id: empresa!.id,
        p_search: deferredSearch || null,
        p_vendedor_id: vendedorFilter && vendedorFilter !== 'todos' ? vendedorFilter : null,
        p_status: 'todos',
        p_ruta: 'todos',
        p_fecha_tipo: 'programada',
        p_fecha_desde: null,
        p_fecha_hasta: null,
        p_page_size: 1,
        p_offset: 0,
      });
      if (error) throw error;
      const c = data?.counts ?? {};
      return {
        total: Number(c.total ?? 0),
        borrador: Number(c.borrador ?? 0),
        surtido: Number(c.surtido ?? 0),
        asignado: Number(c.asignado ?? 0),
        cargado: Number(c.cargado ?? 0),
        en_ruta: Number(c.en_ruta ?? 0),
        listo: Number(c.listo ?? 0),
        hecho: Number(c.hecho ?? 0),
        no_entregado: Number(c.no_entregado ?? 0),
        cancelado: Number(c.cancelado ?? 0),
      };
    },
  });
}

/**
 * Lista operativa V2. Una sola llamada devuelve la página actual, el total y
 * los conteos por estado. Las líneas de producto siguen cargándose sólo al
 * expandir una entrega.
 */
export function useEntregasWorkspaceList({
  search,
  vendedorFilter,
  statusFilter,
  rutaFilter,
  fechaTipo = 'programada',
  fechaDesde,
  fechaHasta,
  page = 0,
  pageSize = 50,
}: {
  search?: string;
  vendedorFilter?: string;
  statusFilter?: string;
  rutaFilter?: string;
  fechaTipo?: EntregaFechaTipo;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  pageSize?: number;
}) {
  const { empresa } = useAuth();
  const deferredSearch = useDeferredValue((search ?? '').trim());

  return useQuery({
    queryKey: [
      'entregas-list',
      'workspace-v2',
      empresa?.id,
      deferredSearch,
      vendedorFilter,
      statusFilter,
      rutaFilter,
      fechaTipo,
      fechaDesde,
      fechaHasta,
      page,
      pageSize,
    ],
    enabled: !!empresa?.id,
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fn_logistica_entregas_workspace_v2', {
        p_empresa_id: empresa!.id,
        p_search: deferredSearch || null,
        p_vendedor_id: vendedorFilter && vendedorFilter !== 'todos' ? vendedorFilter : null,
        p_status: statusFilter || 'todos',
        p_ruta: rutaFilter || 'todos',
        p_fecha_tipo: fechaTipo,
        p_fecha_desde: fechaDesde || null,
        p_fecha_hasta: fechaHasta || null,
        p_page_size: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;

      const payload = data ?? {};
      const c = payload.counts ?? {};
      const rows = (Array.isArray(payload.rows) ? payload.rows : []).map((r: any) => ({
        id: r.id,
        folio: r.folio,
        fecha: r.fecha,
        fecha_entrega: r.fecha_entrega,
        status: r.status,
        notas: r.notas,
        pedido_id: r.pedido_id,
        vendedor_id: r.vendedor_id,
        cliente_id: r.cliente_id,
        almacen_id: r.almacen_id,
        vendedor_ruta_id: r.vendedor_ruta_id,
        fecha_asignacion: r.fecha_asignacion,
        fecha_carga: r.fecha_carga,
        validado_at: r.validado_at,
        created_at: r.created_at,
        clientes: r.cliente_nombre ? { nombre: r.cliente_nombre } : null,
        ventas: r.pedido_id ? { folio: r.pedido_folio, fecha: r.pedido_fecha } : null,
        almacenes: r.almacen_nombre ? { nombre: r.almacen_nombre } : null,
        vendedores: r.vendedor_id ? {
          nombre: r.vendedor_nombre,
          telefono: r.vendedor_telefono,
          almacen_destino: r.vendedor_almacen_destino_id ? {
            id: r.vendedor_almacen_destino_id,
            nombre: r.vendedor_almacen_destino_nombre,
          } : null,
        } : null,
        vendedor_ruta: r.vendedor_ruta_id ? {
          nombre: r.vendedor_ruta_nombre,
          telefono: r.vendedor_ruta_telefono,
          almacen_destino: r.vendedor_ruta_almacen_destino_id ? {
            id: r.vendedor_ruta_almacen_destino_id,
            nombre: r.vendedor_ruta_almacen_destino_nombre,
          } : null,
        } : null,
      }));

      return {
        rows,
        totalCount: Number(payload.total_count ?? 0),
        counts: {
          total: Number(c.total ?? 0),
          borrador: Number(c.borrador ?? 0),
          surtido: Number(c.surtido ?? 0),
          asignado: Number(c.asignado ?? 0),
          cargado: Number(c.cargado ?? 0),
          en_ruta: Number(c.en_ruta ?? 0),
          listo: Number(c.listo ?? 0),
          hecho: Number(c.hecho ?? 0),
          no_entregado: Number(c.no_entregado ?? 0),
          cancelado: Number(c.cancelado ?? 0),
        } as EntregaWorkspaceCounts,
      };
    },
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
