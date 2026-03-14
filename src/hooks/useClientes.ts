import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Cliente, Zona, Vendedor, Cobrador } from '@/types';

export function useClientes(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['clientes', search, statusFilter],
    queryFn: async () => {
      let q = supabase.from('clientes')
        .select('*, zonas(nombre), listas(nombre), vendedores(nombre), cobradores(nombre), tarifas(nombre)')
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
  return useMutation({
    mutationFn: async (cliente: Partial<Cliente> & { id?: string }) => {
      const { id, zonas, listas, vendedores, cobradores, tarifas, ...rest } = cliente as any;
      if (id) {
        const { data, error } = await supabase.from('clientes').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('clientes').insert({ ...rest, empresa_id: profile!.empresa_id }).select().single();
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

// Catalog hooks
export function useZonas() {
  return useQuery({ queryKey: ['zonas'], queryFn: async () => { const { data } = await supabase.from('zonas').select('*').order('nombre'); return data as Zona[]; }});
}
export function useVendedores() {
  return useQuery({ queryKey: ['vendedores'], queryFn: async () => { const { data } = await supabase.from('vendedores').select('*').order('nombre'); return data as Vendedor[]; }});
}
export function useCobradores() {
  return useQuery({ queryKey: ['cobradores'], queryFn: async () => { const { data } = await supabase.from('cobradores').select('*').order('nombre'); return data as Cobrador[]; }});
}

// Pedido sugerido per client
export function usePedidoSugerido(clienteId?: string) {
  return useQuery({
    queryKey: ['pedido-sugerido', clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_pedido_sugerido')
        .select('*, productos(id, codigo, nombre, precio_principal)')
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
      // Delete existing and re-insert
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
