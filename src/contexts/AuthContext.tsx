import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, Empresa } from '@/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  empresa: Empresa | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, empresa: null, loading: true, signOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (u: User | null) => {
    if (u) {
      const { data: p } = await supabase.from('profiles')
        .select('id, user_id, nombre, empresa_id, vendedor_id, almacen_id, telefono, estado, avatar_url')
        .eq('user_id', u.id).maybeSingle();
      setProfile(p);
      if (p?.empresa_id) {
        const { data: e } = await supabase.from('empresas')
          .select('id, nombre, direccion, colonia, ciudad, estado, cp, telefono, email, rfc, logo_url, razon_social, regimen_fiscal, notas_ticket, ticket_campos')
          .eq('id', p.empresa_id).maybeSingle();
        setEmpresa(e);
      } else {
        setEmpresa(null);
      }
    } else {
      setProfile(null);
      setEmpresa(null);
    }
  }, []);

  useEffect(() => {
    let initialised = false;

    // 1. Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore events that just refresh the token — user is still logged in
      if (event === 'TOKEN_REFRESHED') return;

      // Only sign out when the user explicitly signs out
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

    // 2. Then restore session from storage
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
