import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Favorite {
  id: string;
  user_id: string;
  path: string;
  label: string;
  icon: string | null;
  orden: number;
}

const DEFAULT_FAVORITES: Array<{ path: string; label: string; icon: string }> = [
  { path: '/ruta', label: 'App Móvil', icon: 'Smartphone' },
  { path: '/clientes', label: 'Clientes', icon: 'Users' },
  { path: '/productos', label: 'Productos', icon: 'Package' },
  { path: '/listas-precio', label: 'Listas de Precios', icon: 'Tag' },
];

export function useFavorites() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['user_favorites', user?.id],
    queryFn: async () => {
      if (!user) return [] as Favorite[];
      const { data, error } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('orden', { ascending: true });
      if (error) throw error;
      let favs = (data ?? []) as Favorite[];

      // Ensure default favorites are always present (pinned)
      const existingPaths = new Set(favs.map(f => f.path));
      const missing = DEFAULT_FAVORITES.filter(f => !existingPaths.has(f.path));
      if (missing.length > 0) {
        const baseOrden = favs.length;
        const rows = missing.map((f, i) => ({
          user_id: user.id,
          path: f.path,
          label: f.label,
          icon: f.icon,
          orden: baseOrden + i,
        }));
        const { data: inserted, error: insErr } = await supabase
          .from('user_favorites')
          .insert(rows)
          .select('*');
        if (!insErr && inserted) favs = [...favs, ...(inserted as Favorite[])];
      }
      return favs;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const add = useMutation({
    mutationFn: async (fav: { path: string; label: string; icon?: string }) => {
      if (!user) throw new Error('No user');
      const orden = (query.data?.length ?? 0);
      const { error } = await supabase.from('user_favorites').insert({
        user_id: user.id,
        path: fav.path,
        label: fav.label,
        icon: fav.icon ?? null,
        orden,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_favorites', user?.id] });
      toast.success('Agregado a favoritos');
    },
    onError: (e: any) => toast.error(e?.message ?? 'No se pudo agregar'),
  });

  const remove = useMutation({
    mutationFn: async (path: string) => {
      if (!user) throw new Error('No user');
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('path', path);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_favorites', user?.id] });
      toast.success('Eliminado de favoritos');
    },
  });

  const isFavorite = (path: string) => !!query.data?.some(f => f.path === path);

  return {
    favorites: query.data ?? [],
    loading: query.isLoading,
    isFavorite,
    add: add.mutate,
    remove: remove.mutate,
  };
}
