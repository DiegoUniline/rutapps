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
      const { data: p } = await supabase.from('profiles').select('*').eq('user_id', u.id).maybeSingle();
      setProfile(p);
      if (p?.empresa_id) {
        const { data: e } = await supabase.from('empresas').select('*').eq('id', p.empresa_id).maybeSingle();
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
    // 1. Set up listener FIRST (non-blocking — no awaits inside callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      // Fire-and-forget: load profile data without blocking
      loadUserData(u).finally(() => setLoading(false));
    });

    // 2. Then restore session from storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      loadUserData(u).finally(() => setLoading(false));
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
