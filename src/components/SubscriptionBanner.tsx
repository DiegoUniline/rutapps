import { useSubscription } from '@/hooks/useSubscription';
import { useFacturaPendiente } from '@/hooks/useFacturaPendiente';
import { AlertTriangle, Clock, CreditCard, Zap, FileWarning } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function SubscriptionBanner() {
  const { daysLeft, status } = useSubscription();
  const fp = useFacturaPendiente();
  const location = useLocation();

  // Ocultar únicamente en la vista móvil de ruta; en escritorio lo ven todos
  if (location.pathname.startsWith('/ruta')) return null;

  // PRIORIDAD 1: Factura pendiente (mientras la suscripción siga activa)
  if (fp.hasPendiente) {
    const isExpired = fp.isExpired;
    const isUrgent = isExpired || (fp.diasParaPagar !== null && fp.diasParaPagar <= 2);

    let message = '';
    if (isExpired) {
      if (fp.diasGraciaRestantes && fp.diasGraciaRestantes > 0) {
        message = `¡Tu factura ${fp.numeroFactura} venció! Te quedan ${fp.diasGraciaRestantes} día${fp.diasGraciaRestantes !== 1 ? 's' : ''} de gracia para pagarla.`;
      } else {
        message = `Tu factura ${fp.numeroFactura} venció. Tu acceso será suspendido.`;
      }
    } else {
      message = `Tienes una factura pendiente. Te quedan ${fp.diasParaPagar} día${fp.diasParaPagar !== 1 ? 's' : ''} para pagarla.`;
    }

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
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: (isUrgent || isExpired) ? 'banner-shimmer 2s ease-in-out infinite' : 'none',
          }}
        />
        <span className="relative flex items-center gap-2">
          {isExpired ? <AlertTriangle className="h-4 w-4 animate-bounce" /> : <FileWarning className="h-4 w-4" />}
          <span>{message}</span>
        </span>
        <Link
          to="/mi-suscripcion"
          className={cn(
            "relative inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-bold transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95",
            isExpired ? "bg-white text-destructive hover:bg-white/90" : "bg-white/90 text-amber-700 hover:bg-white"
          )}
        >
          <CreditCard className="h-3.5 w-3.5" />
          Pagar ahora
        </Link>
      </div>
    );
  }

  // PRIORIDAD 2: Vencimiento de suscripción (legacy)
  if (daysLeft === null || daysLeft > 7) return null;
  if (status === 'active' && daysLeft > 7) return null;

  const isExpired = daysLeft <= 0;
  const isGracePeriod = isExpired && daysLeft >= -3;
  const isTrial = status === 'trial';
  const graceDaysLeft = isExpired ? 3 + daysLeft : 0;

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
      <div
        className={cn("absolute inset-0 pointer-events-none", isUrgent || isExpired ? "animate-banner-pulse" : "")}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: (isUrgent || isExpired) ? 'banner-shimmer 2s ease-in-out infinite' : 'none',
        }}
      />
      <span className="relative flex items-center gap-2">
        {isExpired ? <AlertTriangle className="h-4 w-4 animate-bounce" />
          : isUrgent ? <Zap className="h-4 w-4 animate-pulse" />
          : <Clock className="h-4 w-4" />}
        <span>{message}</span>
      </span>
      <Link
        to="/mi-suscripcion"
        className={cn(
          "relative inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-bold transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95",
          isExpired ? "bg-white text-destructive hover:bg-white/90" : "bg-white/90 text-amber-700 hover:bg-white"
        )}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {isExpired ? 'Renovar ahora' : 'Ver planes'}
      </Link>
    </div>
  );
}
