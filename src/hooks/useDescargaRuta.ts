import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { fetchAllPages } from '@/lib/supabasePaginate';

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

export function useDescargaCalculos(cargaId: string | null) {
  const { empresa } = useAuth();

  const { data: cargaInfo } = useQuery({
    queryKey: ['descarga-carga-info', cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargas')
        .select('id, fecha, status, vendedor_id, almacen_id')
        .eq('id', cargaId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: cargaLineas } = useQuery({
    queryKey: ['descarga-carga-lineas', cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carga_lineas')
        .select('id, producto_id, cantidad_cargada, cantidad_vendida, cantidad_devuelta, productos(nombre, codigo)')
        .eq('carga_id', cargaId!);
      if (error) throw error;
      return data;
    },
  });

  // Batch: get both ventas contado and gastos in parallel via single query pattern
  const { data: financials } = useQuery({
    queryKey: ['descarga-financials', cargaInfo?.vendedor_id, cargaInfo?.fecha],
    enabled: !!cargaInfo?.vendedor_id && !!cargaInfo?.fecha,
    queryFn: async () => {
      const [ventasRes, gastosRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('total')
          .eq('vendedor_id', cargaInfo!.vendedor_id!)
          .eq('fecha', cargaInfo!.fecha)
          .eq('condicion_pago', 'contado')
          .neq('status', 'cancelado'),
        supabase
          .from('gastos')
          .select('monto')
          .eq('vendedor_id', cargaInfo!.vendedor_id!)
          .eq('fecha', cargaInfo!.fecha),
      ]);
      const ventasContado = (ventasRes.data || []).reduce((sum, v) => sum + (Number(v.total) || 0), 0);
      const gastosTotal = (gastosRes.data || []).reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
      return { ventasContado, gastosTotal };
    },
  });

  const lineas: DescargaLinea[] = (cargaLineas || []).map((cl) => {
    const prod = cl.productos as { nombre?: string; codigo?: string } | null;
    const esperada = Number(cl.cantidad_cargada) - Number(cl.cantidad_vendida) - Number(cl.cantidad_devuelta);
    return {
      producto_id: cl.producto_id,
      producto_nombre: prod?.nombre ?? '',
      producto_codigo: prod?.codigo ?? '',
      cantidad_cargada: Number(cl.cantidad_cargada),
      cantidad_vendida: Number(cl.cantidad_vendida),
      cantidad_devuelta: Number(cl.cantidad_devuelta),
      cantidad_esperada: Math.max(0, esperada),
      cantidad_real: Math.max(0, esperada),
      diferencia: 0,
      motivo: null,
      notas: null,
    };
  });

  const ventasContado = financials?.ventasContado ?? 0;
  const gastosTotal = financials?.gastosTotal ?? 0;
  const efectivoEsperado = ventasContado - gastosTotal;

  return { lineas, efectivoEsperado, cargaInfo, ventasContado, gastosTotal };
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
      const { data, error } = await supabase
        .from('descarga_ruta')
        .select('id, fecha, fecha_inicio, fecha_fin, status, vendedor_id, user_id, empresa_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, descargo_camion, almacen_destino_id, vendedores:profiles!vendedor_id(nombre), cargas(fecha)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
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
 * Cálculo EN VIVO del cuadre de cada liquidación, desde los cobros reales de
 * hoy — no del valor congelado (efectivo_esperado) que se guardó al crearla.
 * El congelado se desactualiza si después se borran/mueven cobros, y hace que
 * la lista muestre sobrantes/faltantes fantasma. Aquí replicamos exactamente
 * la fórmula del detalle:  esperado = cobros efectivo − gastos.
 *
 * - Cobros: por el user_id del PERFIL del vendedor (quien cobró en la ruta); si
 *   la descarga no tiene vendedor, se cae a descarga.user_id como respaldo.
 * - Gastos: por vendedor_id, en el mismo rango de fechas de la descarga.
 *
 * Devuelve un Map descarga.id → { esperado, diferencia }.
 */
export function useDescargasLiveCuadre(descargas: any[] | undefined) {
  const { empresa } = useAuth();
  const list = descargas ?? [];
  const fechas = list
    .flatMap((d: any) => [d.fecha_inicio || d.fecha, d.fecha_fin || d.fecha])
    .filter(Boolean) as string[];
  const minFecha = fechas.length ? fechas.reduce((a, b) => (a < b ? a : b)) : null;
  const maxFecha = fechas.length ? fechas.reduce((a, b) => (a > b ? a : b)) : null;
  const ids = list.map((d: any) => d.id).join(',');

  return useQuery({
    queryKey: ['descargas-live-cuadre', empresa?.id, minFecha, maxFecha, ids],
    enabled: !!empresa?.id && list.length > 0 && !!minFecha && !!maxFecha,
    queryFn: async () => {
      const [cobros, gastos, profsRes] = await Promise.all([
        fetchAllPages((from, to) => supabase.from('cobros')
          .select('user_id, monto, fecha')
          .eq('empresa_id', empresa!.id)
          .eq('metodo_pago', 'efectivo')
          .neq('status', 'cancelado')
          .gte('fecha', minFecha!).lte('fecha', maxFecha!)
          .range(from, to)),
        fetchAllPages((from, to) => supabase.from('gastos')
          .select('vendedor_id, monto, fecha')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', minFecha!).lte('fecha', maxFecha!)
          .range(from, to)),
        supabase.from('profiles').select('id, user_id').eq('empresa_id', empresa!.id),
      ]);
      const profMap = new Map<string, string>();
      ((profsRes as any).data ?? []).forEach((p: any) => { if (p.user_id) profMap.set(p.id, p.user_id); });

      const result = new Map<string, CuadreVivo>();
      for (const d of list) {
        const fIni = d.fecha_inicio || d.fecha;
        const fFin = d.fecha_fin || d.fecha;
        const uid = (d.vendedor_id ? profMap.get(d.vendedor_id) : null) ?? d.user_id ?? null;
        const cob = uid
          ? cobros.filter((c: any) => c.user_id === uid && c.fecha >= fIni && c.fecha <= fFin)
              .reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0)
          : 0;
        const gas = d.vendedor_id
          ? gastos.filter((g: any) => g.vendedor_id === d.vendedor_id && g.fecha >= fIni && g.fecha <= fFin)
              .reduce((s: number, g: any) => s + (Number(g.monto) || 0), 0)
          : 0;
        const esperado = Math.round((cob - gas) * 100) / 100;
        const entregado = Number(d.efectivo_entregado) || 0;
        result.set(d.id, { esperado, diferencia: Math.round((entregado - esperado) * 100) / 100 });
      }
      return result;
    },
  });
}
