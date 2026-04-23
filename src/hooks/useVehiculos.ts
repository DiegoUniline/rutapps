import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Vehiculo {
  id: string;
  empresa_id: string;
  alias: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  tipo: string;
  capacidad_kg: number | null;
  km_actual: number;
  foto_url: string | null;
  vendedor_default_id: string | null;
  status: 'activo' | 'mantenimiento' | 'baja';
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export function useVehiculos(opts: { soloActivos?: boolean; vendedorId?: string | null } = {}) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vehiculos', empresa?.id, opts.soloActivos, opts.vendedorId],
    enabled: !!empresa?.id,
    queryFn: async (): Promise<Vehiculo[]> => {
      let q = supabase.from('vehiculos').select('*').eq('empresa_id', empresa!.id).order('alias');
      if (opts.soloActivos) q = q.eq('status', 'activo');
      const { data, error } = await q;
      if (error) throw error;
      let list = (data || []) as Vehiculo[];
      if (opts.vendedorId) {
        // Prefer assigned + unassigned
        list = list.sort((a, b) => {
          const aw = a.vendedor_default_id === opts.vendedorId ? 0 : 1;
          const bw = b.vendedor_default_id === opts.vendedorId ? 0 : 1;
          return aw - bw;
        });
      }
      return list;
    },
  });
}

export function useUpsertVehiculo() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Vehiculo> & { id?: string }) => {
      if (!empresa?.id) throw new Error('Sin empresa');
      if (input.id) {
        const { id, ...rest } = input;
        const { data, error } = await supabase.from('vehiculos').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('vehiculos')
          .insert({ ...input, empresa_id: empresa.id, alias: input.alias || 'Nuevo' } as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehiculos'] }),
  });
}

export function useDeleteVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehiculos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehiculos'] }),
  });
}
