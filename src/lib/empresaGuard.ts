/**
 * Multi-tenant guards. Use BEFORE any Supabase query/export/prefetch that
 * touches tables with `empresa_id`. Defense in depth on top of RLS.
 *
 * Usage:
 *   // En hooks de React Query:
 *   useQuery({
 *     queryKey: ['recurso', empresaId, ...],
 *     enabled: hasEmpresa(empresaId),
 *     queryFn: async () => {
 *       const eid = requireEmpresa(empresaId);
 *       return supabase.from('tabla').select('...').eq('empresa_id', eid)...
 *     },
 *   });
 *
 *   // En funciones imperativas (exports, prefetch, edge calls):
 *   const eid = requireEmpresa(empresaId);
 */

export class MissingEmpresaError extends Error {
  constructor(context?: string) {
    super(
      context
        ? `[empresaGuard] empresa_id requerido en: ${context}`
        : '[empresaGuard] empresa_id requerido para esta operación',
    );
    this.name = 'MissingEmpresaError';
  }
}

/** Type guard for React Query `enabled`. */
export function hasEmpresa(empresaId: string | null | undefined): empresaId is string {
  return typeof empresaId === 'string' && empresaId.length > 0;
}

/** Throws if empresaId is missing. Use at top of imperative functions. */
export function requireEmpresa(empresaId: string | null | undefined, context?: string): string {
  if (!hasEmpresa(empresaId)) throw new MissingEmpresaError(context);
  return empresaId;
}

/** Soft assertion: returns null instead of throwing (for optional flows). */
export function getEmpresaOrNull(empresaId: string | null | undefined): string | null {
  return hasEmpresa(empresaId) ? empresaId : null;
}
