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
      return (data ?? []) as Favorite[];
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
