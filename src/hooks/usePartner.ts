import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePartner() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['partner', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('partners').select('*').eq('user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });
}
