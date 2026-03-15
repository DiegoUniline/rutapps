import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Producto, Tarifa, TarifaLinea, Marca, Proveedor, Clasificacion, Lista, Unidad, TasaIva, TasaIeps, Almacen, UnidadSat } from '@/types';

const CATALOG_STALE = 5 * 60 * 1000; // 5 min for catalogs

export function useProductos(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['productos', search, statusFilter],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      let q = supabase.from('productos')
        .select('id, codigo, nombre, precio_principal, cantidad, status, imagen_url, tiene_iva, marca_id, marcas(nombre)')
        .order('created_at', { ascending: false });
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
    staleTime: CATALOG_STALE,
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
        const { data, error } = await supabase.from('productos').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('productos').insert({ ...rest, empresa_id: profile!.empresa_id }).select('id').single();
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
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('tarifas')
        .select('id, nombre, tipo, activa, descripcion, vigencia_inicio, vigencia_fin, created_at, tarifa_lineas(id)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (Tarifa & { tarifa_lineas: { id: string }[] })[];
    },
  });
}

export function useTarifa(id?: string) {
  return useQuery({
    queryKey: ['tarifa', id],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('tarifas').select('*, tarifa_lineas(*)').eq('id', id!).single();
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
        const { data, error } = await supabase.from('tarifas').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('tarifas').insert({ ...rest, empresa_id: profile!.empresa_id }).select('id').single();
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
        const { data, error } = await supabase.from('tarifa_lineas').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('tarifa_lineas').insert(rest).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarifa'] });
      qc.invalidateQueries({ queryKey: ['tarifa-lineas-producto'] });
    },
  });
}

export function useDeleteTarifaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tarifa_lineas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarifa'] });
      qc.invalidateQueries({ queryKey: ['tarifa-lineas-producto'] });
    },
  });
}

// Catalogs — all with 5 min staleTime and explicit columns
export function useMarcas() {
  return useQuery({ queryKey: ['marcas'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('marcas').select('id, nombre').order('nombre'); return data as Marca[]; }});
}
export function useProveedores() {
  return useQuery({ queryKey: ['proveedores'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre'); return data as Proveedor[]; }});
}
export function useClasificaciones() {
  return useQuery({ queryKey: ['clasificaciones'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('clasificaciones').select('id, nombre').order('nombre'); return data as Clasificacion[]; }});
}
export function useListas() {
  return useQuery({ queryKey: ['listas'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('listas').select('id, nombre').order('nombre'); return data as Lista[]; }});
}
export function useUnidades() {
  return useQuery({ queryKey: ['unidades'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('unidades').select('id, nombre, abreviatura').order('nombre'); return data as Unidad[]; }});
}
export function useTasasIva() {
  return useQuery({ queryKey: ['tasas_iva'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('tasas_iva').select('id, nombre, porcentaje').order('nombre'); return data as TasaIva[]; }});
}
export function useTasasIeps() {
  return useQuery({ queryKey: ['tasas_ieps'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('tasas_ieps').select('id, nombre, porcentaje').order('nombre'); return data as TasaIeps[]; }});
}
export function useAlmacenes() {
  return useQuery({ queryKey: ['almacenes'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('almacenes').select('id, nombre').order('nombre'); return data as Almacen[]; }});
}
export function useUnidadesSat() {
  return useQuery({ queryKey: ['unidades_sat'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('unidades_sat').select('id, clave, nombre').order('nombre'); return data as UnidadSat[]; }});
}
export function useProductosForSelect() {
  return useQuery({
    queryKey: ['productos-select'],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, codigo, nombre, precio_principal, costo, unidad_venta_id, unidad_compra_id, tiene_iva, tiene_ieps, tasa_iva_id, tasa_ieps_id, iva_pct, ieps_pct, ieps_tipo, costo_incluye_impuestos').eq('status', 'activo').order('nombre');
      return data ?? [];
    },
  });
}
export function useTarifasForSelect() {
  return useQuery({
    queryKey: ['tarifas-select'],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data } = await supabase.from('tarifas').select('id, nombre, tipo, activa').eq('activa', true).order('nombre');
      return data ?? [];
    },
  });
}

export function useTarifaLineasForProducto(productoId?: string, clasificacionId?: string | null) {
  return useQuery({
    queryKey: ['tarifa-lineas-producto', productoId, clasificacionId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const filters: string[] = ['aplica_a.eq.todos'];
      if (productoId) filters.push(`producto_ids.cs.{${productoId}}`);
      if (clasificacionId) filters.push(`clasificacion_ids.cs.{${clasificacionId}}`);

      const { data, error } = await supabase
        .from('tarifa_lineas')
        .select('*, tarifas(id, nombre, activa)')
        .or(filters.join(','));
      if (error) throw error;
      return data as (TarifaLinea & { tarifas: { id: string; nombre: string; activa: boolean } })[];
    },
    enabled: !!productoId,
  });
}
