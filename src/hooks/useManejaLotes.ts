import { useAuth } from '@/contexts/AuthContext';

/**
 * ¿La empresa actual tiene habilitado el manejo de lotes y caducidades?
 * Si no, toda la UI relacionada con lotes (columnas, botones, filtros,
 * modales y la vista de Lotes) debe quedar oculta.
 */
export function useManejaLotes(): boolean {
  const { empresa } = useAuth();
  return !!(empresa as any)?.maneja_lotes;
}
