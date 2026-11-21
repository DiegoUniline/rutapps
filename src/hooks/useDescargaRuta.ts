import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { fetchLiquidacionEsperado, fetchLiquidacionesEsperado } from '@/lib/liquidacion';
import { fetchLiquidacionDesglose, type EventoLiquidacion } from '@/lib/liquidacionCierre';

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
          .select('id, fecha, fecha_inicio, fecha_fin, status, vendedor_id, user_id, empresa_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, descargo_camion, almacen_destino_id, congelado_at, veces_reabierta, vendedores:profiles!vendedor_id(nombre), cargas(fecha)')
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
        .select('id, fecha, fecha_inicio, fecha_fin, status, vendedor_id, user_id, empresa_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, notas_supervisor, fecha_aprobacion, descargo_camion, almacen_destino_id, esperado_desglose, congelado_at, inventario_aplicado_at, reabierta_at, motivo_reapertura, veces_reabierta, vendedores:profiles!vendedor_id(nombre), cargas(fecha, status)')
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
 * Cuadre de cada liquidación para la lista. Pendientes (y aprobadas antes de F3): EN VIVO
 * con la MISMA función SQL que el teléfono y el detalle (fn_liquidacion_esperado, vía
 * fn_liquidaciones_esperado): esperado = cobros efectivo − gastos − dinero devuelto (F0).
 * Aprobadas con cuadre congelado (F3, D-049): lo guardado al aprobar, sin recalcular.
 *
 * Devuelve un Map descarga.id → { esperado, diferencia }.
 */
export function useDescargasLiveCuadre(descargas: Array<{
  id: string; efectivo_entregado?: number | string | null; status?: string | null;
  congelado_at?: string | null; efectivo_esperado?: number | string | null; diferencia_efectivo?: number | string | null;
}> | undefined) {
  const { empresa } = useAuth();
  const all = descargas ?? [];
  const esCongelada = (d: (typeof all)[number]) => d.status === 'aprobada' && !!d.congelado_at;
  const list = all.filter(d => !esCongelada(d));
  const ids = list.map(d => d.id);
  const congeladas = all.filter(esCongelada);

  return useQuery({
    queryKey: ['descargas-live-cuadre', empresa?.id, ids.join(','), congeladas.map(d => d.id).join(',')],
    enabled: !!empresa?.id && all.length > 0,
    queryFn: async () => {
      const result = new Map<string, CuadreVivo>();
      for (const d of congeladas) {
        result.set(d.id, { esperado: Number(d.efectivo_esperado) || 0, diferencia: Number(d.diferencia_efectivo) || 0 });
      }
      if (ids.length === 0) return result;
      const calc = await fetchLiquidacionesEsperado(ids);
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

/** Desglose EN VIVO de una liquidación (fn_liquidacion_desglose): pendiente, o para comparar con lo congelado. */
export function useLiquidacionDesgloseVivo(descargaId: string | null | undefined) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['liquidacion-desglose', empresa?.id, descargaId ?? null],
    enabled: !!empresa?.id && !!descargaId,
    queryFn: () => fetchLiquidacionDesglose(descargaId!),
  });
}

/** Historial de aprobaciones, rechazos y reaperturas (F3). */
export function useLiquidacionEventos(descargaId: string | null | undefined) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['liquidacion-eventos', empresa?.id, descargaId ?? null],
    enabled: !!empresa?.id && !!descargaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('descarga_ruta_eventos')
        .select('id, accion, motivo, usuario_nombre, created_at')
        .eq('empresa_id', empresa!.id)
        .eq('descarga_id', descargaId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventoLiquidacion[];
    },
  });
}
