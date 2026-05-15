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
  meses: number;
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
      const { data: sub } = await supabase.from('subscriptions').select('plan_id').eq('empresa_id', empresa.id).maybeSingle();
      if (!sub?.plan_id) {
        const { data: ps } = await supabase.from('subscription_plans').select('id,nombre,precio_por_usuario,meses').eq('activo', true).order('precio_por_usuario').limit(1);
        setCurrentPlan((ps?.[0] as Plan) || null);
        return;
      }
      const { data } = await supabase.from('subscription_plans').select('id,nombre,precio_por_usuario,meses').eq('id', sub.plan_id).maybeSingle();
      setCurrentPlan((data as Plan) || null);
    })();
  }, [empresa?.id]);

  const monthlyMXN = currentPlan ? currentPlan.precio_por_usuario * activeUsers : 0;
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
