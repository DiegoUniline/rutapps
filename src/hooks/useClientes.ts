import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Cliente, Zona, Vendedor, Cobrador } from '@/types';

const CATALOG_STALE = 5 * 60 * 1000;

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
  return useMutation({
    mutationFn: async (cliente: Partial<Cliente> & { id?: string }) => {
      const { id, zonas, listas, vendedores, cobradores, tarifas, ...rest } = cliente as any;
      if (id) {
        const { data, error } = await supabase.from('clientes').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const empresaId = await (await import('@/lib/getEmpresaId')).getEmpresaId();
        const { data, error } = await supabase.from('clientes').insert({ ...rest, empresa_id: empresaId }).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['cliente'] });
    },
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete: set status to 'baja' instead of deleting
      const { error } = await supabase.from('clientes').update({ status: 'inactivo' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
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
