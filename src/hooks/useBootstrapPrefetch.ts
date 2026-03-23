import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Bootstrap prefetch: on login, pre-warm React Query cache with all base catalogs
 * in parallel. These are the most-used datasets across the app.
 * staleTime is 15 min so no view re-fetches them unless invalidated.
 */
export const CATALOG_STALE_TIME = 15 * 60 * 1000; // 15 min

export function useBootstrapPrefetch() {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!empresa?.id) return;

    const eid = empresa.id;

    // Fire all prefetches in parallel — they populate the React Query cache
    // so that useProductos(), useClientes(), etc. find data already there.
    void Promise.all([
      qc.prefetchQuery({
        queryKey: ['productos-select'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('productos')
            .select('id, codigo, nombre, precio_principal, costo, cantidad, clasificacion_id, unidad_venta_id, unidad_compra_id, factor_conversion, tiene_iva, tiene_ieps, tasa_iva_id, tasa_ieps_id, iva_pct, ieps_pct, ieps_tipo, costo_incluye_impuestos, unidades_venta:unidades!productos_unidad_venta_id_fkey(nombre, abreviatura), unidades_compra:unidades!productos_unidad_compra_id_fkey(nombre, abreviatura)')
            .eq('status', 'activo').order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['clientes', '', 'activo'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('clientes')
            .select('id, codigo, nombre, telefono, contacto, email, direccion, colonia, vendedor_id, cobrador_id, zona_id, tarifa_id, lista_id, status, orden, credito, limite_credito, dias_credito, dia_visita, gps_lat, gps_lng, frecuencia, foto_url, foto_fachada_url, zonas(nombre), listas(nombre), vendedores(nombre), cobradores(nombre), tarifas(nombre)')
            .eq('status', 'activo')
            .order('orden', { ascending: true });
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['vendedores'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('vendedores').select('id, nombre').order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['almacenes'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('almacenes').select('id, nombre').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['zonas'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('zonas').select('id, nombre').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['marcas'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('marcas').select('id, nombre').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['clasificaciones'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['cobradores'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('cobradores').select('id, nombre').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['unidades'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('unidades').select('id, nombre, abreviatura').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['listas'],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('listas').select('id, nombre').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
    ]);
  }, [empresa?.id, qc]);
}
