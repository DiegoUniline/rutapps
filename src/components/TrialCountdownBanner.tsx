import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Clock, AlertTriangle, Loader2, X } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fmtMoney } from '@/lib/currency';
import { Link } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface TrialState {
  status: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_payment_method_id: string | null;
  max_usuarios: number;
  plan_periodo: string | null;
  plan_meses: number | null;
  plan_precio: number | null;
}

export default function TrialCountdownBanner() {
  const { empresa, user } = useAuth();
  const [data, setData] = useState<TrialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!empresa?.id || !user?.id) return;
    setIsOwner(!!empresa.owner_user_id && empresa.owner_user_id === user.id);
    load();
  }, [empresa?.id, user?.id]);

  async function load() {
    setLoading(true);
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, stripe_payment_method_id, max_usuarios, plan_id')
      .eq('empresa_id', empresa!.id)
      .maybeSingle();

    if (!sub) { setLoading(false); return; }

    let planPeriodo: string | null = null;
    let planMeses: number | null = null;
    let planPrecio: number | null = null;
    if ((sub as any).plan_id) {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('periodo, meses, precio_por_usuario')
        .eq('id', (sub as any).plan_id)
        .maybeSingle();
      planPeriodo = plan?.periodo || null;
      planMeses = plan?.meses || null;
      planPrecio = plan?.precio_por_usuario || null;
    }

    setData({
      status: sub.status,
      trial_ends_at: sub.trial_ends_at,
      current_period_start: (sub as any).current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: !!(sub as any).cancel_at_period_end,
      stripe_payment_method_id: (sub as any).stripe_payment_method_id || null,
      max_usuarios: sub.max_usuarios || 3,
      plan_periodo: planPeriodo,
      plan_meses: planMeses,
      plan_precio: planPrecio,
    });
    setLoading(false);
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const { data: r, error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'cancel_subscription' },
      });
      if (error) throw new Error(error.message);
      if (r?.error) throw new Error(r.error);
      toast.success(r?.immediate
        ? 'Suscripción cancelada. No se realizará ningún cobro.'
        : 'Se canceló la renovación. Mantienes acceso hasta el fin del periodo.');
      setShowCancel(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Error al cancelar');
    } finally {
      setCancelling(false);
    }
  }

  if (loading || !data || !isOwner) return null;

  const isTrial = data.status === 'trial';
  const isActive = data.status === 'active';
  // Periodo de gracia: la prueba/periodo terminó y el pago está pendiente.
  const isGracia = data.status === 'past_due' || data.status === 'gracia';

  // Banner aplica para trial, para el periodo de gracia (past_due) o cancel_at_period_end
  if (!isTrial && !isGracia && !data.cancel_at_period_end) return null;

  const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null;
  const today = new Date();
  const hasCard = !!data.stripe_payment_method_id;

  const totalCargo = data.plan_precio && data.plan_meses
    ? data.plan_precio * data.max_usuarios * data.plan_meses
    : null;

  if (isTrial && trialEnd) {
    const daysLeft = differenceInDays(trialEnd, today);
    return (
      <>
        <Card className="border-2 border-primary/30 bg-primary/5 mb-4">
          <CardContent className="pt-4 pb-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="rounded-full bg-primary/10 p-2.5">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base">
                  Te quedan <span className="text-primary">{Math.max(0, daysLeft)} día{daysLeft !== 1 ? 's' : ''}</span> de prueba gratis
                </div>
                <div className="text-xs text-muted-foreground">
                  {hasCard && totalCargo
                    ? <>El <strong>{format(trialEnd, 'd \'de\' MMMM', { locale: es })}</strong> se cobrarán <strong>{fmtMoney(totalCargo)}</strong> a tu tarjeta y arranca tu mes de servicio.</>
                    : <>Captura tu tarjeta para continuar al terminar la prueba. <Link to="/completar-registro" className="underline font-semibold">Capturar tarjeta</Link></>
                  }
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" asChild>
                <Link to="/mi-suscripcion">Ver detalles</Link>
              </Button>
              {hasCard && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setShowCancel(true)}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <CancelDialog
          open={showCancel}
          onClose={() => setShowCancel(false)}
          onConfirm={handleCancel}
          cancelling={cancelling}
          mode="trial"
          chargeDate={trialEnd}
          chargeAmount={totalCargo}
        />
      </>
    );
  }

  // Periodo de gracia: prueba/periodo terminó, pago pendiente, aún con acceso (3 días)
  if (isGracia) {
    const DIAS_GRACIA = 3;
    const refDate = trialEnd ?? (data.current_period_start ? new Date(data.current_period_start) : null);
    const diasTranscurridos = refDate ? Math.max(0, differenceInDays(today, refDate)) : 0;
    const diasRestantes = Math.max(0, DIAS_GRACIA - diasTranscurridos);
    return (
      <Card className="border-2 border-destructive/40 bg-destructive/5 mb-4">
        <CardContent className="pt-4 pb-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="rounded-full bg-destructive/10 p-2.5">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base text-destructive">
                {diasRestantes > 0
                  ? <>Tu acceso se pausará en <span>{diasRestantes} día{diasRestantes !== 1 ? 's' : ''}</span></>
                  : <>Tu acceso se pausará hoy por falta de pago</>}
              </div>
              <div className="text-xs text-muted-foreground">
                Tu {trialEnd ? 'prueba' : 'periodo'} terminó y el pago está pendiente. Paga ahora para no perder el acceso.
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" asChild>
              <Link to="/mi-suscripcion">Pagar ahora</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // cancel_at_period_end y suscripción activa: aviso de que terminará
  if (data.cancel_at_period_end && periodEnd) {
    return (
      <Card className="border-2 border-amber-300 bg-amber-50 mb-4">
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
          <div className="flex-1 text-sm">
            Cancelaste la renovación. Mantienes acceso hasta el <strong>{format(periodEnd, 'd \'de\' MMMM \'de\' yyyy', { locale: es })}</strong>.
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/mi-suscripcion">Reactivar</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function CancelDialog({
  open, onClose, onConfirm, cancelling, mode, chargeDate, chargeAmount,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  cancelling: boolean;
  mode: 'trial' | 'active';
  chargeDate: Date | null;
  chargeAmount: number | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cancelar suscripción?</DialogTitle>
          <DialogDescription>
            {mode === 'trial'
              ? <>Si cancelas ahora, tu cuenta se cerrará al instante y <strong>no se realizará ningún cargo</strong>{chargeDate && chargeAmount ? <> {' '}(evitarás el cobro de {fmtMoney(chargeAmount)} del {format(chargeDate, 'd \'de\' MMMM', { locale: es })})</> : null}. Perderás los datos cargados durante la prueba.</>
              : <>Mantendrás acceso hasta el fin de tu periodo pagado. No se realizarán cargos futuros.</>
            }
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={cancelling}>No, mantener mi cuenta</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={cancelling}>
            {cancelling ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Cancelando…</> : 'Sí, cancelar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
