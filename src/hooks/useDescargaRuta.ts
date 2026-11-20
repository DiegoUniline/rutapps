import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { fetchLiquidacionEsperado, fetchLiquidacionesEsperado } from '@/lib/liquidacion';

export interface DescargaLinea {
  producto_id: string;
  producto_nombre: string;
  producto_codigo: string;
  cantidad_cargada: number;
  cantidad_vendida: number;
  cantidad_devuelta: number;
  cantidad_esperada: number;
  cantidad_real: number;
  diferencia: number;
  motivo: string | null;
  notas: string | null;
}

export function useDescargasListDesktop() {
  const { empresa } = useAuth();
  useRealtimeInvalidate({
    table: 'descarga_ruta',
    empresaId: empresa?.id,
    queryKeys: [['descargas-list']],
  });
  return useQuery({
    queryKey: ['descargas-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) =>
        supabase
          .from('descarga_ruta')
          .select('id, fecha, fecha_inicio, fecha_fin, status, vendedor_id, user_id, empresa_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, descargo_camion, almacen_destino_id, vendedores:profiles!vendedor_id(nombre), cargas(fecha)')
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
    },
  });
}

export function useDescargaDetalle(descargaId: string | null) {
  return useQuery({
    queryKey: ['descarga-detalle', descargaId],
    enabled: !!descargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('descarga_ruta')
        .select('id, fecha, fecha_inicio, fecha_fin, status, vendedor_id, user_id, empresa_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, notas_supervisor, fecha_aprobacion, descargo_camion, almacen_destino_id, vendedores:profiles!vendedor_id(nombre), cargas(fecha, status)')
        .eq('id', descargaId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useDescargaLineas(descargaId: string | null) {
  return useQuery({
    queryKey: ['descarga-lineas', descargaId],
    enabled: !!descargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('descarga_ruta_lineas')
        .select('id, producto_id, cantidad_esperada, cantidad_real, diferencia, motivo, notas, productos(nombre, codigo)')
        .eq('descarga_id', descargaId!);
      if (error) throw error;
      return data;
    },
  });
}

export interface CuadreVivo {
  esperado: number;
  diferencia: number;
}

/**
 * Cuadre EN VIVO de cada liquidación (no el efectivo_esperado congelado al crearla,
 * que se desactualiza si después se mueven cobros). Usa la MISMA función SQL que el
 * teléfono y el detalle (fn_liquidacion_esperado, vía fn_liquidaciones_esperado):
 *   esperado = cobros efectivo − gastos − dinero devuelto a clientes (F0, H6/H8).
 *
 * Devuelve un Map descarga.id → { esperado, diferencia }.
 */
export function useDescargasLiveCuadre(descargas: Array<{ id: string; efectivo_entregado?: number | string | null }> | undefined) {
  const { empresa } = useAuth();
  const list = descargas ?? [];
  const ids = list.map(d => d.id);

  return useQuery({
    queryKey: ['descargas-live-cuadre', empresa?.id, ids.join(',')],
    enabled: !!empresa?.id && list.length > 0,
    queryFn: async () => {
      const calc = await fetchLiquidacionesEsperado(ids);
      const result = new Map<string, CuadreVivo>();
      for (const d of list) {
        const c = calc.get(d.id);
        if (!c) continue;
        const entregado = Number(d.efectivo_entregado) || 0;
        result.set(d.id, { esperado: c.esperado, diferencia: Math.round((entregado - c.esperado) * 100) / 100 });
      }
      return result;
    },
  });
}

/** Desglose del efectivo esperado de una liquidación o de un periodo (detalle y alta en escritorio). */
export function useLiquidacionEsperado(args: {
  empresaId: string | null | undefined;
  vendedorId: string | null | undefined;
  desde: string | null | undefined;
  hasta: string | null | undefined;
  userId?: string | null;
}) {
  const { empresaId, vendedorId, desde, hasta, userId } = args;
  return useQuery({
    queryKey: ['liquidacion-esperado', empresaId, vendedorId ?? null, desde, hasta, userId ?? null],
    enabled: !!empresaId && !!desde && !!hasta && (!!vendedorId || !!userId),
    queryFn: () => fetchLiquidacionEsperado({ empresaId: empresaId!, vendedorId: vendedorId ?? null, desde: desde!, hasta: hasta!, userId: userId ?? null }),
  });
}
