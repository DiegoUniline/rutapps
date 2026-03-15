import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays } from 'date-fns';
import { AlertTriangle, Clock } from 'lucide-react';

export default function SubscriptionBanner() {
  const { user, empresa } = useAuth();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!empresa?.id) return;
    loadSubscription();
  }, [empresa?.id]);

  async function loadSubscription() {
    const { data } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_end')
      .eq('empresa_id', empresa!.id)
      .maybeSingle();
    if (!data) return;
    setStatus(data.status);
    const endDate = data.status === 'trial' ? data.trial_ends_at : data.current_period_end;
    if (endDate) {
      setDaysLeft(differenceInDays(new Date(endDate), new Date()));
    }
  }

  if (daysLeft === null || daysLeft > 3) return null;
  if (status === 'active' && daysLeft > 3) return null;

  const isExpired = daysLeft <= 0;
  const isTrial = status === 'trial';

  return (
    <div className={`w-full px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 ${
      isExpired
        ? 'bg-destructive text-destructive-foreground'
        : 'bg-amber-500 text-white'
    }`}>
      {isExpired ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      {isExpired
        ? isTrial
          ? 'Tu período de prueba ha expirado. Contrata un plan para continuar.'
          : 'Tu suscripción ha vencido. Renueva para seguir usando el sistema.'
        : isTrial
          ? `Tu prueba gratuita vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}.`
          : `Tu suscripción vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}. Renueva ahora.`
      }
    </div>
  );
}
