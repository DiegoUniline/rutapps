import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';
import { offlineDb } from '@/lib/offlineDb';

/**
 * Determines if the current user should see only their own records
 * or all records for a given module.
 *
 * OFFLINE BEHAVIOR: reads `empresas.clientes_visibilidad` from IndexedDB
 * first (instant), then refreshes from Supabase if online and caches it.
 * If no value is found anywhere, defaults to 'propios' (safer) — this
 * prevents the offline app from leaking all clients/ventas when the
 * config can't be fetched.
 */
export function useDataVisibility(modulo: string) {
  const { user, empresa, profile } = useAuth();
  const { hasPermiso, loading: permLoading } = usePermisos();

  const { data: empresaConfig, isLoading: configLoading } = useQuery({
    queryKey: ['empresa-visibilidad', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 1) Read IndexedDB first (always available, even offline)
      let cached: any = null;
      try {
        cached = await offlineDb.empresas.get(empresa!.id);
      } catch { /* ignore */ }

      // 2) Try server; if it fails (offline), keep cached
      try {
        const { data, error } = await supabase
          .from('empresas')
          .select('clientes_visibilidad')
          .eq('id', empresa!.id)
          .single();
        if (!error && data) {
          // Persist into IndexedDB so next offline read has the latest
          try {
            const merged = { ...(cached || { id: empresa!.id }), clientes_visibilidad: (data as any).clientes_visibilidad };
            await offlineDb.empresas.put(merged);
          } catch { /* ignore */ }
          return data;
        }
      } catch { /* offline / network error */ }

      // 3) Fallback to cached value
      if (cached) return { clientes_visibilidad: cached.clientes_visibilidad };
      return null;
    },
  });

  const seeAll = hasPermiso(modulo, 'ver_todos');
  // Default to 'propios' when no config is available (safer offline behavior)
  const clientesVisibilidad = ((empresaConfig as any)?.clientes_visibilidad as 'todos' | 'propios' | undefined) ?? 'propios';

  return {
    seeAll,
    profileId: profile?.id ?? null,
    userId: user?.id ?? null,
    clientesVisibilidad,
    loading: permLoading || configLoading,
  };
}
