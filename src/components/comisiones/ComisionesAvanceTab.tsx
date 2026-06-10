import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Calendar, Trophy, TrendingUp, Target, Award } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { cn, fmtDate } from '@/lib/utils';

interface VendedorEsquema {
  id: string;
  nombre: string;
  comision_esquema_id: string;
  esquema: { id: string; nombre: string; tipo: string; base: string; config: any };
}

function iso(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function defaultRange() {
  const now = new Date();
  return { desde: iso(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

export default function ComisionesAvanceTab() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const init = defaultRange();
  const [desde, setDesde] = useState<string>(init.desde);
  const [hasta, setHasta] = useState<string>(init.hasta);

  const setPreset = (preset: 'mes' | 'mes_ant' | 'semana' | 'quincena' | 'anio') => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    if (preset === 'mes') { setDesde(iso(new Date(y, m, 1))); setHasta(iso(new Date(y, m + 1, 0))); }
    else if (preset === 'mes_ant') { setDesde(iso(new Date(y, m - 1, 1))); setHasta(iso(new Date(y, m, 0))); }
    else if (preset === 'semana') {
      const day = now.getDay(); const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(y, m, d + diff); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      setDesde(iso(mon)); setHasta(iso(sun));
    } else if (preset === 'quincena') {
      if (d <= 15) { setDesde(iso(new Date(y, m, 1))); setHasta(iso(new Date(y, m, 15))); }
      else { setDesde(iso(new Date(y, m, 16))); setHasta(iso(new Date(y, m + 1, 0))); }
    } else if (preset === 'anio') { setDesde(iso(new Date(y, 0, 1))); setHasta(iso(new Date(y, 11, 31))); }
  };

  const { data: vendedores, isLoading: loadVend } = useQuery({
    queryKey: ['vendedores-con-esquema-avance', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, nombre, comision_esquema_id, esquema:comision_esquemas!comision_esquema_id(id, nombre, tipo, base, config)' as any)
        .eq('empresa_id', empresa!.id).eq('estado', 'activo')
        .not('comision_esquema_id', 'is', null)
        .order('nombre');
      if (error) throw error;
      return (data ?? []).filter((v: any) => v.esquema) as any as VendedorEsquema[];
    },
  });

  const { data: calculos, isLoading: loadCalc } = useQuery({
    queryKey: ['comisiones-avance-calc', empresa?.id, desde, hasta, (vendedores ?? []).map(v => v.id).join(',')],
    enabled: !!empresa?.id && !!vendedores && vendedores.length > 0,
    queryFn: async () => {
      const out: Record<string, any> = {};
      for (const v of vendedores ?? []) {
        const { data, error } = await (supabase as any).rpc('calcular_comision_volumen', {
          p_vendedor_id: v.id, p_desde: desde, p_hasta: hasta,
        });
        if (error) { out[v.id] = { error: error.message }; continue; }
        out[v.id] = data;
      }
      return out;
    },
  });

  if (loadVend) return <TableSkeleton />;
  if (!vendedores || vendedores.length === 0) {
    return (
      <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
        No hay vendedores con esquema asignado.
      </div>
    );
  }

  // Ranking: top vendedor por comisión
  const ranking = [...(vendedores ?? [])]
    .map(v => ({ v, c: (calculos ?? {})[v.id] }))
    .sort((a, b) => (b.c?.comision ?? 0) - (a.c?.comision ?? 0));
  const topComision = ranking[0]?.c?.comision ?? 0;
  const topVentas = Math.max(...ranking.map(r => r.c?.total_ventas ?? 0), 0);
  const sumComision = ranking.reduce((s, r) => s + (r.c?.comision ?? 0), 0);
  const sumVentas = ranking.reduce((s, r) => s + (r.c?.total_ventas ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Filtros de periodo */}
      <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded p-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Del</span>
        <input type="date" className="input-odoo text-xs py-1.5 w-36" value={desde} onChange={e => setDesde(e.target.value)} />
        <span className="text-xs text-muted-foreground">al</span>
        <input type="date" className="input-odoo text-xs py-1.5 w-36" value={hasta} onChange={e => setHasta(e.target.value)} />
        <div className="h-6 w-px bg-border mx-1" />
        <button onClick={() => setPreset('semana')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Semana</button>
        <button onClick={() => setPreset('quincena')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Quincena</button>
        <button onClick={() => setPreset('mes')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Mes actual</button>
        <button onClick={() => setPreset('mes_ant')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Mes anterior</button>
        <button onClick={() => setPreset('anio')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Año</button>
        <span className="ml-auto text-xs text-muted-foreground">{fmtDate(desde)} a {fmtDate(hasta)}</span>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Ventas del equipo" value={fmt(sumVentas)} tone="primary" />
        <KpiCard icon={<Award className="h-4 w-4" />} label="Comisiones del equipo" value={fmt(sumComision)} tone="success" />
        <KpiCard icon={<Trophy className="h-4 w-4" />} label="Top vendedor" value={ranking[0]?.v.nombre ?? '—'} sub={fmt(topComision)} tone="warning" />
        <KpiCard icon={<Target className="h-4 w-4" />} label="Vendedores con esquema" value={`${vendedores.length}`} tone="muted" />
      </div>

      {loadCalc && <TableSkeleton />}

      {/* Tarjetas por vendedor */}
      {!loadCalc && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ranking.map(({ v, c }, idx) => (
            <VendedorCard
              key={v.id}
              vendedor={v}
              calc={c}
              rank={idx + 1}
              topVentas={topVentas}
              fmt={fmt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: 'primary' | 'success' | 'warning' | 'muted' }) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-500/10 text-emerald-600',
    warning: 'bg-amber-500/10 text-amber-600',
    muted: 'bg-primary/10 text-primary',
  }[tone];
  return (
    <div className="bg-card border border-border rounded p-3 flex items-center gap-3">
      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center', toneClass)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-base font-semibold truncate">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function VendedorCard({ vendedor, calc, rank, topVentas, fmt }: { vendedor: VendedorEsquema; calc: any; rank: number; topVentas: number; fmt: (n: number) => string }) {
  const esquema = vendedor.esquema;
  const total = calc?.total_ventas ?? 0;
  const numV = calc?.num_ventas ?? 0;
  const comision = calc?.comision ?? 0;

  // Detectar meta o siguiente escalón
  let meta = 0;
  let metaLabel = '';
  let metaPct = 0;
  let alcanzado = false;
  let extraInfo: React.ReactNode = null;

  if (esquema.tipo === 'bono_meta') {
    meta = Number(esquema.config?.meta ?? 0);
    metaLabel = `Meta ${fmt(meta)}`;
    metaPct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
    alcanzado = total >= meta && meta > 0;
    const bono = Number(esquema.config?.bono ?? 0);
    extraInfo = (
      <div className="text-xs text-muted-foreground">
        Bono al alcanzar: <span className="font-semibold text-foreground">{fmt(bono)}</span>
      </div>
    );
  } else if (esquema.tipo === 'volumen_tiers') {
    const tiers: any[] = esquema.config?.tiers ?? [];
    const sorted = [...tiers].sort((a, b) => (a.desde ?? 0) - (b.desde ?? 0));
    const current = sorted.find(t => total >= (t.desde ?? 0) && (t.hasta == null || total <= Number(t.hasta)));
    const next = sorted.find(t => (t.desde ?? 0) > total);
    if (next) {
      meta = Number(next.desde ?? 0);
      metaLabel = `Siguiente escalón ${fmt(meta)} (${next.pct ?? 0}%)`;
      metaPct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
      alcanzado = false;
    } else if (current) {
      meta = Number(current.desde ?? 0);
      metaLabel = `Escalón máximo ${current.pct ?? 0}%`;
      metaPct = 100;
      alcanzado = true;
    }
    extraInfo = (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Escalón actual: <span className="font-semibold text-foreground">{current?.pct ?? 0}%</span></div>
        <div className="flex flex-wrap gap-1">
          {sorted.map((t, i) => {
            const active = current && (current.desde === t.desde);
            return (
              <span key={i} className={cn('px-1.5 py-0.5 text-[10px] rounded border',
                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-foreground border-border')}>

                {fmt(t.desde ?? 0)}{t.hasta ? `-${fmt(Number(t.hasta))}` : '+'} · {t.pct ?? 0}%
              </span>
            );
          })}
        </div>
      </div>
    );
  } else if (esquema.tipo === 'volumen_pct') {
    const pct = Number(esquema.config?.pct ?? 0);
    metaLabel = `${pct}% fijo sobre total`;
    metaPct = topVentas > 0 ? Math.min(100, (total / topVentas) * 100) : 0;
    alcanzado = false;
    extraInfo = (
      <div className="text-xs text-muted-foreground">% sobre {esquema.base === 'cobradas' ? 'ventas cobradas' : 'todas las ventas'}</div>
    );
  }

  const barColor = alcanzado ? 'bg-emerald-500' : metaPct >= 75 ? 'bg-amber-500' : metaPct >= 40 ? 'bg-primary' : 'bg-muted-foreground/40';
  const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  return (
    <div className={cn('bg-card border rounded p-3 space-y-3', alcanzado ? 'border-emerald-500/50' : 'border-border')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">{rankBadge}</span>
            <h3 className="font-semibold text-sm truncate">{vendedor.nombre}</h3>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{esquema.nombre} · {esquema.base === 'cobradas' ? 'cobradas' : 'todas'}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Comisión</div>
          <div className={cn('text-lg font-bold font-mono', alcanzado ? 'text-emerald-600' : 'text-primary')}>{fmt(comision)}</div>
        </div>
      </div>

      {/* Total vendido */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Vendido</div>
          <div className="text-xl font-bold font-mono">{fmt(total)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground"># ventas</div>
          <div className="text-sm font-semibold font-mono">{numV}</div>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{metaLabel}</span>
          <span className={cn('font-mono font-semibold', alcanzado ? 'text-emerald-600' : 'text-foreground')}>
            {metaPct.toFixed(0)}%
          </span>
        </div>
        <div className="h-2.5 bg-primary/10 rounded-full overflow-hidden">
          <div className={cn('h-full transition-all rounded-full', barColor)} style={{ width: `${metaPct}%` }} />
        </div>
        {esquema.tipo === 'bono_meta' && meta > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {alcanzado ? (
              <span className="text-emerald-600 font-medium">¡Meta alcanzada! Excedente: {fmt(total - meta)}</span>
            ) : (
              <>Faltan <span className="font-semibold text-foreground">{fmt(meta - total)}</span> para alcanzar la meta</>
            )}
          </div>
        )}
        {esquema.tipo === 'volumen_tiers' && meta > 0 && !alcanzado && (
          <div className="text-[11px] text-muted-foreground">
            Faltan <span className="font-semibold text-foreground">{fmt(meta - total)}</span> para subir de escalón
          </div>
        )}
      </div>

      {extraInfo}
    </div>
  );
}
