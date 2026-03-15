import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useEntregasList(search?: string, vendedorFilter?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entregas-list', empresa?.id, search, vendedorFilter, statusFilter],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('entregas')
        .select('id, folio, fecha, status, notas, pedido_id, vendedor_id, cliente_id, almacen_id, validado_at, clientes(nombre), vendedores(nombre), ventas!entregas_pedido_id_fkey(folio)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });

      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEntrega(id?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entrega', id],
    enabled: !!id && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('*, clientes(nombre), vendedores(nombre), almacenes(nombre), ventas!entregas_pedido_id_fkey(folio, total, condicion_pago)')
        .eq('id', id!)
        .single();
      if (error) throw error;

      // Fetch lineas
      const { data: lineas, error: lErr } = await supabase
        .from('entrega_lineas')
        .select('*, productos(codigo, nombre, unidad_venta_id), unidades(abreviatura)')
        .eq('entrega_id', id!)
        .order('created_at');
      if (lErr) throw lErr;

      return { ...data, entrega_lineas: lineas ?? [] };
    },
  });
}

export function useEntregaByPedido(pedidoId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entrega-by-pedido', pedidoId],
    enabled: !!pedidoId && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('id, folio, status')
        .eq('pedido_id', pedidoId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCrearEntrega() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, vendedorId, clienteId, almacenId, lineas }: {
      pedidoId?: string;
      vendedorId?: string;
      clienteId?: string;
      almacenId?: string;
      lineas: { producto_id: string; unidad_id?: string; cantidad_pedida: number }[];
    }) => {
      const { data: entrega, error } = await supabase
        .from('entregas')
        .insert({
          empresa_id: empresa!.id,
          pedido_id: pedidoId ?? null,
          vendedor_id: vendedorId ?? null,
          cliente_id: clienteId ?? null,
          almacen_id: almacenId ?? null,
          status: 'borrador',
        } as any)
        .select('id, folio')
        .single();
      if (error) throw error;

      if (lineas.length > 0) {
        const { error: lErr } = await supabase.from('entrega_lineas').insert(
          lineas.map(l => ({
            entrega_id: entrega.id,
            producto_id: l.producto_id,
            unidad_id: l.unidad_id ?? null,
            cantidad_pedida: l.cantidad_pedida,
            cantidad_entregada: l.cantidad_pedida,
            hecho: false,
          }))
        );
        if (lErr) throw lErr;
      }

      return entrega;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
    },
  });
}

export function useValidarEntrega() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId, lineas }: {
      entregaId: string;
      lineas: { id: string; producto_id: string; cantidad_entregada: number; hecho: boolean }[];
    }) => {
      // Fetch entrega to get vendedor_id
      const { data: entrega } = await supabase
        .from('entregas')
        .select('vendedor_id, empresa_id')
        .eq('id', entregaId)
        .single();
      if (!entrega) throw new Error('Entrega no encontrada');

      // Update all lineas
      for (const l of lineas) {
        await supabase.from('entrega_lineas').update({
          cantidad_entregada: l.cantidad_entregada,
          hecho: l.hecho,
        }).eq('id', l.id);
      }

      // Insert into stock_camion for delivered items
      const today = new Date().toISOString().slice(0, 10);
      for (const l of lineas) {
        if (l.cantidad_entregada > 0 && entrega.vendedor_id) {
          await supabase.from('stock_camion').insert({
            empresa_id: entrega.empresa_id,
            vendedor_id: entrega.vendedor_id,
            producto_id: l.producto_id,
            cantidad_inicial: l.cantidad_entregada,
            cantidad_actual: l.cantidad_entregada,
            fecha: today,
          } as any);
        }
      }

      // Update entrega status
      const { error } = await supabase.from('entregas').update({
        status: 'hecho',
        validado_por: user?.id,
        validado_at: new Date().toISOString(),
      } as any).eq('id', entregaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['stock-camion'] });
    },
  });
}

export function useCancelarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entregaId: string) => {
      // TODO: if already validated, restore stock
      const { error } = await supabase.from('entregas').update({ status: 'cancelado' } as any).eq('id', entregaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
    },
  });
}

export function useVendedoresList() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
}
