import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PlatformTeamAccess {
  has_access: boolean;
  person_id?: string;
  name?: string;
  job_title?: string | null;
  access_level?: 'executive' | 'supervisor' | 'manager';
  access_scope?: 'own' | 'team' | 'all';
  status?: 'invited' | 'active' | 'suspended';
  permissions?: Record<string, boolean>;
}

const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export function usePlatformTeam() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['platform-team-access', user?.id],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<PlatformTeamAccess> => {
      const { data, error } = await rpcClient.rpc('fn_my_team_access');
      if (error) {
        if ((error.message || '').includes('fn_my_team_access')) return { has_access: false };
        throw error;
      }
      return (data ?? { has_access: false }) as PlatformTeamAccess;
    },
  });
}
