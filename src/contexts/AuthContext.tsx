import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { getOfflineTable } from '@/lib/offlineDb';
import type { User } from '@supabase/supabase-js';
import type { Profile, Empresa } from '@/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  empresa: Empresa | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Super-admin only: override the active empresa to view another company's data */
  overrideEmpresaId: string | null;
  setOverrideEmpresaId: (id: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, empresa: null, loading: true, signOut: async () => {}
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
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setEmpresa(null);
      return;
    }

    let nextProfile: Profile | null = null;
    let nextEmpresa: Empresa | null = null;

    try {
      const { data, error } = await supabase.from('profiles')
        .select('id, user_id, nombre, empresa_id, vendedor_id, almacen_id, telefono, estado, avatar_url, must_change_password')
        .eq('user_id', u.id)
        .maybeSingle();

      if (!error && data) {
        nextProfile = data as Profile;
      }
    } catch {
      // Offline / network error → fallback to local IndexedDB below
    }

    if (!nextProfile) {
      nextProfile = await getCachedProfile(u.id);
    }

    setProfile(nextProfile);

    if (nextProfile?.empresa_id) {
      try {
        const { data, error } = await supabase.from('empresas')
          .select('id, nombre, direccion, colonia, ciudad, estado, cp, telefono, email, rfc, logo_url, razon_social, regimen_fiscal, notas_ticket, ticket_campos, moneda')
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

    setEmpresa(nextEmpresa);
  }, []);

  useEffect(() => {
    let initialised = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setEmpresa(null);
        setLoading(false);
        return;
      }

      const u = session?.user ?? null;
      setUser(u);
      loadUserData(u).finally(() => setLoading(false));
      initialised = true;
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initialised) {
        const u = session?.user ?? null;
        setUser(u);
        loadUserData(u).finally(() => setLoading(false));
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ user, profile, empresa, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
