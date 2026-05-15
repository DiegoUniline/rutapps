import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Settings2, Users as UsersIcon, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  nombre: string;
  precio_por_usuario: number;
  meses: number;
}

const fxDefaults: Record<string, number> = {
  USD: 18.5,
  EUR: 20.0,
  GBP: 23.5,
  CAD: 13.5,
  COP: 0.0045,
  ARS: 0.018,
  CLP: 0.020,
  PEN: 4.9,
  BRL: 3.5,
};

const fmtMXN = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

interface Props {
  activeUsers: number;
  isTrial: boolean;
}

export default function PlanSimuladorCard({ activeUsers, isTrial }: Props) {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [simUsers, setSimUsers] = useState<number>(Math.max(1, activeUsers));
  const [simPlanId, setSimPlanId] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [fxRate, setFxRate] = useState<number>(fxDefaults.USD);

  useEffect(() => {
    (async () => {
      if (!empresa?.id) return;
      const [{ data: ps }, { data: sub }] = await Promise.all([
        supabase.from('subscription_plans').select('id,nombre,precio_por_usuario,meses').eq('activo', true).order('precio_por_usuario'),
        supabase.from('subscriptions').select('plan_id').eq('empresa_id', empresa.id).maybeSingle(),
      ]);
      setPlans((ps || []) as Plan[]);
      const cur = sub?.plan_id || (ps?.[0]?.id ?? null);
      setCurrentPlanId(cur);
      setSimPlanId(cur || '');
    })();
  }, [empresa?.id]);

  useEffect(() => {
    setSimUsers((prev) => (prev < activeUsers ? Math.max(1, activeUsers) : prev));
  }, [activeUsers]);

  const currentPlan = plans.find((p) => p.id === currentPlanId);
  const simPlan = plans.find((p) => p.id === simPlanId) || currentPlan;

  const currentMonthlyMXN = currentPlan ? currentPlan.precio_por_usuario * activeUsers : 0;
  const currentPeriodMXN = currentPlan ? currentMonthlyMXN * currentPlan.meses : 0;

  const simMonthlyMXN = simPlan ? simPlan.precio_por_usuario * simUsers : 0;
  const simPeriodMXN = simPlan ? simMonthlyMXN * simPlan.meses : 0;

  const fxLabel = useMemo(() => `1 ${currency} = ${fxRate} MXN`, [currency, fxRate]);
  const toForeign = (mxn: number) => (fxRate > 0 ? mxn / fxRate : 0);

  const fmtForeign = (n: number) =>
    `${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${currency}`;

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
                {' '}{fmtMXN(currentPlan.precio_por_usuario)}/usuario/mes ·
                {' '}{currentPlan.meses} {currentPlan.meses === 1 ? 'mes' : 'meses'}
              </>
            ) : 'Sin plan asignado'}
          </div>
        </div>
        <Button size="sm" onClick={() => navigate('/mi-suscripcion')} className="gap-1">
          <Settings2 className="h-3.5 w-3.5" /> Gestionar suscripción
        </Button>
      </div>

      {currentPlan && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Usuarios activos</div>
            <div className="text-base font-bold text-foreground">{activeUsers}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Costo mensual (MXN)</div>
            <div className="text-base font-bold text-foreground">{fmtMXN(currentMonthlyMXN)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Total del periodo</div>
            <div className="text-base font-bold text-foreground">{fmtMXN(currentPeriodMXN)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-muted-foreground">Equivalente {currency}/mes</div>
            <div className="text-base font-bold text-foreground">{fmtForeign(toForeign(currentMonthlyMXN))}</div>
          </div>
        </div>
      )}

    </div>
  );
}
