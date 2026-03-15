import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Venta, VentaLinea } from '@/types';

export function useVentas(search?: string, statusFilter?: string, tipoFilter?: string, page = 0, pageSize = 25) {
  return useQuery({
    queryKey: ['ventas', search, statusFilter, tipoFilter, page],
    queryFn: async () => {
      const from = page * pageSize;
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, status, tipo, condicion_pago, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      if (tipoFilter && tipoFilter !== 'todos') q = q.eq('tipo', tipoFilter as any);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data as Venta[], count: count ?? 0, page, pageSize };
    },
  });
}

export function useVenta(id?: string) {
  return useQuery({
    queryKey: ['venta', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, fecha_entrega, total, subtotal, iva_total, ieps_total, descuento_total, saldo_pendiente, status, tipo, condicion_pago, notas, entrega_inmediata, vendedor_id, cliente_id, tarifa_id, almacen_id, pedido_origen_id, clientes(nombre), vendedores(nombre), tarifas(nombre), almacenes(nombre), venta_lineas(id, producto_id, cantidad, precio_unitario, subtotal, iva_pct, iva_monto, ieps_pct, ieps_monto, descuento_pct, total, descripcion, notas, unidad_id, productos(id, codigo, nombre, precio_principal, tiene_iva, tiene_ieps, tasa_iva_id, tasa_ieps_id, unidad_venta_id), unidades(nombre, abreviatura))')
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
      const { id, productos, unidades, ...rest } = linea as any;
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
