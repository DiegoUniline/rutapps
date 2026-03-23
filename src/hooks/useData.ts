import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CATALOG_STALE_TIME } from '@/hooks/useBootstrapPrefetch';
import type { Producto, Tarifa, TarifaLinea, Marca, Proveedor, Clasificacion, Lista, Unidad, TasaIva, TasaIeps, Almacen, UnidadSat } from '@/types';

const CATALOG_STALE = CATALOG_STALE_TIME;

export function useProductos(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['productos', search, statusFilter],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      let q = supabase.from('productos')
        .select('id, codigo, nombre, precio_principal, costo, cantidad, status, imagen_url, tiene_iva, iva_pct, tiene_ieps, ieps_pct, min, marca_id, marcas(nombre), clasificacion_id, clasificaciones(nombre), proveedor_id, proveedores(nombre), unidad_venta_id, unidades_venta:unidad_venta_id(abreviatura), unidad_compra_id, unidades_compra:unidad_compra_id(abreviatura), factor_conversion, calculo_costo, lista_id, listas(nombre)')
        .order('nombre', { ascending: true });
      if (search) q = q.or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
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
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (producto: Partial<Producto> & { id?: string }) => {
      const { id, marcas, ...rest } = producto as any;
      if (id) {
        const { data, error } = await supabase.from('productos').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        const { data, error } = await supabase.from('productos').insert({ ...rest, empresa_id: empresa.id }).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onMutate: async (producto) => {
      if (!producto.id) return;
      await qc.cancelQueries({ queryKey: ['productos'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['productos'] });
      qc.setQueriesData<any[]>({ queryKey: ['productos'] }, (old) =>
        old?.map(p => p.id === producto.id ? { ...p, ...producto } : p)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });
}

export function useDeleteProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete: set status to 'baja' instead of deleting
      const { error } = await supabase.from('productos').update({ status: 'inactivo' }).eq('id', id);
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
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (tarifa: Partial<Tarifa> & { id?: string }) => {
      const { id, tarifa_lineas, ...rest } = tarifa as any;
      if (id) {
        const { data, error } = await supabase.from('tarifas').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        const { data, error } = await supabase.from('tarifas').insert({ ...rest, empresa_id: empresa.id }).select('id').single();
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
  return useQuery({ queryKey: ['marcas'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('marcas').select('id, nombre').eq('activo', true).order('nombre'); return data as Marca[]; }});
}
export function useProveedores() {
  return useQuery({ queryKey: ['proveedores'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('proveedores').select('id, nombre, dias_credito, condicion_pago').neq('status', 'baja').order('nombre'); return data as (Proveedor & { dias_credito?: number; condicion_pago?: string })[]; }});
}
export function useClasificaciones() {
  return useQuery({ queryKey: ['clasificaciones'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('activo', true).order('nombre'); return data as Clasificacion[]; }});
}
export function useListas() {
  return useQuery({ queryKey: ['listas'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('listas').select('id, nombre').eq('activo', true).order('nombre'); return data as Lista[]; }});
}
export function useUnidades() {
  return useQuery({ queryKey: ['unidades'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('unidades').select('id, nombre, abreviatura').eq('activo', true).order('nombre'); return data as Unidad[]; }});
}
export function useTasasIva() {
  return useQuery({ queryKey: ['tasas_iva'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('tasas_iva').select('id, nombre, porcentaje').order('nombre'); return data as TasaIva[]; }});
}
export function useTasasIeps() {
  return useQuery({ queryKey: ['tasas_ieps'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('tasas_ieps').select('id, nombre, porcentaje').order('nombre'); return data as TasaIeps[]; }});
}
export function useAlmacenes() {
  return useQuery({ queryKey: ['almacenes'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('almacenes').select('id, nombre').eq('activo', true).order('nombre'); return data as Almacen[]; }});
}
export function useUnidadesSat() {
  return useQuery({ queryKey: ['unidades_sat'], staleTime: CATALOG_STALE, queryFn: async () => { const { data } = await supabase.from('unidades_sat').select('id, clave, nombre').order('nombre'); return data as UnidadSat[]; }});
}
export function useProductosForSelect() {
  return useQuery({
    queryKey: ['productos-select'],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data } = await supabase.from('productos')
        .select('id, codigo, nombre, precio_principal, costo, cantidad, clasificacion_id, unidad_venta_id, unidad_compra_id, factor_conversion, tiene_iva, tiene_ieps, tasa_iva_id, tasa_ieps_id, iva_pct, ieps_pct, ieps_tipo, costo_incluye_impuestos, unidades_venta:unidades!productos_unidad_venta_id_fkey(nombre, abreviatura), unidades_compra:unidades!productos_unidad_compra_id_fkey(nombre, abreviatura)')
        .eq('status', 'activo').order('nombre');
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
        .select('*, tarifas(id, nombre, activa), lista_precios(id, nombre, es_principal)')
        .or(filters.join(','))
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as (TarifaLinea & { tarifas: { id: string; nombre: string; activa: boolean } })[];
    },
    enabled: !!productoId,
  });
}

/* ── Producto Proveedores ── */
export function useProductoProveedores(productoId?: string) {
  return useQuery({
    queryKey: ['producto_proveedores', productoId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producto_proveedores')
        .select('id, producto_id, proveedor_id, es_principal, precio_compra, tiempo_entrega_dias, notas, proveedores(nombre)')
        .eq('producto_id', productoId!)
        .order('es_principal', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!productoId,
  });
}

export function useSaveProductoProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id?: string; producto_id: string; proveedor_id: string; es_principal?: boolean; precio_compra?: number; tiempo_entrega_dias?: number; notas?: string }) => {
      // If setting as principal, unset others first
      if (row.es_principal) {
        await supabase.from('producto_proveedores').update({ es_principal: false }).eq('producto_id', row.producto_id);
      }
      if (row.id) {
        const { error } = await supabase.from('producto_proveedores').update(row).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('producto_proveedores').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['producto_proveedores', v.producto_id] }); },
  });
}

export function useDeleteProductoProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, producto_id }: { id: string; producto_id: string }) => {
      const { error } = await supabase.from('producto_proveedores').delete().eq('id', id);
      if (error) throw error;
      return producto_id;
    },
    onSuccess: (productoId) => { qc.invalidateQueries({ queryKey: ['producto_proveedores', productoId] }); },
  });
}

/* ── Lista de Precios (within tarifa) ── */
export interface ListaPrecio {
  id: string;
  tarifa_id: string;
  empresa_id: string;
  nombre: string;
  es_principal: boolean;
  activa: boolean;
  created_at: string;
  share_token?: string;
  share_activo?: boolean;
}

export interface ListaPrecioLinea {
  id: string;
  lista_precio_id: string;
  producto_id: string;
  precio: number;
  created_at: string;
  productos?: { codigo: string; nombre: string };
}

export function useAllListasPrecios() {
  return useQuery({
    queryKey: ['lista_precios_all'],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('lista_precios')
        .select('id, tarifa_id, empresa_id, nombre, es_principal, activa, created_at, share_token, share_activo')
        .order('nombre');
      if (error) throw error;
      return data as ListaPrecio[];
    },
  });
}

export function useListasPrecioByTarifa(tarifaId?: string) {
  return useQuery({
    queryKey: ['lista_precios', tarifaId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('lista_precios')
        .select('id, tarifa_id, empresa_id, nombre, es_principal, activa, created_at')
        .eq('tarifa_id', tarifaId!)
        .order('es_principal', { ascending: false })
        .order('nombre');
      if (error) throw error;
      return data as ListaPrecio[];
    },
    enabled: !!tarifaId,
  });
}

export function useListasPrecioForSelect(tarifaId?: string) {
  return useQuery({
    queryKey: ['lista_precios_select', tarifaId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('lista_precios')
        .select('id, nombre, es_principal')
        .eq('tarifa_id', tarifaId!)
        .eq('activa', true)
        .order('es_principal', { ascending: false })
        .order('nombre');
      if (error) throw error;
      return data as { id: string; nombre: string; es_principal: boolean }[];
    },
    enabled: !!tarifaId,
  });
}

export function useSaveListaPrecio() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (lp: { id?: string; tarifa_id?: string; nombre: string; es_principal?: boolean; activa?: boolean }) => {
      const { id, ...rest } = lp;
      if (id) {
        if (rest.es_principal && rest.tarifa_id) {
          await supabase.from('lista_precios').update({ es_principal: false }).eq('tarifa_id', rest.tarifa_id);
        }
        const { data, error } = await supabase.from('lista_precios').update(rest).eq('id', id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        
        let tarifaId = rest.tarifa_id;
        if (!tarifaId) {
          const { data: tarifa, error: tErr } = await supabase.from('tarifas')
            .insert({ empresa_id: empresa.id, nombre: rest.nombre, tipo: 'general', activa: true })
            .select('id').single();
          if (tErr) throw tErr;
          tarifaId = tarifa.id;
        }

        if (rest.es_principal) {
          await supabase.from('lista_precios').update({ es_principal: false }).eq('tarifa_id', tarifaId);
        }
        const { data, error } = await supabase.from('lista_precios')
          .insert({ ...rest, tarifa_id: tarifaId, empresa_id: empresa.id })
          .select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lista_precios'] });
      qc.invalidateQueries({ queryKey: ['lista_precios_select'] });
      qc.invalidateQueries({ queryKey: ['lista_precios_all'] });
    },
  });
}

export function useDeleteListaPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lista_precios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lista_precios'] });
      qc.invalidateQueries({ queryKey: ['lista_precios_select'] });
    },
  });
}

export function useListaPrecioLineas(listaPrecioId?: string) {
  return useQuery({
    queryKey: ['lista_precios_lineas', listaPrecioId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('lista_precios_lineas')
        .select('id, lista_precio_id, producto_id, precio, created_at, productos(codigo, nombre)')
        .eq('lista_precio_id', listaPrecioId!)
        .order('created_at');
      if (error) throw error;
      return data as ListaPrecioLinea[];
    },
    enabled: !!listaPrecioId,
  });
}

export function useListaPrecioLineasForProducto(productoId?: string) {
  return useQuery({
    queryKey: ['lista_precios_lineas_producto', productoId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('lista_precios_lineas')
        .select('id, lista_precio_id, producto_id, precio, lista_precios(id, nombre, tarifa_id, es_principal, tarifas(id, nombre))')
        .eq('producto_id', productoId!);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!productoId,
  });
}

export function useSaveListaPrecioLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id?: string; lista_precio_id: string; producto_id: string; precio: number }) => {
      const { id, ...rest } = row;
      if (id) {
        const { error } = await supabase.from('lista_precios_lineas').update({ precio: rest.precio }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lista_precios_lineas').upsert(rest, { onConflict: 'lista_precio_id,producto_id' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lista_precios_lineas'] });
      qc.invalidateQueries({ queryKey: ['lista_precios_lineas_producto'] });
    },
  });
}

export function useDeleteListaPrecioLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lista_precios_lineas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lista_precios_lineas'] });
      qc.invalidateQueries({ queryKey: ['lista_precios_lineas_producto'] });
    },
  });
}
