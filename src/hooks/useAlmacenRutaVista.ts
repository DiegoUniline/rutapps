import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';

/**
 * Almacén de ruta que se está viendo en la app móvil (Stock, Solicitud de traspaso).
 * - Usuario normal: su propio almacén (`profile.almacen_id`).
 * - Super admin con un vendedor elegido en la barra SA: el almacén de ESE vendedor,
 *   leído del servidor y solo si es de la empresa activa.
 * - Super admin viendo otra empresa sin vendedor elegido: ninguno (`necesitaVendedor`);
 *   antes usaba su propio almacén, que es de otra empresa, y el stock salía vacío.
 */
export function useAlmacenRutaVista() {
  const { user, profile, empresa, overrideVendedorId } = useAuth();
  const esSA = isSuperAdminEmail(user?.email);
  const comoOtroVendedor = esSA && !!overrideVendedorId;
  const otraEmpresa = esSA && !!empresa?.id && profile?.empresa_id !== empresa.id;

  const vendedor = useQuery({
    queryKey: ['almacen-ruta-vendedor', empresa?.id, overrideVendedorId],
    enabled: comoOtroVendedor && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('almacen_id')
        .eq('id', overrideVendedorId!)
        .eq('empresa_id', empresa!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.almacen_id as string | null) ?? null;
    },
  });

  if (comoOtroVendedor) {
    return { almacenId: vendedor.data ?? null, cargando: vendedor.isLoading, necesitaVendedor: false };
  }
  if (otraEmpresa) return { almacenId: null, cargando: false, necesitaVendedor: true };
  return { almacenId: (profile?.almacen_id as string | null) ?? null, cargando: false, necesitaVendedor: false };
}
