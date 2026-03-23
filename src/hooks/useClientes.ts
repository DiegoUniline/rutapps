import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CATALOG_STALE_TIME } from '@/hooks/useBootstrapPrefetch';
import type { Cliente, Zona, Vendedor, Cobrador } from '@/types';

const CATALOG_STALE = CATALOG_STALE_TIME;

export function useClientes(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['clientes', search, statusFilter],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      let q = supabase.from('clientes')
        .select('id, codigo, nombre, telefono, contacto, email, direccion, colonia, vendedor_id, cobrador_id, zona_id, tarifa_id, lista_id, status, orden, credito, limite_credito, dias_credito, dia_visita, gps_lat, gps_lng, frecuencia, foto_url, foto_fachada_url, zonas(nombre), listas(nombre), vendedores(nombre), cobradores(nombre), tarifas(nombre)')
        .order('orden', { ascending: true });
      if (search) q = q.or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data as Cliente[];
    },
  });
}

export function useCliente(id?: string) {
  return useQuery({
    queryKey: ['cliente', id],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes')
        .select('*, zonas(nombre), listas(nombre), vendedores(nombre), cobradores(nombre), tarifas(nombre)')
        .eq('id', id!).single();
      if (error) throw error;
      return data as Cliente;
    },
    enabled: !!id,
  });
}

export function useSaveCliente() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (cliente: Partial<Cliente> & { id?: string }) => {
      const { id, zonas, listas, vendedores, cobradores, tarifas, ...rest } = cliente as any;
      if (id) {
        const { data, error } = await supabase.from('clientes').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        const { data, error } = await supabase.from('clientes').insert({ ...rest, empresa_id: empresa.id }).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onMutate: async (cliente) => {
      if (!cliente.id) return;
      await qc.cancelQueries({ queryKey: ['clientes'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['clientes'] });
      qc.setQueriesData<any[]>({ queryKey: ['clientes'] }, (old) =>
        old?.map(c => c.id === cliente.id ? { ...c, ...cliente } : c)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['cliente'] });
    },
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').update({ status: 'inactivo' }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['clientes'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['clientes'] });
      qc.setQueriesData<any[]>({ queryKey: ['clientes'] }, (old) =>
        old?.filter(c => c.id !== id)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

// Catalog hooks with staleTime
export function useZonas() {
  return useQuery({ queryKey: ['zonas'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('zonas').select('id, nombre').eq('activo', true).order('nombre'); return data as Zona[]; }});
}
export function useVendedores() {
  return useQuery({ queryKey: ['vendedores'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('vendedores').select('id, nombre').order('nombre'); return data as Vendedor[]; }});
}
export function useCobradores() {
  return useQuery({ queryKey: ['cobradores'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('cobradores').select('id, nombre').eq('activo', true).order('nombre'); return data as Cobrador[]; }});
}

// Pedido sugerido per client
export function usePedidoSugerido(clienteId?: string) {
  return useQuery({
    queryKey: ['pedido-sugerido', clienteId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_pedido_sugerido')
        .select('id, cliente_id, producto_id, cantidad, productos(id, codigo, nombre, precio_principal)')
        .eq('cliente_id', clienteId!)
        .order('created_at');
      if (error) throw error;
      return data as { id: string; cliente_id: string; producto_id: string; cantidad: number; productos: { id: string; codigo: string; nombre: string; precio_principal: number } }[];
    },
    enabled: !!clienteId,
  });
}

export function useSavePedidoSugerido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, items }: { clienteId: string; items: { producto_id: string; cantidad: number }[] }) => {
      await supabase.from('cliente_pedido_sugerido').delete().eq('cliente_id', clienteId);
      if (items.length > 0) {
        const rows = items.map(i => ({ cliente_id: clienteId, producto_id: i.producto_id, cantidad: i.cantidad }));
        const { error } = await supabase.from('cliente_pedido_sugerido').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedido-sugerido'] }),
  });
}
