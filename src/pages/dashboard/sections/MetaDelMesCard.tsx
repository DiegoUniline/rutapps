import { useMemo } from 'react';
import { Target, TrendingUp, Wallet, DollarSign, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useMetasVenta } from '../hooks/useMetasVenta';

interface Props {
  ventasMes: number;
  cobradoMes: number;
  gastosMes: number;
  margenMonto: number;
  money: (n: number) => string;
}

export default function MetaDelMesCard({ ventasMes, cobradoMes, gastosMes, margenMonto, money }: Props) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const { data: metas = [], isLoading } = useMetasVenta(year, month);

  const meta = useMemo(
    () => (metas as any[]).reduce((acc, m) => acc + Number(m.meta_monto ?? 0), 0),
    [metas]
  );

  const diaMes = today.getDate();
  const ultDia = new Date(year, month, 0).getDate();
  const proyeccion = useMemo(() => (diaMes > 0 ? (ventasMes / diaMes) * ultDia : 0), [ventasMes, diaMes, ultDia]);
  const pctMeta = meta > 0 ? Math.min(100, (ventasMes / meta) * 100) : 0;
  const pctRecuperacion = ventasMes > 0 ? (cobradoMes / ventasMes) * 100 : 0;
  const flujoNeto = cobradoMes - gastosMes;
  const margenPct = ventasMes > 0 ? (margenMonto / ventasMes) * 100 : 0;
  const proyeccionOk = meta > 0 && proyeccion >= meta;

  if (isLoading) return <div className="mt-3 h-32 rounded-xl bg-accent/40 animate-pulse" />;

  return (
    <div className="mt-3 bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Meta del mes</span>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Info className="h-3 w-3" /> Suma desde pestaña Metas
            </span>
          </div>
          {meta > 0 ? (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold tabular-nums">{money(ventasMes)}</span>
                <span className="text-xs text-muted-foreground">de {money(meta)}</span>
                <span className="ml-auto text-sm font-semibold text-primary">{pctMeta.toFixed(0)}%</span>
              </div>
              <Progress value={pctMeta} className="mt-2 h-2" />
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Proyección cierre:</span>
                <span className="font-semibold tabular-nums">{money(proyeccion)}</span>
                <span className={
                  'px-2 py-0.5 rounded-full text-[10px] font-bold ' +
                  (proyeccionOk ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' : 'bg-destructive/15 text-destructive')
                }>
                  {proyeccionOk ? 'Va para meta' : 'Por debajo'}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configura metas en la pestaña <span className="font-semibold text-foreground">Metas</span> para ver el avance del mes aquí.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 min-w-[260px]">
          <MiniStat icon={TrendingUp} label="Margen" value={money(margenMonto)} sub={`${margenPct.toFixed(0)}%`} />
          <MiniStat icon={Wallet} label="Recuperación" value={`${pctRecuperacion.toFixed(0)}%`} sub={`${money(cobradoMes)}`} />
          <MiniStat icon={DollarSign} label="Flujo neto" value={money(flujoNeto)} tone={flujoNeto >= 0 ? 'success' : 'danger'} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string; sub?: string; tone?: 'success' | 'danger';
}) {
  const color = tone === 'success' ? 'text-[hsl(var(--success))]' : tone === 'danger' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="bg-accent/30 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`text-base font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
