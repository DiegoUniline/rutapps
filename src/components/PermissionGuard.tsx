import { Navigate } from 'react-router-dom';
import { usePermisos, PATH_MODULE_MAP } from '@/hooks/usePermisos';
import { useSubscription } from '@/hooks/useSubscription';

/**
 * Guards a route by checking if the user has 'ver' permission for the
 * module that corresponds to the current route path.
 */
export function PermissionGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { hasModulo, loading } = usePermisos();
  const { isSuperAdmin } = useSubscription();

  if (loading) return null;
  if (isSuperAdmin) return <>{children}</>;

  // Find the most specific matching path (longest prefix first)
  const matchingKey = Object.keys(PATH_MODULE_MAP)
    .sort((a, b) => b.length - a.length)
    .find(prefix => path === prefix || path.startsWith(prefix + '/'));

  const modulo = matchingKey ? PATH_MODULE_MAP[matchingKey] : '';

  // No module mapping or empty = always accessible
  if (!modulo) return <>{children}</>;

  if (!hasModulo(modulo)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
