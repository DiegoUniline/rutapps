import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInCalendarDays } from 'date-fns';

/**
 * Parsea una fecha de Supabase como fecha LOCAL, no UTC.
 * Las columnas `date` vienen como 'YYYY-MM-DD' y `new Date(str)` las trata como
 * medianoche UTC, lo que en CDMX (UTC-6) las mueve al día anterior por la tarde
 * y provocaba que el banner marcara "suscripción vencida" un día antes.
 */
function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Si viene solo la fecha (YYYY-MM-DD), construir en zona local.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (dateOnly) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}
import { isSuperAdminEmail } from '@/lib/superAdminEmail';

interface SubscriptionState {
  loading: boolean;
  status: string | null;
  daysLeft: number | null;
  isBlocked: boolean;
  isSuperAdmin: boolean;
  maxUsuarios: number;
}

const CACHE_KEY = 'uniline_subscription_state';

function cacheKey(userId: string, empresaId?: string | null) {
  return `${CACHE_KEY}:${userId}:${empresaId ?? 'sin_empresa'}`;
}

function readCache(userId?: string | null, empresaId?: string | null) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(userId, empresaId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(userId: string, empresaId: string | null | undefined, state: Omit<SubscriptionState, 'loading'>) {
  try {
    localStorage.removeItem(`${CACHE_KEY}:${userId}`); // Limpia caché vieja sin empresa
    localStorage.setItem(cacheKey(userId, empresaId), JSON.stringify(state));
  } catch {
    return;
  }
}

function normalizeCachedState(cached: any, isSuperAdmin: boolean): Omit<SubscriptionState, 'loading'> | null {
  if (!cached) return null;
  if (!isSuperAdmin) return cached;
  return { ...cached, isBlocked: false, isSuperAdmin: true, maxUsuarios: 999 };
}

async function fetchSubscription(userId: string, empresaId?: string, isOverride?: boolean, userEmail?: string | null): Promise<Omit<SubscriptionState, 'loading'>> {
  let isSuperAdmin = isSuperAdminEmail(userEmail);

  try {
    const { data: sa } = await supabase.from('super_admins').select('id').eq('user_id', userId).maybeSingle();
    isSuperAdmin = isSuperAdmin || !!sa;
  } catch {
    const cached = normalizeCachedState(readCache(userId, empresaId), isSuperAdmin);
    if (cached) return cached;
    return { status: 'offline', daysLeft: null, isBlocked: false, isSuperAdmin, maxUsuarios: isSuperAdmin ? 999 : 3 };
  }

  if (isSuperAdmin && !empresaId) {
    const state = { status: 'active', daysLeft: 999, isBlocked: false, isSuperAdmin: true, maxUsuarios: 999 };
    writeCache(userId, empresaId, state);
    return state;
  }

  if (!empresaId) {
    return { status: null, daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
  }

  try {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_end, fecha_vencimiento, acceso_bloqueado, es_manual, max_usuarios')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    // Network/server error: NEVER block on a failed query. Prefer cached state;
    // otherwise return a neutral offline state. Do NOT overwrite cache with a
    // bogus blocked=true entry (this was the root cause of false "Cuenta
    // suspendida" on unstable mobile connections).
    if (error) {
      const cached = normalizeCachedState(readCache(userId, empresaId), isSuperAdmin);
      if (cached) return cached;
      return { status: 'offline', daysLeft: null, isBlocked: false, isSuperAdmin, maxUsuarios: 3 };
    }

    // Legit "no subscription row" — only here we mark blocked (real signup gap).
    if (!sub) {
      const state = { status: null, daysLeft: null, isBlocked: !isSuperAdmin, isSuperAdmin, maxUsuarios: 0 };
      writeCache(userId, empresaId, state);
      return state;
    }

    // Determinar fecha de fin "real" — preferir el mayor entre fecha_vencimiento y current_period_end.
    // Usar parseLocalDate para tratar las columnas `date` como fecha LOCAL, no UTC
    // (si no, en CDMX el banner marca "vencida" un día antes de tiempo).
    const candidates = [sub.fecha_vencimiento, sub.current_period_end, sub.trial_ends_at]
      .map((d) => parseLocalDate(d as string | null))
      .filter((d): d is Date => d !== null);
    const endDate = candidates.length ? new Date(Math.max(...candidates.map(d => d.getTime()))) : null;
    const daysLeft = endDate ? differenceInCalendarDays(endDate, new Date()) : null;

    // Cobertura real: manual, o cualquier fecha de fin >= hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tieneCobertura = !!sub.es_manual || (endDate !== null && endDate >= today);

    // When super admin overrides to another empresa, evaluate isBlocked
    // as if they were a regular user so they see the real experience.
    const skipBlockBypass = isSuperAdmin && isOverride;
    // Suspensión/cancelación manual siempre bloquea, aunque exista una fecha futura.
    // Vencimientos automáticos sí respetan cobertura para evitar falsos bloqueos tras pago.
    const blockedByAdmin = sub.acceso_bloqueado === true || ['suspended', 'cancelled', 'cancelada'].includes(sub.status || '');
    const blockedByOverdue = !tieneCobertura && (
      (sub.status === 'past_due' && daysLeft !== null && daysLeft < -3) ||
      (sub.status === 'trial' && daysLeft !== null && daysLeft < -3) ||
      (sub.status === 'gracia' && daysLeft !== null && daysLeft < -3)
    );
    const isBlocked = (skipBlockBypass || !isSuperAdmin) && (blockedByAdmin || blockedByOverdue);

    const state = {
      status: sub.status,
      daysLeft,
      isBlocked,
      isSuperAdmin,
      // En modo "ver como otra empresa", respetar el límite real de esa empresa.
      maxUsuarios: isSuperAdmin && !isOverride ? 999 : sub.max_usuarios,
    };
    writeCache(userId, empresaId, state);
    return state;
  } catch {
    const cached = normalizeCachedState(readCache(userId, empresaId), isSuperAdmin);
    if (cached) return cached;
      return { status: 'offline', daysLeft: null, isBlocked: false, isSuperAdmin, maxUsuarios: isSuperAdmin ? 999 : 3 };
  }
}

export function useSubscription(): SubscriptionState {
  const { user, empresa, overrideEmpresaId } = useAuth();

  const cached = readCache(user?.id, empresa?.id);
  const isOverride = !!overrideEmpresaId;

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['subscription-state', user?.id, user?.email, empresa?.id, isOverride],
    queryFn: () => fetchSubscription(user!.id, empresa?.id, isOverride, user?.email),
    enabled: !!user?.id,
    staleTime: 60_000, // 1 min
    gcTime: 5 * 60_000,
    placeholderData: () => cached ?? undefined,
  });

  if (!user) {
    return { loading: false, status: null, daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
  }

  if (data) {
    // Never trust placeholder/cached data for blocking decisions — neither
    // a stale isBlocked:false (user may have just been suspended) nor a
    // stale isBlocked:true (user may have just paid and been reactivated).
    // Always wait for fresh server data to drive the suspended modal.
    if (isPlaceholderData) {
      return { loading: true, ...data, isBlocked: false };
    }
    return { loading: false, ...data };
  }

  return { loading: isLoading, status: null, daysLeft: null, isBlocked: false, isSuperAdmin: false, maxUsuarios: 3 };
}
