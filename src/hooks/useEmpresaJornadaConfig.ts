import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface EmpresaJornadaConfig {
  requiere_jornada_ruta: boolean;
  requiere_jornada_desde: string | null;
  jornada_permite_sin_vehiculo: boolean;
}

export function useEmpresaJornadaConfig() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  const query = useQuery({
    queryKey: ['empresa-jornada', empresaId],
    enabled: !!empresaId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EmpresaJornadaConfig> => {
      const { data, error } = await supabase
        .from('empresas')
        .select('requiere_jornada_ruta, requiere_jornada_desde, jornada_permite_sin_vehiculo')
        .eq('id', empresaId!)
        .maybeSingle();
      if (error) throw error;
      return {
        requiere_jornada_ruta: !!(data as any)?.requiere_jornada_ruta,
        requiere_jornada_desde: ((data as any)?.requiere_jornada_desde as string | null) ?? null,
        jornada_permite_sin_vehiculo: !!(data as any)?.jornada_permite_sin_vehiculo,
      };
    },
  });

  const cfg = query.data;
  // Compara fechas en formato YYYY-MM-DD locales
  const hoyStr = new Date().toISOString().slice(0, 10);
  const requireJornada = !!(
    cfg?.requiere_jornada_ruta &&
    (!cfg.requiere_jornada_desde || hoyStr >= cfg.requiere_jornada_desde)
  );

  return {
    config: cfg,
    requireJornada,
    isLoading: query.isLoading,
  };
}
