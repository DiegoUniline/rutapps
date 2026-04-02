import { useMemo } from 'react';
import { AlertTriangle, TrendingDown, UserX, Flame, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClienteEnRiesgo {
  id: string;
  nombre: string;
  vendedor: string;
  ultimaCompraFecha: string | null;
  ultimaCompraValor: number;
  diasSinComprar: number | null;
  visitadoHoy: boolean;
}

interface Props {
  clientes: ClienteEnRiesgo[];
  fmtMoney: (n: number) => string;
  maxItems?: number;
  compact?: boolean;
}

function getSeverity(dias: number | null): 'critical' | 'high' | 'medium' | 'low' | 'never' {
  if (dias === null) return 'never';
  if (dias > 30) return 'critical';
  if (dias > 14) return 'high';
  if (dias > 7) return 'medium';
  return 'low';
}

const SEVERITY_STYLES = {
  critical: { bg: 'bg-destructive/15', text: 'text-destructive', border: 'border-destructive/30', label: '🔴 Crítico', barColor: 'bg-destructive' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/20', label: '🟠 Alto', barColor: 'bg-orange-500' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', label: '🟡 Medio', barColor: 'bg-amber-500' },
  low: { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border', label: '🟢 Bajo', barColor: 'bg-primary' },
  never: { bg: 'bg-destructive/20', text: 'text-destructive', border: 'border-destructive/40', label: '⚫ Nunca', barColor: 'bg-destructive' },
};

export function ClientesEnRiesgoWidget({ clientes, fmtMoney, maxItems = 10, compact = false }: Props) {
  const noVisitados = useMemo(
    () => clientes.filter(c => !c.visitadoHoy).sort((a, b) => {
      // Sort by value descending (highest revenue at risk first)
      if (b.ultimaCompraValor !== a.ultimaCompraValor) return b.ultimaCompraValor - a.ultimaCompraValor;
      return (b.diasSinComprar ?? 999) - (a.diasSinComprar ?? 999);
    }),
    [clientes]
  );

  const stats = useMemo(() => {
    const totalEnRiesgo = noVisitados.reduce((s, c) => s + c.ultimaCompraValor, 0);
    const nuncaVisitados = noVisitados.filter(c => c.diasSinComprar === null).length;
    const criticos = noVisitados.filter(c => (c.diasSinComprar ?? 999) > 30).length;
    const altos = noVisitados.filter(c => c.diasSinComprar !== null && c.diasSinComprar > 14 && c.diasSinComprar <= 30).length;
    return { totalEnRiesgo, nuncaVisitados, criticos, altos, total: noVisitados.length };
  }, [noVisitados]);

  if (noVisitados.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <div className="text-3xl mb-2">🎉</div>
        <p className="text-sm font-medium text-foreground">¡Todos los clientes visitados!</p>
        <p className="text-xs text-muted-foreground mt-1">No hay ingresos en riesgo</p>
      </div>
    );
  }

  const topItems = noVisitados.slice(0, maxItems);
  const maxVal = Math.max(...topItems.map(c => c.ultimaCompraValor), 1);

  return (
    <div className="space-y-3">
      {/* Hero KPI - Revenue at Risk */}
      <div className="relative overflow-hidden rounded-2xl border border-destructive/20 bg-gradient-to-br from-destructive/5 via-destructive/10 to-orange-500/5 p-5">
        <div className="absolute -right-4 -top-4 opacity-[0.07]">
          <TrendingDown className="h-32 w-32 text-destructive" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-4 w-4 text-destructive animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">
              Ingreso en riesgo
            </span>
          </div>
          <div className="text-3xl font-black text-foreground tracking-tight">
            {fmtMoney(stats.totalEnRiesgo)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Valor de la última compra de <span className="font-semibold text-foreground">{stats.total} clientes</span> sin visitar
          </p>
        </div>

        {/* Severity breakdown */}
        <div className="flex items-center gap-3 mt-4">
          {stats.criticos > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-[10px] font-semibold text-destructive">
              🔴 {stats.criticos} críticos
            </div>
          )}
          {stats.altos > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
              🟠 {stats.altos} altos
            </div>
          )}
          {stats.nuncaVisitados > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-destructive/20 px-2.5 py-1 text-[10px] font-semibold text-destructive">
              ⚫ {stats.nuncaVisitados} nunca visitados
            </div>
          )}
        </div>
      </div>

      {/* Client list */}
      <div className="space-y-1.5">
        {topItems.map((c, i) => {
          const severity = getSeverity(c.diasSinComprar);
          const styles = SEVERITY_STYLES[severity];
          const barWidth = maxVal > 0 ? (c.ultimaCompraValor / maxVal) * 100 : 0;

          return (
            <div
              key={c.id}
              className={cn(
                'group relative rounded-xl border p-3 transition-all hover:shadow-md',
                styles.border, styles.bg
              )}
            >
              <div className="flex items-start gap-3">
                {/* Rank */}
                <div className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                  i < 3 ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'
                )}>
                  {i + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{c.nombre}</span>
                    {severity === 'never' && (
                      <span className="shrink-0 rounded-full bg-destructive/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive">
                        Nunca visitado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{c.vendedor}</span>
                    {c.ultimaCompraFecha && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {c.ultimaCompraFecha}
                      </span>
                    )}
                  </div>
                  {/* Value bar */}
                  {!compact && c.ultimaCompraValor > 0 && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', styles.barColor)}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Value & Days */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {fmtMoney(c.ultimaCompraValor)}
                    </span>
                  </div>
                  <div className={cn('text-[11px] font-semibold mt-0.5', styles.text)}>
                    {c.diasSinComprar !== null ? `${c.diasSinComprar} días` : 'Sin historial'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {noVisitados.length > maxItems && (
        <p className="text-center text-[11px] text-muted-foreground">
          +{noVisitados.length - maxItems} clientes más sin visitar
        </p>
      )}
    </div>
  );
}
