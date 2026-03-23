import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { pickColumns, CARGA_COLUMNS } from '@/lib/allowlist';

export function useCargas(search?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cargas', empresa?.id, search, statusFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('cargas')
        .select('id, fecha, status, vendedor_id, almacen_id, almacen_destino_id, notas, vendedores!cargas_vendedor_id_fkey(nombre), almacen_origen:almacen_id(nombre), almacen_destino:almacen_destino_id(nombre), carga_lineas(id, producto_id, cantidad_cargada, cantidad_devuelta, cantidad_vendida, productos(codigo, nombre))')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (search) q = q.ilike('vendedores.nombre', `%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCarga(id?: string) {
  return useQuery({
    queryKey: ['carga', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargas')
        .select('id, fecha, status, vendedor_id, almacen_id, almacen_destino_id, repartidor_id, notas, vendedores!cargas_vendedor_id_fkey(nombre), almacen_origen:almacen_id(nombre), almacen_destino:almacen_destino_id(nombre), carga_lineas(*, productos(id, codigo, nombre, precio_principal, cantidad))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCargaActiva(vendedorId?: string) {
  return useQuery({
    queryKey: ['carga-activa', vendedorId],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargas')
        .select('id, fecha, status, vendedor_id, almacen_id, notas, carga_lineas(*, productos(id, codigo, nombre, precio_principal, cantidad, unidades:unidad_venta_id(abreviatura)))')
        .eq('vendedor_id', vendedorId!)
        .in('status', ['pendiente', 'en_ruta'])
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!vendedorId,
  });
}

export function useSaveCarga() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (carga: Record<string, unknown> & { id?: string }) => {
      const clean = pickColumns(carga, CARGA_COLUMNS);
      delete (clean as any).id;
      if (carga.id) {
        const { data, error } = await supabase.from('cargas').update(clean as any).eq('id', carga.id as string).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        (clean as any).empresa_id = empresa.id;
        const { data, error } = await supabase.from('cargas').insert(clean as any).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
    },
  });
}

export function useSaveCargaLineas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cargaId, lineas }: { cargaId: string; lineas: { producto_id: string; cantidad_cargada: number }[] }) => {
      await supabase.from('carga_lineas').delete().eq('carga_id', cargaId);
      if (lineas.length > 0) {
        const { error } = await supabase.from('carga_lineas').insert(
          lineas.map(l => ({ carga_id: cargaId, producto_id: l.producto_id, cantidad_cargada: l.cantidad_cargada }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
    },
  });
}

export function useUpdateCargaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('cargas').update({ status: status as any }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['cargas'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['cargas'] });
      qc.setQueriesData<any[]>({ queryKey: ['cargas'] }, (old) =>
        old?.map(c => c.id === id ? { ...c, status } : c)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
    },
  });
}

export function useDeleteCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cargas').update({ status: 'cancelada' }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['cargas'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['cargas'] });
      qc.setQueriesData<any[]>({ queryKey: ['cargas'] }, (old) =>
        old?.map(c => c.id === id ? { ...c, status: 'cancelada' } : c)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cargas'] }),
  });
}
