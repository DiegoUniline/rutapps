import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Venta, VentaLinea } from '@/types';

export function useVentas(search?: string, statusFilter?: string, tipoFilter?: string) {
  return useQuery({
    queryKey: ['ventas', search, statusFilter, tipoFilter],
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, subtotal, iva_total, saldo_pendiente, status, tipo, condicion_pago, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre)')
        .order('created_at', { ascending: false });
      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      if (tipoFilter && tipoFilter !== 'todos') q = q.eq('tipo', tipoFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data as Venta[];
    },
  });
}

export function useVenta(id?: string) {
  return useQuery({
    queryKey: ['venta', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('*, clientes(nombre), vendedores(nombre), tarifas(nombre), almacenes(nombre), venta_lineas(*, productos(id, codigo, nombre, precio_principal, tiene_iva, tiene_ieps, tasa_iva_id, tasa_ieps_id, unidad_venta_id), unidades(nombre, abreviatura))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Venta;
    },
    enabled: !!id,
  });
}

export function useSaveVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (venta: Partial<Venta> & { id?: string }) => {
      const { id, clientes, vendedores, tarifas, almacenes, venta_lineas, ...rest } = venta as any;
      if (id) {
        const { data, error } = await supabase.from('ventas').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('ventas').insert({ ...rest, empresa_id: profile!.empresa_id }).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta'] });
    },
  });
}

export function useSaveVentaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linea: Partial<VentaLinea> & { id?: string }) => {
      const { id, productos, unidades, unidad_label, impuestos_label, ...rest } = linea as any;
      if (id) {
        const { data, error } = await supabase.from('venta_lineas').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('venta_lineas').insert(rest).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venta'] }),
  });
}

export function useDeleteVentaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('venta_lineas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venta'] }),
  });
}

export function useDeleteVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  });
}
