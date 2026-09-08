import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Offline-first hook for vendor/seller filter dropdowns.
 * - Reads from IndexedDB immediately when offline (avoids hanging "SELECCIONAR" with no options).
 * - When online, fetches fresh data and refreshes the cache.
 * - On network error, falls back to cache.
 * Shared by VentasListPage, CobranzaPage, CuentasCobrarPage, CotizacionesListPage, etc.
 */
export function useVendedoresForFilter() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    networkMode: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const cached = await offlineDb.profiles
            .where('empresa_id').equals(empresa!.id).toArray();
          return (cached as any[])
            .filter(p => !p.estado || p.estado === 'activo')
            .map(p => ({ id: p.id, user_id: p.user_id, nombre: p.nombre ?? '' }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        } catch { return [] as { id: string; user_id?: string; nombre: string }[]; }
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await readCache();
        if (cached.length > 0) return cached;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nombre, user_id, empresa_id, almacen_id, telefono, estado, pin_code, avatar_url')
          .eq('empresa_id', empresa!.id)
          .eq('estado', 'activo')
          .order('nombre');
        if (!error && data) {
          try {
            const { offlineDb } = await import('@/lib/offlineDb');
            await offlineDb.profiles.bulkPut(data as any);
          } catch { /* ignore */ }
          return data.map(p => ({ id: p.id, user_id: p.user_id, nombre: p.nombre ?? '' }));
        }
        if (error) throw error;
      } catch (err) {
        const cached = await readCache();
        if (cached.length > 0) return cached;
        console.error('Error fetching vendedores:', err);
      }
      return [] as { id: string; user_id?: string; nombre: string }[];
    },
  });
}

/**
 * Offline-first hook for client filter dropdowns and sale-list actions.
 * It intentionally returns only the small subset needed by those screens;
 * loading the full enriched customer catalog here adds several unrelated
 * catalog requests and delays the transactional table.
 */
export function useClientesForFilter() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    networkMode: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const cached = await offlineDb.clientes
            .where('empresa_id').equals(empresa!.id).toArray();
          return (cached as any[])
            .map(c => ({
              id: c.id,
              codigo: c.codigo ?? null,
              nombre: c.nombre ?? '',
              telefono: c.telefono ?? null,
              lada: c.lada ?? null,
              requiere_factura: c.requiere_factura === true,
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        } catch { return [] as Array<{ id: string; codigo: string | null; nombre: string; telefono: string | null; lada: string | null; requiere_factura: boolean }>; }
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await readCache();
        if (cached.length > 0) return cached;
      }

      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('id, codigo, nombre, telefono, lada, requiere_factura')
          .eq('empresa_id', empresa!.id)
          .order('nombre');
        if (!error && data) {
          return data.map(c => ({
            id: c.id,
            codigo: c.codigo ?? null,
            nombre: c.nombre ?? '',
            telefono: c.telefono ?? null,
            lada: c.lada ?? null,
            requiere_factura: c.requiere_factura === true,
          }));
        }
        if (error) throw error;
      } catch (err) {
        const cached = await readCache();
        if (cached.length > 0) return cached;
        console.error('Error fetching clientes:', err);
      }
      return [] as Array<{ id: string; codigo: string | null; nombre: string; telefono: string | null; lada: string | null; requiere_factura: boolean }>;
    },
  });
}
