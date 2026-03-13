import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Producto, Tarifa, TarifaLinea, Marca, Proveedor, Clasificacion, Lista, Unidad, TasaIva, TasaIeps, Almacen, UnidadSat } from '@/types';

// Productos
export function useProductos(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['productos', search, statusFilter],
    queryFn: async () => {
      let q = supabase.from('productos').select('*, marcas(nombre)').order('created_at', { ascending: false });
      if (search) q = q.or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data as Producto[];
    },
  });
}

export function useProducto(id?: string) {
  return useQuery({
    queryKey: ['producto', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('productos').select('*, marcas(nombre)').eq('id', id!).single();
      if (error) throw error;
      return data as Producto;
    },
    enabled: !!id,
  });
}

export function useSaveProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (producto: Partial<Producto> & { id?: string }) => {
      const { id, marcas, ...rest } = producto as any;
      if (id) {
        const { data, error } = await supabase.from('productos').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('productos').insert({ ...rest, empresa_id: profile!.empresa_id }).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });
}

export function useDeleteProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('productos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });
}

// Tarifas
export function useTarifas() {
  return useQuery({
    queryKey: ['tarifas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tarifas').select('*, tarifa_lineas(id)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as (Tarifa & { tarifa_lineas: { id: string }[] })[];
    },
  });
}

export function useTarifa(id?: string) {
  return useQuery({
    queryKey: ['tarifa', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tarifas').select('*, tarifa_lineas(*, productos(codigo, nombre), clasificaciones(nombre))').eq('id', id!).single();
      if (error) throw error;
      return data as Tarifa;
    },
    enabled: !!id,
  });
}

export function useSaveTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tarifa: Partial<Tarifa> & { id?: string }) => {
      const { id, tarifa_lineas, ...rest } = tarifa as any;
      if (id) {
        const { data, error } = await supabase.from('tarifas').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('tarifas').insert({ ...rest, empresa_id: profile!.empresa_id }).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarifas'] }),
  });
}

export function useSaveTarifaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linea: Partial<TarifaLinea> & { id?: string }) => {
      const { id, productos, ...rest } = linea as any;
      if (id) {
        const { data, error } = await supabase.from('tarifa_lineas').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('tarifa_lineas').insert(rest).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarifa'] }),
  });
}

export function useDeleteTarifaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tarifa_lineas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarifa'] }),
  });
}

// Catalogos
export function useMarcas() {
  return useQuery({ queryKey: ['marcas'], queryFn: async () => { const { data } = await supabase.from('marcas').select('*').order('nombre'); return data as Marca[]; }});
}
export function useProveedores() {
  return useQuery({ queryKey: ['proveedores'], queryFn: async () => { const { data } = await supabase.from('proveedores').select('*').order('nombre'); return data as Proveedor[]; }});
}
export function useClasificaciones() {
  return useQuery({ queryKey: ['clasificaciones'], queryFn: async () => { const { data } = await supabase.from('clasificaciones').select('*').order('nombre'); return data as Clasificacion[]; }});
}
export function useListas() {
  return useQuery({ queryKey: ['listas'], queryFn: async () => { const { data } = await supabase.from('listas').select('*').order('nombre'); return data as Lista[]; }});
}
export function useUnidades() {
  return useQuery({ queryKey: ['unidades'], queryFn: async () => { const { data } = await supabase.from('unidades').select('*').order('nombre'); return data as Unidad[]; }});
}
export function useTasasIva() {
  return useQuery({ queryKey: ['tasas_iva'], queryFn: async () => { const { data } = await supabase.from('tasas_iva').select('*').order('nombre'); return data as TasaIva[]; }});
}
export function useTasasIeps() {
  return useQuery({ queryKey: ['tasas_ieps'], queryFn: async () => { const { data } = await supabase.from('tasas_ieps').select('*').order('nombre'); return data as TasaIeps[]; }});
}
export function useAlmacenes() {
  return useQuery({ queryKey: ['almacenes'], queryFn: async () => { const { data } = await supabase.from('almacenes').select('*').order('nombre'); return data as Almacen[]; }});
}
export function useUnidadesSat() {
  return useQuery({ queryKey: ['unidades_sat'], queryFn: async () => { const { data } = await supabase.from('unidades_sat').select('*').order('nombre'); return data as UnidadSat[]; }});
}
export function useProductosForSelect() {
  return useQuery({
    queryKey: ['productos-select'],
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, codigo, nombre').order('nombre');
      return data as { id: string; codigo: string; nombre: string }[];
    },
  });
}
export function useTarifasForSelect() {
  return useQuery({
    queryKey: ['tarifas-select'],
    queryFn: async () => {
      const { data } = await supabase.from('tarifas').select('id, nombre, tipo, activa').order('nombre');
      return data as { id: string; nombre: string; tipo: string; activa: boolean }[];
    },
  });
}
