import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';

/**
 * Hook que retorna true solo si el usuario logueado es el super admin
 * (diego.leon@uniline.mx). Usar para gatear módulos de facturación avanzada.
 */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return isSuperAdminEmail(user?.email);
}
