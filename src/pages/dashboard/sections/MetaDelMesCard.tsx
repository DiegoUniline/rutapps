import { useMemo, useState } from 'react';
import { Target, TrendingUp, Wallet, DollarSign, Pencil } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMonthlyGoal, useUpdateMonthlyGoal } from '../hooks/useMonthlyGoal';

interface Props {
  ventasMes: number;
  cobradoMes: number;
  gastosMes: number;
  margenMonto: number;
  money: (n: number) => string;
}

export default function MetaDelMesCard({ ventasMes, cobradoMes, gastosMes, margenMonto, money }: Props) {
  const { data: meta = 0, isLoading } = useMonthlyGoal();
  const updateMutation = useUpdateMonthlyGoal();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const today = new Date();
  const diaMes = today.getDate();
  const ultDia = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const proyeccion = useMemo(() => (diaMes > 0 ? (ventasMes / diaMes) * ultDia : 0), [ventasMes, diaMes, ultDia]);
  const pctMeta = meta > 0 ? Math.min(100, (ventasMes / meta) * 100) : 0;
  const pctRecuperacion = ventasMes > 0 ? (cobradoMes / ventasMes) * 100 : 0;
  const flujoNeto = cobradoMes - gastosMes;
  const margenPct = ventasMes > 0 ? (margenMonto / ventasMes) * 100 : 0;
  const proyeccionOk = meta > 0 && proyeccion >= meta;

  if (isLoading) return <div className="mt-3 h-32 rounded-xl bg-accent/40 animate-pulse" />;

  return (
    <>
      <div className="mt-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Meta del mes</span>
              <button
                onClick={() => { setDraft(meta ? String(meta) : ''); setEditOpen(true); }}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> Editar
              </button>
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
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Define la meta mensual de ventas para empezar a medir tu avance.</p>
                <Button size="sm" onClick={() => { setDraft(''); setEditOpen(true); }}>Configurar meta</Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 min-w-[260px]">
            <MiniStat icon={TrendingUp} label="Margen" value={money(margenMonto)} sub={`${margenPct.toFixed(0)}%`} />
            <MiniStat icon={Wallet} label="Recuperación" value={`${pctRecuperacion.toFixed(0)}%`} sub={`${money(cobradoMes)}`} />
            <MiniStat icon={DollarSign} label="Flujo neto" value={money(flujoNeto)} tone={flujoNeto >= 0 ? 'success' : 'danger'} />
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm z-[60]">
          <DialogHeader><DialogTitle>Meta mensual de ventas</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Monto en {money(0).replace(/[\d.,\s]/g, '')}</label>
            <Input type="number" min={0} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ej. 500000" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={async () => {
                await updateMutation.mutateAsync(Number(draft || 0));
                setEditOpen(false);
              }}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
