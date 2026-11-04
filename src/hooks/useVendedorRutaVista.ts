import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';

/**
 * Vendedor cuya ruta se está viendo en la app móvil.
 * - Usuario normal: él mismo (datos del celular, funcionan sin conexión).
 * - Super admin con un vendedor elegido en la barra SA: ese vendedor. Sus datos no están en
 *   el celular (se sincroniza solo lo del propio usuario), así que se leen del servidor.
 */
export function useVendedorRutaVista() {
  const { user, profile, overrideVendedorId } = useAuth();
  const comoOtroVendedor = isSuperAdminEmail(user?.email) && !!overrideVendedorId;
  return {
    vendedorId: (comoOtroVendedor ? overrideVendedorId : profile?.id) ?? null,
    desdeServidor: comoOtroVendedor,
  };
}
