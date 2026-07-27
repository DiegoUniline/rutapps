import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  isFeatureEnabled,
  setFeatureFlagsCache,
  type FeatureFlag,
} from '@/lib/featureFlags';

/** Carga todas las banderas y refresca el caché en memoria. */
export function useFeatureFlags() {
  const query = useQuery({
    queryKey: ['feature_flags'],
    queryFn: async (): Promise<FeatureFlag[]> => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, clave, nombre, descripcion, notas_prueba, alcance, licencias, created_at, updated_at')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as unknown as FeatureFlag[];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) setFeatureFlagsCache(query.data);
  }, [query.data]);

  return query;
}

/** ¿La empresa actual tiene habilitada la función `clave`? */
export function useFeatureFlag(clave: string): boolean {
  const { empresa } = useAuth();
  const { data } = useFeatureFlags();
  const licencia = (empresa as any)?.licencia as string | undefined;
  // `data` solo se usa para forzar el re-render cuando llegan las banderas.
  void data;
  return isFeatureEnabled(clave, licencia);
}
