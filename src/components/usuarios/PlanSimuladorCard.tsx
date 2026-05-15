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

      <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Simulador de costo</h3>
          <span className="text-[10px] text-muted-foreground">(referencial · depende del tipo de cambio del banco)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-muted-foreground">Usuarios</span>
            <input
              type="number"
              min={1}
              value={simUsers}
              onChange={(e) => setSimUsers(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Plan</span>
            <select
              value={simPlanId}
              onChange={(e) => setSimPlanId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — {fmtMXN(p.precio_por_usuario)}/u/mes
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Moneda extranjera</span>
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setFxRate(fxDefaults[e.target.value] ?? 1);
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold"
            >
              {Object.keys(fxDefaults).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Tipo de cambio (MXN por 1 {currency})</span>
            <input
              type="number"
              step="0.0001"
              min={0}
              value={fxRate}
              onChange={(e) => setFxRate(parseFloat(e.target.value) || 0)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold"
            />
          </label>
        </div>

        {simPlan && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2">
              <div className="text-muted-foreground">Mensual</div>
              <div className="text-base font-black text-foreground">{fmtMXN(simMonthlyMXN)}</div>
              <div className="text-[11px] text-muted-foreground">≈ {fmtForeign(toForeign(simMonthlyMXN))}</div>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2">
              <div className="text-muted-foreground">Total {simPlan.meses} {simPlan.meses === 1 ? 'mes' : 'meses'}</div>
              <div className="text-base font-black text-foreground">{fmtMXN(simPeriodMXN)}</div>
              <div className="text-[11px] text-muted-foreground">≈ {fmtForeign(toForeign(simPeriodMXN))}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-2 text-muted-foreground">
              <div>Detalle</div>
              <div className="text-foreground font-semibold">
                {simUsers} × {fmtMXN(simPlan.precio_por_usuario)} × {simPlan.meses}{simPlan.meses === 1 ? ' mes' : ' meses'}
              </div>
              <div className="text-[10px]">{fxLabel}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
