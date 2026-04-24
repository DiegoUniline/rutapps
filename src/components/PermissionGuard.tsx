import { Navigate } from 'react-router-dom';
import { usePermisos, PATH_MODULE_MAP } from '@/hooks/usePermisos';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Guards a route by checking if the user has 'ver' permission for the
 * module that corresponds to the current route path.
 */
export function PermissionGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { hasModulo, loading, firstAccessibleRoute } = usePermisos();
  const { isSuperAdmin, isBlocked } = useSubscription();
  const { overrideEmpresaId } = useAuth();

  if (loading) return null;

  // Super admin bypass — but NOT when overriding to a blocked empresa
  if (isSuperAdmin && !(overrideEmpresaId && isBlocked)) return <>{children}</>;

  // Find the most specific matching path (longest prefix first)
  const matchingKey = Object.keys(PATH_MODULE_MAP)
    .sort((a, b) => b.length - a.length)
    .find(prefix => path === prefix || path.startsWith(prefix + '/'));

  const modulo = matchingKey ? PATH_MODULE_MAP[matchingKey] : '';

  // No module mapping or empty = always accessible
  if (!modulo) return <>{children}</>;

  if (!hasModulo(modulo)) {
    // Avoid redirect loop: if we're already on the user's first accessible route,
    // show a friendly message instead of bouncing forever.
    if (path === firstAccessibleRoute) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <h2 className="text-xl font-semibold">No tienes acceso a esta sección</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Tu rol no tiene permisos para ver este módulo. Contacta a un administrador
            si necesitas acceso.
          </p>
        </div>
      );
    }
    return <Navigate to={firstAccessibleRoute} replace />;
  }

  return <>{children}</>;
}
