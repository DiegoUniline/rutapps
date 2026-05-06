import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ProductoPresentacion {
  id: string;
  empresa_id: string;
  producto_id: string;
  nombre: string;
  factor_base: number;
  precio_especial: number | null;
  orden: number;
  activo: boolean;
  es_principal_stock?: boolean;
}

export function usePresentaciones(productoId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['producto_presentaciones', empresa?.id, productoId],
    enabled: !!empresa?.id && !!productoId,
    queryFn: async () => {
      const { data, error } = await (supabase.from('producto_presentaciones' as any)
        .select('*')
        .eq('producto_id', productoId!)
        .eq('empresa_id', empresa!.id)
        .order('orden', { ascending: true })
        .order('factor_base', { ascending: true }) as any);
      if (error) throw error;
      return (data ?? []) as ProductoPresentacion[];
    },
  });
}

/** Fetch all presentations for current empresa (for offline/POS use) */
export function useAllPresentaciones() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['producto_presentaciones', empresa?.id, 'all'],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from('producto_presentaciones' as any)
        .select('*')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('factor_base', { ascending: true }) as any);
      if (error) throw error;
      return (data ?? []) as ProductoPresentacion[];
    },
  });
}

export function useSavePresentacion() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (p: Partial<ProductoPresentacion> & { producto_id: string }) => {
      const payload: any = { ...p, empresa_id: empresa!.id };
      if (p.id) {
        const { error } = await (supabase.from('producto_presentaciones' as any).update(payload).eq('id', p.id) as any);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await (supabase.from('producto_presentaciones' as any).insert(payload) as any);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['producto_presentaciones'] }),
  });
}

export function useDeletePresentacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('producto_presentaciones' as any).delete().eq('id', id) as any);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['producto_presentaciones'] }),
  });
}
