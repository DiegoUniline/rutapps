import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays } from 'date-fns';

interface SubscriptionState {
  loading: boolean;
  status: string | null;
  daysLeft: number | null;
  isBlocked: boolean;
  isSuperAdmin: boolean;
  maxUsuarios: number;
}

export function useSubscription(): SubscriptionState {
  const { user, empresa } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    loading: true,
    status: null,
    daysLeft: null,
    isBlocked: false,
    isSuperAdmin: false,
    maxUsuarios: 3,
  });

  useEffect(() => {
    if (!user) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    check();
  }, [user, empresa?.id]);

  async function check() {
    // Check if super admin first — does NOT require empresa
    const { data: sa } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (sa) {
      setState({ loading: false, status: 'active', daysLeft: 999, isBlocked: false, isSuperAdmin: true, maxUsuarios: 999 });
      return;
    }

    // For subscription check, we need empresa
    if (!empresa?.id) {
      setState(s => ({ ...s, loading: false }));
      return;
    }

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_end, max_usuarios')
      .eq('empresa_id', empresa!.id)
      .maybeSingle();

    if (!sub) {
      // No subscription = blocked (unless just created, handled by trigger)
      setState({ loading: false, status: null, daysLeft: null, isBlocked: true, isSuperAdmin: false, maxUsuarios: 0 });
      return;
    }

    const endDate = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
    const daysLeft = endDate ? differenceInDays(new Date(endDate), new Date()) : null;
    const isBlocked = (sub.status === 'suspended') ||
      (sub.status === 'past_due' && daysLeft !== null && daysLeft < 0) ||
      (sub.status === 'trial' && daysLeft !== null && daysLeft < 0);

    setState({
      loading: false,
      status: sub.status,
      daysLeft,
      isBlocked,
      isSuperAdmin: false,
      maxUsuarios: sub.max_usuarios,
    });
  }

  return state;
}
