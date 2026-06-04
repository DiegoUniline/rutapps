import { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
  defaultUsers?: number;
}

export default function CostoSimuladorCard({ defaultUsers = 1 }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [simUsers, setSimUsers] = useState<number>(Math.max(1, defaultUsers));
  const [simPlanId, setSimPlanId] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [fxRate, setFxRate] = useState<number>(fxDefaults.USD);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('id,nombre,precio_por_usuario,precio_base,usuarios_incluidos,precio_extra_usuario,slug,meses,orden')
        .eq('activo', true)
        .order('orden');
      setPlans((data || []) as Plan[]);
      if (data && data.length) setSimPlanId((prev) => prev || (data[0] as Plan).id);
    })();
  }, []);

  const simPlan = plans.find((p) => p.id === simPlanId);
  const simMonthlyMXN = simPlan ? planCost(simPlan, simUsers) : 0;

  const simPeriodMXN = simPlan ? simMonthlyMXN * simPlan.meses : 0;

  const fxLabel = useMemo(() => `1 ${currency} = ${fxRate} MXN`, [currency, fxRate]);
  const toForeign = (mxn: number) => (fxRate > 0 ? mxn / fxRate : 0);
  const fmtForeign = (n: number) =>
    `${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${currency}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Simulador de costo</h2>
        <span className="text-[10px] text-muted-foreground">
          (referencial · MXN siempre · USD/otra moneda depende del tipo de cambio del banco)
        </span>
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
                {p.nombre}{p.slug ? ` — ${fmtMXN(p.precio_base || 0)}/mes` : ` — ${fmtMXN(p.precio_por_usuario)}/u/mes`}
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
            <div className="text-muted-foreground">
              Total {simPlan.meses} {simPlan.meses === 1 ? 'mes' : 'meses'}
            </div>
            <div className="text-base font-black text-foreground">{fmtMXN(simPeriodMXN)}</div>
            <div className="text-[11px] text-muted-foreground">≈ {fmtForeign(toForeign(simPeriodMXN))}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2 text-muted-foreground">
            <div>Detalle</div>
            <div className="text-foreground font-semibold">
              {simPlan.slug
                ? `Base ${fmtMXN(simPlan.precio_base || 0)} + ${Math.max(0, simUsers - (simPlan.usuarios_incluidos || 0))} extra × ${fmtMXN(simPlan.precio_extra_usuario || 0)}`
                : `${simUsers} × ${fmtMXN(simPlan.precio_por_usuario)} × ${simPlan.meses}${simPlan.meses === 1 ? ' mes' : ' meses'}`}
            </div>

            <div className="text-[10px]">{fxLabel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
