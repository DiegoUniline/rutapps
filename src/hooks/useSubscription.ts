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

type CachedSubscriptionState = Omit<SubscriptionState, 'loading'>;

const INITIAL_STATE: SubscriptionState = {
  loading: true,
  status: null,
  daysLeft: null,
  isBlocked: false,
  isSuperAdmin: false,
  maxUsuarios: 3,
};

function getSubscriptionCacheKey(userId: string) {
  return `uniline_subscription_state:${userId}`;
}

function readCachedSubscriptionState(userId?: string | null): CachedSubscriptionState | null {
  if (!userId) return null;

  try {
    const raw = localStorage.getItem(getSubscriptionCacheKey(userId));
    return raw ? JSON.parse(raw) as CachedSubscriptionState : null;
  } catch {
    return null;
  }
}

function writeCachedSubscriptionState(userId: string, state: CachedSubscriptionState) {
  try {
    localStorage.setItem(getSubscriptionCacheKey(userId), JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

function getOfflineFallbackState(userId?: string | null): SubscriptionState {
  const cached = readCachedSubscriptionState(userId);

  return {
    loading: false,
    status: cached?.status ?? 'offline',
    daysLeft: cached?.daysLeft ?? null,
    isBlocked: false,
    isSuperAdmin: cached?.isSuperAdmin ?? false,
    maxUsuarios: cached?.maxUsuarios ?? 3,
  };
}

export function useSubscription(): SubscriptionState {
  const { user, empresa } = useAuth();
  const [state, setState] = useState<SubscriptionState>(INITIAL_STATE);

  useEffect(() => {
    if (!user) {
      setState({ ...INITIAL_STATE, loading: false });
      return;
    }

    check();
  }, [user?.id, empresa?.id]);

  async function check() {
    if (!user) return;

    const applyOfflineFallback = () => setState(getOfflineFallbackState(user.id));

    try {
      const { data: sa, error: saError } = await supabase
        .from('super_admins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const isSuperAdmin = !!sa;

      if (isSuperAdmin && !empresa?.id) {
        const nextState: SubscriptionState = {
          loading: false,
          status: 'active',
          daysLeft: 999,
          isBlocked: false,
          isSuperAdmin: true,
          maxUsuarios: 999,
        };
        setState(nextState);
        writeCachedSubscriptionState(user.id, {
          status: nextState.status,
          daysLeft: nextState.daysLeft,
          isBlocked: nextState.isBlocked,
          isSuperAdmin: nextState.isSuperAdmin,
          maxUsuarios: nextState.maxUsuarios,
        });
        return;
      }

      if (saError && !navigator.onLine) {
        applyOfflineFallback();
        return;
      }
    } catch {
      applyOfflineFallback();
      return;
    }

    if (!empresa?.id) {
      if (!navigator.onLine) {
        applyOfflineFallback();
        return;
      }

      setState(current => ({ ...current, loading: false }));
      return;
    }

    try {
      const { data: sub, error } = await supabase
        .from('subscriptions')
        .select('status, trial_ends_at, current_period_end, max_usuarios')
        .eq('empresa_id', empresa.id)
        .maybeSingle();

      if (error) {
        if (!navigator.onLine) {
          applyOfflineFallback();
          return;
        }

        setState(current => ({ ...current, loading: false }));
        return;
      }

      if (!sub) {
        const nextState: SubscriptionState = {
          loading: false,
          status: null,
          daysLeft: null,
          isBlocked: true,
          isSuperAdmin: false,
          maxUsuarios: 0,
        };

        setState(nextState);
        writeCachedSubscriptionState(user.id, {
          status: nextState.status,
          daysLeft: nextState.daysLeft,
          isBlocked: nextState.isBlocked,
          isSuperAdmin: nextState.isSuperAdmin,
          maxUsuarios: nextState.maxUsuarios,
        });
        return;
      }

      const endDate = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
      const daysLeft = endDate ? differenceInDays(new Date(endDate), new Date()) : null;
      // Block after 3 grace days past expiration
      const isBlocked = !isSuperAdmin && (
        (sub.status === 'suspended') ||
        (sub.status === 'past_due' && daysLeft !== null && daysLeft < -3) ||
        (sub.status === 'trial' && daysLeft !== null && daysLeft < -3)
      );

      const nextState: SubscriptionState = {
        loading: false,
        status: sub.status,
        daysLeft,
        isBlocked,
        isSuperAdmin,
        maxUsuarios: isSuperAdmin ? 999 : sub.max_usuarios,
      };

      setState(nextState);
      writeCachedSubscriptionState(user.id, {
        status: nextState.status,
        daysLeft: nextState.daysLeft,
        isBlocked: nextState.isBlocked,
        isSuperAdmin: nextState.isSuperAdmin,
        maxUsuarios: nextState.maxUsuarios,
      });
    } catch {
      applyOfflineFallback();
    }
  }

  return state;
}
