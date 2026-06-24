import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Settings2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  nombre: string;
  precio_por_usuario: number;
  precio_base: number | null;
  usuarios_incluidos: number | null;
  precio_extra_usuario: number | null;
  slug: string | null;
  meses: number;
}

function planCost(plan: Plan, qty: number): number {
  if (plan.slug) {
    const extras = Math.max(0, qty - (plan.usuarios_incluidos || 0));
    return Number(plan.precio_base || 0) + extras * Number(plan.precio_extra_usuario || 0);
  }
  return plan.precio_por_usuario * qty;
}

const fmtMXN = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

interface Props {
  activeUsers: number;
  isTrial: boolean;
}

export default function PlanSimuladorCard({ activeUsers, isTrial }: Props) {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);

  useEffect(() => {
    (async () => {
      if (!empresa?.id) return;
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_id, current_period_start, current_period_end')
        .eq('empresa_id', empresa.id)
        .maybeSingle();
      const cols = 'id,nombre,precio_por_usuario,precio_base,usuarios_incluidos,precio_extra_usuario,slug,meses';
      if (sub?.plan_id) {
        const { data } = await supabase.from('subscription_plans').select(cols).eq('id', sub.plan_id).maybeSingle();
        setCurrentPlan((data as Plan) || null);
        return;
      }
      // Sin plan_id explícito: inferir periodicidad por la duración del ciclo actual
      // de Stripe (current_period_end - current_period_start) en lugar de caer al
      // primer plan activo por orden (eso mostraba "Semestral" para suscripciones
      // mensuales reales). Default razonable: Mensual.
      let inferredMonths = 1;
      if (sub?.current_period_start && sub?.current_period_end) {
        const ms = new Date(sub.current_period_end).getTime() - new Date(sub.current_period_start).getTime();
        const days = ms / (1000 * 60 * 60 * 24);
        if (days >= 330) inferredMonths = 12;
        else if (days >= 150) inferredMonths = 6;
        else inferredMonths = 1;
      }
      const { data: ps } = await supabase
        .from('subscription_plans')
        .select(cols)
        .eq('meses', inferredMonths)
        .order('orden')
        .limit(1);
      setCurrentPlan((ps?.[0] as Plan) || null);
    })();
  }, [empresa?.id]);

  const monthlyMXN = currentPlan ? planCost(currentPlan, activeUsers) : 0;
  const periodMXN = currentPlan ? monthlyMXN * currentPlan.meses : 0;


  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Tu plan actual</h2>
            {isTrial && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5">
                <Sparkles className="h-3 w-3" /> Prueba — usuarios ilimitados
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {currentPlan ? (
              <>
                Plan <span className="font-semibold text-foreground">{currentPlan.nombre}</span> ·
                {currentPlan.slug
                  ? <> {fmtMXN(currentPlan.precio_base || 0)} base ({currentPlan.usuarios_incluidos || 1} usuario{(currentPlan.usuarios_incluidos || 1) !== 1 ? 's' : ''}) · +{fmtMXN(currentPlan.precio_extra_usuario || 0)}/usuario extra</>
                  : <> {fmtMXN(currentPlan.precio_por_usuario)}/usuario/mes · {currentPlan.meses} {currentPlan.meses === 1 ? 'mes' : 'meses'}</>}
              </>
            ) : 'Sin plan asignado'}

          </div>
        </div>
        <Button size="sm" onClick={() => navigate('/mi-suscripcion')} className="gap-1">
          <Settings2 className="h-3.5 w-3.5" /> Gestionar suscripción
        </Button>
      </div>

      {currentPlan && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Usuarios activos</div>
            <div className="text-base font-bold text-foreground">{activeUsers}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Costo mensual</div>
            <div className="text-base font-bold text-foreground">{fmtMXN(monthlyMXN)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Total del periodo</div>
            <div className="text-base font-bold text-foreground">{fmtMXN(periodMXN)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
