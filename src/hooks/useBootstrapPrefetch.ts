import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { enrichClientes, enrichProductos } from '@/lib/catalogEnrich';

/**
 * Bootstrap prefetch: on login, pre-warm React Query cache with all base catalogs
 * in parallel. These are the most-used datasets across the app.
 * staleTime is 15 min so no view re-fetches them unless invalidated.
 */
export const CATALOG_STALE_TIME = 15 * 60 * 1000; // 15 min

export function useBootstrapPrefetch() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!empresa?.id) return;
    // AHORRO DE DATOS MÓVILES: en /ruta ninguna pantalla usa estas queryKeys
    // (todas leen de IndexedDB), así que precargarlas era bajar el catálogo
    // completo de productos y clientes en CADA apertura de la app.
    if (pathname.startsWith('/ruta')) return;

    const eid = empresa.id;

    // Catálogos LIGEROS (tablas chicas): se precargan de inmediato. Poblan el
    // caché de React Query para que useVendedores(), useAlmacenes(), etc.
    // encuentren los datos ya listos.
    //
    // IMPORTANTE: los catálogos ligeros deben resolverse ANTES que los pesados
    // (productos/clientes), porque estos últimos ya no piden los joins de
    // nombres (zonas/listas/vendedores/cobradores/tarifas/unidades) desde
    // Postgres — los resuelven en el cliente con estos catálogos. Ver
    // src/lib/catalogEnrich.ts. Esto quita LEFT JOIN LATERAL x5/x6 en la BD
    // (slow queries #4 y #8) sin cambiar la forma de las filas.
    const lightCatalogsReady = Promise.all([
      qc.prefetchQuery({
        queryKey: ['vendedores', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', eid).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['almacenes', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', eid).eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['zonas', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('zonas').select('id, nombre').eq('empresa_id', eid).eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['marcas', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('marcas').select('id, nombre').eq('empresa_id', eid).eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['clasificaciones', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', eid).eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['cobradores', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', eid).eq('estado', 'activo').order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['unidades', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('unidades').select('id, nombre, abreviatura').eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      qc.prefetchQuery({
        queryKey: ['listas', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('listas').select('id, nombre').eq('empresa_id', eid).eq('activo', true).order('nombre');
          return data ?? [];
        },
      }),
      // Tarifas: se piden aquí (además de useTarifasForSelect) porque
      // enrichClientes las lee para resolver `cliente.tarifas.nombre`.
      qc.prefetchQuery({
        queryKey: ['tarifas-select', eid],
        staleTime: CATALOG_STALE_TIME,
        queryFn: async () => {
          const { data } = await supabase.from('tarifas').select('id, nombre, tipo, activa, moneda').eq('empresa_id', eid).eq('activa', true).order('nombre');
          return data ?? [];
        },
      }),
    ]);

    // Catálogos PESADOS (productos y clientes): pueden ser miles de filas. Se
    // DIFIEREN a que el navegador esté ocioso, para NO competir con las
    // consultas de la primera pantalla → que aparezca antes lo que el usuario ve.
    // Si alguna vista los necesita antes, React Query los pide igual (misma
    // queryKey) — no se pierde nada, solo se evita la ráfaga en el arranque.
    const runHeavyPrefetch = () => {
      void Promise.all([
        qc.prefetchQuery({
          queryKey: ['productos-select', eid],
          staleTime: CATALOG_STALE_TIME,
          queryFn: async () => {
            // Esperar a los catálogos ligeros para poder enriquecer con nombres.
            await lightCatalogsReady;
            const rows = await fetchAllPages<any>((from, to) =>
              supabase.from('productos')
                .select('id, codigo, nombre, precio_principal, costo, cantidad, clasificacion_id, lista_id, marca_id, unidad_venta_id, unidad_compra_id, factor_conversion, tiene_iva, tiene_ieps, iva_pct, ieps_pct, ieps_tipo, costo_incluye_impuestos, maneja_lote, es_granel, unidad_granel, vender_sin_stock, usa_listas_precio')
                .eq('empresa_id', eid)
                .eq('status', 'activo')
                .order('nombre')
                .range(from, to)
            );
            return enrichProductos(rows, qc, eid);
          },
        }),
        qc.prefetchQuery({
          queryKey: ['clientes', eid, '', 'activo'],
          staleTime: CATALOG_STALE_TIME,
          queryFn: async () => {
            await lightCatalogsReady;
            const rows = await fetchAllPages<any>((from, to) =>
              supabase.from('clientes')
                .select('id, codigo, nombre, telefono, contacto, email, direccion, colonia, vendedor_id, cobrador_id, zona_id, tarifa_id, lista_id, status, orden, credito, limite_credito, dias_credito, dia_visita, gps_lat, gps_lng, frecuencia, foto_url, foto_fachada_url')
                .eq('empresa_id', eid)
                .eq('status', 'activo')
                .order('orden', { ascending: true })
                .range(from, to)
            );
            return enrichClientes(rows, qc, eid);
          },
        }),
      ]);
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const handle = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(runHeavyPrefetch, { timeout: 3000 })
      : window.setTimeout(runHeavyPrefetch, 800);

    return () => {
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, [empresa?.id, qc, pathname]);
}
