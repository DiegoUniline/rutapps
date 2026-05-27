import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Detects users that signed up but never captured a card / accepted terms.
 * These users MUST be redirected to /completar-registro before they can
 * use the app, because we no longer allow trial without card.
 *
 * Super admins, manual/active subscriptions, blocked subscriptions, and
 * subscriptions that already have a Stripe payment method are exempt.
 */
export function useNeedsCardCapture(): { loading: boolean; needs: boolean } {
  const { user, empresa, overrideEmpresaId } = useAuth();

  const isOwner = !!empresa?.owner_user_id && empresa.owner_user_id === user?.id;
  const isOverride = !!overrideEmpresaId;

  const { data, isLoading } = useQuery({
    queryKey: ['needs-card-capture', user?.id, empresa?.id],
    enabled: !!user?.id && !!empresa?.id && isOwner && !isOverride,
    staleTime: 60_000,
    queryFn: async () => {
      // Skip super admins (they have a row in super_admins)
      const { data: sa } = await supabase
        .from('super_admins')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (sa) return false;

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, es_manual, stripe_payment_method_id, terms_accepted_at')
        .eq('empresa_id', empresa!.id)
        .maybeSingle();

      if (!sub) return false;
      if ((sub as any).es_manual) return false;
      if (sub.status !== 'trial') return false;
      const hasCard = !!(sub as any).stripe_payment_method_id;
      // La tarjeta es el único gate real. Aceptar términos sin capturar tarjeta
      // (al iniciar checkout y luego cancelar) NO debe permitir entrar al sistema.
      return !hasCard;
    },
  });

  if (!user || !empresa || !isOwner || isOverride) {
    return { loading: false, needs: false };
  }
  return { loading: isLoading, needs: !!data };
}
