import { useSubscription } from '@/hooks/useSubscription';
import { AlertTriangle, Clock, CreditCard, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function SubscriptionBanner() {
  const { daysLeft, status } = useSubscription();

  if (daysLeft === null || daysLeft > 7) return null;
  if (status === 'active' && daysLeft > 7) return null;

  const isExpired = daysLeft <= 0;
  const isGracePeriod = isExpired && daysLeft >= -3;
  const isTrial = status === 'trial';
  const graceDaysLeft = isExpired ? 3 + daysLeft : 0; // e.g. daysLeft=-1 → 2 days of grace left

  let message = '';
  if (isExpired) {
    if (isGracePeriod) {
      message = isTrial
        ? `¡Tu prueba expiró! Tienes ${graceDaysLeft} día${graceDaysLeft !== 1 ? 's' : ''} de gracia para activar tu plan.`
        : `¡Tu suscripción venció! Tienes ${graceDaysLeft} día${graceDaysLeft !== 1 ? 's' : ''} de gracia para renovar.`;
    } else {
      message = 'Tu acceso ha sido suspendido. Renueva para continuar.';
    }
  } else {
    message = isTrial
      ? `Tu prueba gratuita vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}.`
      : `Tu suscripción vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}. ¡Renueva ahora!`;
  }

  const isUrgent = daysLeft <= 3;

  return (
    <div
      className={cn(
        "w-full px-4 py-2.5 text-center text-sm font-semibold flex items-center justify-center gap-3 relative overflow-hidden z-50",
        isExpired
          ? "bg-destructive text-destructive-foreground"
          : isUrgent
            ? "bg-amber-500 text-white"
            : "bg-amber-400/90 text-amber-950"
      )}
    >
      {/* Animated shimmer overlay */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          isUrgent || isExpired ? "animate-banner-pulse" : ""
        )}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: (isUrgent || isExpired) ? 'banner-shimmer 2s ease-in-out infinite' : 'none',
        }}
      />

      <span className="relative flex items-center gap-2">
        {isExpired ? (
          <AlertTriangle className="h-4 w-4 animate-bounce" />
        ) : isUrgent ? (
          <Zap className="h-4 w-4 animate-pulse" />
        ) : (
          <Clock className="h-4 w-4" />
        )}
        <span>{message}</span>
      </span>

      <Link
        to="/mi-suscripcion"
        className={cn(
          "relative inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-bold transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95",
          isExpired
            ? "bg-white text-destructive hover:bg-white/90"
            : "bg-white/90 text-amber-700 hover:bg-white"
        )}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {isExpired ? 'Renovar ahora' : 'Ver planes'}
      </Link>
    </div>
  );
}
