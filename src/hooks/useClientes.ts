import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Cliente, Zona, Vendedor, Cobrador } from '@/types';

const CATALOG_STALE = 5 * 60 * 1000;

export function useClientes(search?: string, statusFilter?: string, page = 0, pageSize = 25) {
  return useQuery({
    queryKey: ['clientes', search, statusFilter, page],
    queryFn: async () => {
      const from = page * pageSize;
      let q = supabase.from('clientes')
        .select('id, codigo, nombre, telefono, direccion, colonia, vendedor_id, zona_id, status, orden, credito, limite_credito, dia_visita, gps_lat, gps_lng, zonas(nombre), vendedores(nombre), tarifas(nombre)', { count: 'exact' })
        .order('orden', { ascending: true })
        .range(from, from + pageSize - 1);
      if (search) q = q.or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data as Cliente[], count: count ?? 0, page, pageSize };
    },
    staleTime: CATALOG_STALE,
  });
}

export function useCliente(id?: string) {
  return useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes')
        .select('id, codigo, nombre, rfc, telefono, email, contacto, direccion, colonia, notas, gps_lat, gps_lng, vendedor_id, cobrador_id, zona_id, tarifa_id, lista_id, frecuencia, credito, limite_credito, dias_credito, dia_visita, orden, status, fecha_alta, foto_url, foto_fachada_url, zonas(nombre), listas(nombre), vendedores(nombre), cobradores(nombre), tarifas(nombre)')
        .eq('id', id!).single();
      if (error) throw error;
      return data as Cliente;
    },
    enabled: !!id,
    staleTime: CATALOG_STALE,
  });
}

export function useSaveCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cliente: Partial<Cliente> & { id?: string }) => {
      const { id, zonas, listas, vendedores, cobradores, tarifas, ...rest } = cliente as any;
      if (id) {
        const { data, error } = await supabase.from('clientes').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('clientes').insert({ ...rest, empresa_id: profile!.empresa_id }).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

// Catalog hooks with staleTime
export function useZonas() {
  return useQuery({ queryKey: ['zonas'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('zonas').select('id, nombre').order('nombre'); return data as Zona[]; }});
}
export function useVendedores() {
  return useQuery({ queryKey: ['vendedores'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('vendedores').select('id, nombre').order('nombre'); return data as Vendedor[]; }});
}
export function useCobradores() {
  return useQuery({ queryKey: ['cobradores'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('cobradores').select('id, nombre').order('nombre'); return data as Cobrador[]; }});
}

// Pedido sugerido per client
export function usePedidoSugerido(clienteId?: string) {
  return useQuery({
    queryKey: ['pedido-sugerido', clienteId],
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
    staleTime: CATALOG_STALE,
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
