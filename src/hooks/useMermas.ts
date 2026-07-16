import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { toast } from 'sonner';

export interface MermaMotivo { id: string; nombre: string; activo: boolean; }
export interface MermaLinea {
  producto_id: string;
  cantidad: number;
  costo_unitario: number;
  precio_venta_unitario: number;
}

export function useMermaMotivos() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['merma_motivos', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merma_motivos')
        .select('id, nombre, activo')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as MermaMotivo[];
    },
  });
}

export function useUpsertMermaMotivo() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { id?: string; nombre: string; activo?: boolean }) => {
      if (m.id) {
        const { error } = await supabase.from('merma_motivos').update({ nombre: m.nombre, activo: m.activo ?? true }).eq('id', m.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('merma_motivos').insert({ empresa_id: empresa!.id, nombre: m.nombre, activo: true });
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['merma_motivos'] }),
  });
}

export function useDeleteMermaMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('merma_motivos').update({ activo: false }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['merma_motivos'] }),
  });
}

export function useMermas(filters?: { desde?: string; hasta?: string }) {
  const { empresa } = useAuth();
  useRealtimeInvalidate({
    table: 'mermas',
    empresaId: empresa?.id,
    queryKeys: [['mermas']],
  });
  return useQuery({
    queryKey: ['mermas', empresa?.id, filters?.desde, filters?.hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/supabasePaginate');
      return await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('mermas')
          .select('id, folio, fecha, almacen_origen_id, motivo_id, observaciones, total_costo, total_venta, cancelada, creado_por, created_at, almacenes:almacen_origen_id(nombre), merma_motivos:motivo_id(nombre), profiles:creado_por(nombre)')
          .eq('empresa_id', empresa!.id)
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false });
        if (filters?.desde) q = q.gte('fecha', filters.desde);
        if (filters?.hasta) q = q.lte('fecha', filters.hasta);
        return q.range(from, to);
      });
    },
  });
}


export function useMerma(id?: string) {
  return useQuery({
    queryKey: ['merma', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mermas')
        .select('*, almacenes:almacen_origen_id(nombre), merma_motivos:motivo_id(nombre), profiles:creado_por(nombre), merma_lineas(*, productos:producto_id(nombre, codigo, unidad_granel, es_granel))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useRegistrarMerma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      almacen_origen_id: string;
      ruta_id?: string | null;
      motivo_id: string;
      observaciones?: string;
      lineas: MermaLinea[];
      devolucion_id?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('registrar_merma', {
        _almacen_origen_id: params.almacen_origen_id,
        _ruta_id: params.ruta_id ?? null,
        _motivo_id: params.motivo_id,
        _observaciones: params.observaciones ?? null,
        _lineas: params.lineas as any,
        _devolucion_id: params.devolucion_id ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => toast.success('Merma registrada'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mermas'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
    },
  });
}

export function useCancelarMerma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancelar_merma', { _merma_id: id });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Merma cancelada'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mermas'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
    },
  });
}
