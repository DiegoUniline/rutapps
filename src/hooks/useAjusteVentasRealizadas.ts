import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/** Llave de React Query del ajuste D-061 (se invalida al guardarlo en Configuración). */
export const AJUSTE_VENTAS_REALIZADAS_KEY = 'empresa-ajuste-ventas-realizadas';

/**
 * Lee `empresas.pedidos_cuentan_al_confirmar` (D-061) de la empresa activa.
 *
 * Se consulta aparte (no en el select de AuthContext) a propósito: si el front se publica
 * antes que la migración 20261123060000, pedir una columna que aún no existe en el
 * select de AuthContext dejaría a todos sin empresa cargada. Aquí, si la columna no existe
 * (42703), se usa la regla D-060 (false).
 *
 * `pedidosAlConfirmar` es undefined mientras carga; `listo` indica que ya se puede consultar
 * ventas con el ajuste correcto (si la lectura falla, se registra y se usa false = D-060).
 */
export function useAjusteVentasRealizadas(): { pedidosAlConfirmar: boolean; listo: boolean } {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const q = useQuery({
    queryKey: [AJUSTE_VENTAS_REALIZADAS_KEY, empresaId],
    enabled: !!empresaId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // La columna no está en src/integrations/supabase/types.ts (archivo regenerado): se lee
      // sin tipar y se convierte aquí.
      const { data, error } = await supabase
        .from('empresas')
        .select('pedidos_cuentan_al_confirmar' as 'id')
        .eq('id', empresaId!)
        .maybeSingle();
      if (error) {
        if ((error as { code?: string }).code === '42703') return false; // migración aún no aplicada
        console.error('[D-061] No se pudo leer pedidos_cuentan_al_confirmar', error);
        throw error;
      }
      return !!(data as unknown as { pedidos_cuentan_al_confirmar?: boolean } | null)?.pedidos_cuentan_al_confirmar;
    },
  });
  return { pedidosAlConfirmar: q.data ?? false, listo: q.isSuccess || q.isError };
}
