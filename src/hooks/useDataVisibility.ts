import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';

/**
 * Determines if the current user should see only their own records
 * or all records for a given module.
 *
 * Returns:
 *  - `seeAll`: true if user has ver_todos permission for the module
 *  - `profileId`: the user's profile.id (same as vendedor/cobrador id)
 *  - `userId`: auth user id (for filtering by creator)
 *  - `clientesVisibilidad`: empresa-level setting ('todos' | 'propios')
 *  - `loading`: true while data is loading
 */
export function useDataVisibility(modulo: string) {
  const { user, empresa, profile } = useAuth();
  const { hasPermiso, loading: permLoading } = usePermisos();

  const { data: empresaConfig, isLoading: configLoading } = useQuery({
    queryKey: ['empresa-visibilidad', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('empresas')
        .select('clientes_visibilidad')
        .eq('id', empresa!.id)
        .single();
      return data;
    },
  });

  const seeAll = hasPermiso(modulo, 'ver_todos');
  const clientesVisibilidad = (empresaConfig as any)?.clientes_visibilidad ?? 'todos';

  return {
    seeAll,
    profileId: profile?.id ?? null,
    userId: user?.id ?? null,
    clientesVisibilidad,
    loading: permLoading || configLoading,
  };
}
