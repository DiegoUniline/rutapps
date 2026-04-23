import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { todayLocal } from '@/lib/utils';

export interface RutaSesion {
  id: string;
  empresa_id: string;
  vehiculo_id: string;
  vendedor_id: string;
  carga_id: string | null;
  fecha: string;
  inicio_at: string;
  km_inicio: number;
  lat_inicio: number | null;
  lng_inicio: number | null;
  foto_inicio_url: string | null;
  notas_inicio: string | null;
  fin_at: string | null;
  km_fin: number | null;
  lat_fin: number | null;
  lng_fin: number | null;
  foto_fin_url: string | null;
  notas_fin: string | null;
  km_recorridos: number | null;
  status: 'en_ruta' | 'cerrada' | 'cancelada';
  vehiculos?: { alias: string; placa: string | null } | null;
}

/** Active route session (status=en_ruta) for current vendedor today */
export function useRutaSesionActiva() {
  const { profile, empresa } = useAuth();
  const vendedorId = profile?.id;

  return useQuery({
    queryKey: ['ruta-sesion-activa', empresa?.id, vendedorId],
    enabled: !!empresa?.id && !!vendedorId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<RutaSesion | null> => {
      const { data, error } = await supabase
        .from('ruta_sesiones')
        .select('*, vehiculos(alias, placa)')
        .eq('empresa_id', empresa!.id)
        .eq('vendedor_id', vendedorId!)
        .eq('status', 'en_ruta')
        .order('inicio_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useAbrirRutaSesion() {
  const { profile, empresa } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      vehiculo_id: string | null;
      km_inicio: number | null;
      lat_inicio?: number | null;
      lng_inicio?: number | null;
      foto_inicio_url?: string | null;
      notas_inicio?: string | null;
      carga_id?: string | null;
    }) => {
      if (!empresa?.id || !profile?.id) throw new Error('Sesión no disponible');
      const payload = {
        empresa_id: empresa.id,
        vendedor_id: profile.id,
        fecha: todayLocal(),
        ...input,
      };
      const { data, error } = await supabase
        .from('ruta_sesiones')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruta-sesion-activa'] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
    },
  });
}

export function useCerrarRutaSesion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      km_fin: number;
      lat_fin?: number | null;
      lng_fin?: number | null;
      foto_fin_url?: string | null;
      notas_fin?: string | null;
    }) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from('ruta_sesiones')
        .update({ ...rest, status: 'cerrada', fin_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruta-sesion-activa'] });
      qc.invalidateQueries({ queryKey: ['ruta-sesiones'] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
    },
  });
}
