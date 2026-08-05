import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { setGlobalTimezone } from '@/lib/utils';
import { getOfflineTable } from '@/lib/offlineDb';
import { setObservabilityUser } from '@/lib/observability';
import { setDataUsageIdentity } from '@/lib/dataUsage';
import type { User } from '@supabase/supabase-js';
import type { Profile, Empresa } from '@/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  empresa: Empresa | null;
  /** The user's REAL empresa (ignores super-admin overrides). */
  realEmpresa: Empresa | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Super-admin only: override the active empresa to view another company's data */
  overrideEmpresaId: string | null;
  setOverrideEmpresaId: (id: string | null) => void;
  /** Super-admin only: override active vendedor (profile id) to filter mobile views */
  overrideVendedorId: string | null;
  setOverrideVendedorId: (id: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, empresa: null, realEmpresa: null, loading: true, signOut: async () => {},
  overrideEmpresaId: null, setOverrideEmpresaId: () => {},
  overrideVendedorId: null, setOverrideVendedorId: () => {},
});

export const useAuth = () => useContext(AuthContext);

async function getCachedProfile(userId: string): Promise<Profile | null> {
  const profilesTable = getOfflineTable('profiles') as any;
  if (!profilesTable) return null;

  try {
    if (typeof profilesTable.where === 'function') {
      const cachedProfile = await profilesTable.where('user_id').equals(userId).first();
      if (cachedProfile) return cachedProfile as Profile;
    }

    const allProfiles = await profilesTable.toArray();
    return (allProfiles.find((item: any) => item.user_id === userId) as Profile | undefined) ?? null;
  } catch {
    return null;
  }
}

async function getCachedEmpresa(empresaId?: string | null): Promise<Empresa | null> {
  if (!empresaId) return null;
  const empresasTable = getOfflineTable('empresas') as any;
  if (!empresasTable) return null;

  try {
    const cachedEmpresa = await empresasTable.get(empresaId);
    return (cachedEmpresa as Empresa | undefined) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [realEmpresa, setRealEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideEmpresaId, setOverrideEmpresaIdRaw] = useState<string | null>(null);
  const [overrideVendedorId, setOverrideVendedorId] = useState<string | null>(null);

  const loadUserData = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setEmpresa(null);
      return;
    }

    let nextProfile: Profile | null = null;
    let nextEmpresa: Empresa | null = null;

    try {
      const primary = await supabase.from('profiles')
        .select('id, user_id, nombre, empresa_id, almacen_id, telefono, estado, avatar_url, must_change_password, super_admin_override_empresa_id, ui_prefs')
        .eq('user_id', u.id)
        .maybeSingle();
      let profileData: unknown = primary.data;
      let profileError = primary.error;

      // Compatibilidad: si la columna ui_prefs aún no existe (frontend nuevo
      // desplegado antes de la migración), reintentar sin ella para no romper
      // el inicio de sesión.
      if (profileError) {
        const retry = await supabase.from('profiles')
          .select('id, user_id, nombre, empresa_id, almacen_id, telefono, estado, avatar_url, must_change_password, super_admin_override_empresa_id')
          .eq('user_id', u.id)
          .maybeSingle();
        profileData = retry.data;
        profileError = retry.error;
      }

      if (!profileError && profileData) {
        nextProfile = profileData as Profile;
      }
    } catch {
      // Offline / network error → fallback to local IndexedDB below
    }

    if (!nextProfile) {
      nextProfile = await getCachedProfile(u.id);
    }

    // Bloquear sesión si el usuario fue archivado o dado de baja
    if (nextProfile && (nextProfile.estado === 'archivado' || nextProfile.estado === 'baja')) {
      try {
        const { toast } = await import('sonner');
        toast.error(
          nextProfile.estado === 'archivado'
            ? 'Tu usuario fue archivado. Contacta al administrador para reactivarlo.'
            : 'Tu usuario fue dado de baja. Contacta al administrador.'
        );
      } catch {}
      await supabase.auth.signOut();
      setProfile(null);
      setEmpresa(null);
      setRealEmpresa(null);
      return;
    }

    setProfile(nextProfile);

    if (nextProfile?.empresa_id) {
      try {
        const { data, error } = await supabase.from('empresas')
          .select('id, nombre, direccion, colonia, ciudad, estado, cp, telefono, email, rfc, logo_url, licencia, razon_social, regimen_fiscal, notas_ticket, ticket_campos, moneda, zona_horaria, owner_user_id, apartar_stock_pedidos, apartado_almacenes_ids, apartado_solo_con_stock, maneja_lotes, lada')
          .eq('id', nextProfile.empresa_id)
          .maybeSingle();

        if (!error && data) {
          nextEmpresa = data as Empresa;
        }
      } catch {
        // Offline / network error → fallback to local IndexedDB below
      }

      if (!nextEmpresa) {
        nextEmpresa = await getCachedEmpresa(nextProfile.empresa_id);
      }
    }

    setRealEmpresa(nextEmpresa);

    // If profile has a persisted super admin override, load that empresa as the effective one.
    const overrideId = (nextProfile as any)?.super_admin_override_empresa_id ?? null;
    if (overrideId && overrideId !== nextProfile?.empresa_id) {
      setOverrideEmpresaIdRaw(overrideId);
      try {
        const { data } = await supabase.from('empresas')
          .select('id, nombre, direccion, colonia, ciudad, estado, cp, telefono, email, rfc, logo_url, licencia, razon_social, regimen_fiscal, notas_ticket, ticket_campos, moneda, zona_horaria, owner_user_id, apartar_stock_pedidos, apartado_almacenes_ids, apartado_solo_con_stock, maneja_lotes, lada')
          .eq('id', overrideId)
          .maybeSingle();
        if (data) {
          setEmpresa(data as Empresa);
          setGlobalTimezone((data as Empresa).zona_horaria);
          return;
        }
      } catch { /* ignore */ }
    }

    setEmpresa(nextEmpresa);
    setGlobalTimezone(nextEmpresa?.zona_horaria);
  }, []);

  // Handle override empresa for super admin
  const setOverrideEmpresaId = useCallback(async (id: string | null) => {
    setOverrideEmpresaIdRaw(id);
    setOverrideVendedorId(null);

    // Persist override to profile so DB-level RLS scopes super admin to the chosen empresa.
    if (user?.id) {
      try {
        await supabase.from('profiles')
          .update({ super_admin_override_empresa_id: id })
          .eq('user_id', user.id);
      } catch { /* ignore */ }
    }

    if (!id) {
      setEmpresa(realEmpresa);
      setGlobalTimezone(realEmpresa?.zona_horaria);
      return;
    }
    try {
      const { data, error } = await supabase.from('empresas')
        .select('id, nombre, direccion, colonia, ciudad, estado, cp, telefono, email, rfc, logo_url, licencia, razon_social, regimen_fiscal, notas_ticket, ticket_campos, moneda, zona_horaria, owner_user_id, maneja_lotes, lada')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        setEmpresa(data as Empresa);
        setGlobalTimezone((data as Empresa).zona_horaria);
      }
    } catch { /* ignore */ }
  }, [realEmpresa, user?.id]);

  // Asociar usuario/empresa (solo IDs, sin datos personales) al monitoreo de
  // errores para depurar incidentes en producción.
  useEffect(() => {
    setObservabilityUser(user?.id ?? null, empresa?.id ?? null);
  }, [user?.id, empresa?.id]);

  const initialisedRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setEmpresa(null);
        setRealEmpresa(null);
        setOverrideEmpresaIdRaw(null);
        setOverrideVendedorId(null);
        setLoading(false);
        return;
      }

      initialisedRef.current = true;
      const u = session?.user ?? null;
      setUser(u);
      // Defer Supabase queries out of the auth callback to avoid client deadlock
      // on slow networks (Supabase docs: never await supabase.from(...) inside
      // onAuthStateChange).
      setTimeout(() => {
        loadUserData(u).finally(() => setLoading(false));
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initialisedRef.current) {
        const u = session?.user ?? null;
        setUser(u);
        loadUserData(u).finally(() => setLoading(false));
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  // Identidad para el medidor de consumo de datos (solo mide, no cambia nada).
  useEffect(() => {
    setDataUsageIdentity(empresa?.id, user?.id);
  }, [empresa?.id, user?.id]);

  const signOut = async () => {
    // Al cerrar sesión no debe quedar en el dispositivo el snapshot de
    // permisos del usuario anterior: otro usuario en el mismo teléfono nunca
    // debe heredar accesos comprobados para alguien más.
    try {
      const { purgeForeignSecuritySnapshots } = await import('@/lib/offlineSecurity');
      await purgeForeignSecuritySnapshots(null, null);
    } catch { /* el cierre de sesión nunca debe fallar por la limpieza */ }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, empresa, realEmpresa, loading, signOut, overrideEmpresaId, setOverrideEmpresaId, overrideVendedorId, setOverrideVendedorId }}>
      {children}
    </AuthContext.Provider>
  );
}
