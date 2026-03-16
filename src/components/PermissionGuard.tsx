import { Navigate } from 'react-router-dom';
import { usePermisos, ROUTE_TO_MODULE } from '@/hooks/usePermisos';

/**
 * Guards a route by checking if the user has 'ver' permission for the
 * module that corresponds to the current route path.
 */
export function PermissionGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { hasModulo, loading } = usePermisos();

  if (loading) return null;

  // Find the matching module for this path
  const matchingKey = Object.keys(ROUTE_TO_MODULE)
    .sort((a, b) => b.length - a.length) // longest prefix first
    .find(prefix => path.startsWith(prefix));

  const modulo = matchingKey ? ROUTE_TO_MODULE[matchingKey] : '';

  // No module mapping = always accessible (dashboard, etc.)
  if (!modulo) return <>{children}</>;

  if (!hasModulo(modulo)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
