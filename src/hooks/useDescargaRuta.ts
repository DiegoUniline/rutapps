import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

  const lineas: DescargaLinea[] = (cargaLineas || []).map((cl: Record<string, unknown>) => {
    const esperada = Number(cl.cantidad_cargada) - Number(cl.cantidad_vendida) - Number(cl.cantidad_devuelta);
    return {
      producto_id: cl.producto_id,
      producto_nombre: cl.productos?.nombre ?? '',
      producto_codigo: cl.productos?.codigo ?? '',
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
  return useQuery({
    queryKey: ['descargas-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('descarga_ruta')
        .select('id, fecha, status, vendedor_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, vendedores(nombre), cargas(fecha)')
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
        .select('id, fecha, status, vendedor_id, carga_id, efectivo_esperado, efectivo_entregado, diferencia_efectivo, notas, notas_supervisor, fecha_aprobacion, vendedores(nombre), cargas(fecha, status)')
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
