import { useQuery } from '@tanstack/react-query';
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

const CACHE_KEY = 'uniline_subscription_state';

function readCache(userId?: string | null) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(userId: string, state: Omit<SubscriptionState, 'loading'>) {
  try { localStorage.setItem(`${CACHE_KEY}:${userId}`, JSON.stringify(state)); } catch {}
}

async function fetchSubscription(userId: string, empresaId?: string): Promise<Omit<SubscriptionState, 'loading'>> {
  let isSuperAdmin = false;

  try {
    const { data: sa } = await supabase.from('super_admins').select('id').eq('user_id', userId).maybeSingle();
    isSuperAdmin = !!sa;
  } catch {
    const cached = readCache(userId);
    if (cached) return cached;
    return { status: 'offline', daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
  }

  if (isSuperAdmin && !empresaId) {
    const state = { status: 'active', daysLeft: 999, isBlocked: false, isSuperAdmin: true, maxUsuarios: 999 };
    writeCache(userId, state);
    return state;
  }

  if (!empresaId) {
    return { status: null, daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
  }

  try {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_end, max_usuarios')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (error || !sub) {
      const state = { status: null, daysLeft: null, isBlocked: !sub, isSuperAdmin, maxUsuarios: 0 };
      writeCache(userId, state);
      return state;
    }

    const endDate = sub.status === 'trial'
      ? (sub.trial_ends_at ?? sub.current_period_end)
      : (sub.current_period_end ?? sub.trial_ends_at);
    const daysLeft = endDate ? differenceInDays(new Date(endDate), new Date()) : null;
    const isBlocked = !isSuperAdmin && (
      sub.status === 'suspended' ||
      sub.status === 'cancelada' ||
      (sub.status === 'past_due' && daysLeft !== null && daysLeft < -3) ||
      (sub.status === 'trial' && daysLeft !== null && daysLeft < -3) ||
      (sub.status === 'gracia' && daysLeft !== null && daysLeft < -3)
    );

    const state = {
      status: sub.status,
      daysLeft,
      isBlocked,
      isSuperAdmin,
      maxUsuarios: isSuperAdmin ? 999 : sub.max_usuarios,
    };
    writeCache(userId, state);
    return state;
  } catch {
    const cached = readCache(userId);
    if (cached) return cached;
    return { status: 'offline', daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
  }
}

export function useSubscription(): SubscriptionState {
  const { user, empresa } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['subscription-state', user?.id, empresa?.id],
    queryFn: () => fetchSubscription(user!.id, empresa?.id),
    enabled: !!user?.id,
    staleTime: 60_000, // 1 min
    gcTime: 5 * 60_000,
    placeholderData: () => readCache(user?.id) ?? undefined,
  });

  if (!user) {
    return { loading: false, status: null, daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
  }

  if (data) {
    return { loading: false, ...data };
  }

  return { loading: isLoading, status: null, daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
}
