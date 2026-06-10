import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Calendar, Trophy, TrendingUp, Target, Award, Crown, Flame, Zap, Medal } from 'lucide-react';
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

const TEAM_COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
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

  const ranking = useMemo(() => {
    return [...(vendedores ?? [])]
      .map((v, i) => ({ v, c: (calculos ?? {})[v.id], color: TEAM_COLORS[i % TEAM_COLORS.length] }))
      .sort((a, b) => (b.c?.total_ventas ?? 0) - (a.c?.total_ventas ?? 0));
  }, [vendedores, calculos]);

  if (loadVend) return <TableSkeleton />;
  if (!vendedores || vendedores.length === 0) {
    return (
      <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
        No hay vendedores con esquema asignado.
      </div>
    );
  }

  const topComision = ranking[0]?.c?.comision ?? 0;
  const topVentas = Math.max(...ranking.map(r => r.c?.total_ventas ?? 0), 0);
  const sumComision = ranking.reduce((s, r) => s + (r.c?.comision ?? 0), 0);
  const sumVentas = ranking.reduce((s, r) => s + (r.c?.total_ventas ?? 0), 0);

  // Podium top 3 (ordenados visualmente: 2°, 1°, 3°)
  const podium = ranking.slice(0, 3);
  const podiumDisplay = [podium[1], podium[0], podium[2]].filter(Boolean);
  const podiumHeights = [podium[1] ? 'h-24' : '', 'h-32', podium[2] ? 'h-20' : ''];

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Ventas del equipo" value={fmt(sumVentas)} tone="primary" />
        <KpiCard icon={<Award className="h-5 w-5" />} label="Comisiones del equipo" value={fmt(sumComision)} tone="success" />
        <KpiCard icon={<Trophy className="h-5 w-5" />} label="Top vendedor" value={ranking[0]?.v.nombre ?? '—'} sub={fmt(topComision)} tone="warning" />
        <KpiCard icon={<Target className="h-5 w-5" />} label="Vendedores con esquema" value={`${vendedores.length}`} tone="primary" />
      </div>

      {loadCalc && <TableSkeleton />}

      {!loadCalc && podium.length > 0 && sumVentas > 0 && (
        <>
          {/* Podio */}
          <div className="bg-gradient-to-br from-primary/5 via-card to-amber-500/5 border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold uppercase tracking-wide">Podio del periodo</h3>
            </div>
            <div className="flex items-end justify-center gap-3 md:gap-6 pt-2">
              {podiumDisplay.map((r, displayIdx) => {
                if (!r) return null;
                const actualRank = r === podium[0] ? 1 : r === podium[1] ? 2 : 3;
                const height = podiumHeights[displayIdx];
                const color = actualRank === 1 ? 'from-amber-400 to-amber-600' : actualRank === 2 ? 'from-slate-300 to-slate-500' : 'from-orange-400 to-orange-700';
                const ringColor = actualRank === 1 ? 'ring-amber-400' : actualRank === 2 ? 'ring-slate-400' : 'ring-orange-500';
                return (
                  <div key={r.v.id} className="flex flex-col items-center gap-2 flex-1 max-w-[180px]">
                    {actualRank === 1 && <Crown className="h-6 w-6 text-amber-500 animate-pulse" />}
                    <div className={cn('relative h-16 w-16 rounded-full bg-white ring-4 flex items-center justify-center font-bold text-lg shadow-lg', ringColor)} style={{ color: r.color }}>
                      {initials(r.v.nombre)}
                      <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white border-2 border-current flex items-center justify-center text-[11px] font-bold">
                        {actualRank}
                      </span>
                    </div>
                    <div className="text-center min-w-0 w-full">
                      <div className="text-xs font-semibold truncate">{r.v.nombre}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{fmt(r.c?.total_ventas ?? 0)}</div>
                    </div>
                    <div className={cn('w-full rounded-t-md bg-gradient-to-t shadow-md flex items-start justify-center pt-1.5 text-white text-xs font-bold', color, height)}>
                      {actualRank}°
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distribución del equipo */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-semibold uppercase tracking-wide">Contribución al equipo</h3>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{fmt(sumVentas)}</span>
            </div>
            <div className="flex h-8 rounded-md overflow-hidden border border-border">
              {ranking.map(r => {
                const pct = sumVentas > 0 ? ((r.c?.total_ventas ?? 0) / sumVentas) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={r.v.id}
                    className="flex items-center justify-center text-[10px] text-white font-semibold transition-all hover:opacity-80"
                    style={{ width: `${pct}%`, backgroundColor: r.color }}
                    title={`${r.v.nombre}: ${fmt(r.c?.total_ventas ?? 0)} (${pct.toFixed(1)}%)`}
                  >
                    {pct >= 8 ? `${pct.toFixed(0)}%` : ''}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {ranking.map(r => (
                <div key={r.v.id} className="flex items-center gap-1.5 text-xs">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: r.color }} />
                  <span className="font-medium">{r.v.nombre}</span>
                  <span className="text-muted-foreground font-mono">{fmt(r.c?.total_ventas ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Tarjetas por vendedor */}
      {!loadCalc && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ranking.map(({ v, c, color }, idx) => (
            <VendedorCard
              key={v.id}
              vendedor={v}
              calc={c}
              rank={idx + 1}
              topVentas={topVentas}
              fmt={fmt}
              color={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: 'primary' | 'success' | 'warning' }) {
  const toneClass = {
    primary: 'from-primary/15 to-primary/5 text-primary border-primary/20',
    success: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 border-emerald-500/20',
    warning: 'from-amber-500/15 to-amber-500/5 text-amber-600 border-amber-500/20',
  }[tone];
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br border rounded-lg p-3 flex items-center gap-3', toneClass)}>
      <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
        <div className="text-base font-bold truncate text-foreground">{value}</div>
        {sub && <div className="text-xs opacity-80 font-mono">{sub}</div>}
      </div>
    </div>
  );
}

// Anillo SVG de progreso
function ProgressRing({ pct, color, size = 96, stroke = 10, children }: { pct: number; color: string; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeOpacity="0.25" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function VendedorCard({ vendedor, calc, rank, topVentas, fmt, color }: { vendedor: VendedorEsquema; calc: any; rank: number; topVentas: number; fmt: (n: number) => string; color: string }) {
  const esquema = vendedor.esquema;
  const total = calc?.total_ventas ?? 0;
  const numV = calc?.num_ventas ?? 0;
  const comision = calc?.comision ?? 0;

  let meta = 0;
  let metaLabel = '';
  let metaPct = 0;
  let alcanzado = false;
  let extraInfo: React.ReactNode = null;
  let subtitulo = '';

  if (esquema.tipo === 'bono_meta') {
    meta = Number(esquema.config?.meta ?? 0);
    metaLabel = `Meta ${fmt(meta)}`;
    metaPct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
    alcanzado = total >= meta && meta > 0;
    const bono = Number(esquema.config?.bono ?? 0);
    subtitulo = `Bono ${fmt(bono)} al alcanzar`;
    extraInfo = alcanzado ? (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
        <Zap className="h-3.5 w-3.5" /> ¡Meta alcanzada! Excedente {fmt(total - meta)}
      </div>
    ) : (
      <div className="text-xs text-muted-foreground bg-primary/5 rounded px-2 py-1.5">
        Faltan <span className="font-bold text-primary">{fmt(meta - total)}</span> para la meta
      </div>
    );
  } else if (esquema.tipo === 'volumen_tiers') {
    const tiers: any[] = esquema.config?.tiers ?? [];
    const sorted = [...tiers].sort((a, b) => (a.desde ?? 0) - (b.desde ?? 0));
    const current = sorted.find(t => total >= (t.desde ?? 0) && (t.hasta == null || total <= Number(t.hasta)));
    const next = sorted.find(t => (t.desde ?? 0) > total);
    if (next) {
      meta = Number(next.desde ?? 0);
      metaLabel = `Siguiente ${fmt(meta)}`;
      metaPct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
      subtitulo = `Escalón actual ${current?.pct ?? 0}% → ${next.pct ?? 0}%`;
    } else if (current) {
      metaLabel = `Tope ${current.pct ?? 0}%`;
      metaPct = 100;
      alcanzado = true;
      subtitulo = `Escalón máximo ${current.pct ?? 0}%`;
    }
    extraInfo = (
      <div className="space-y-1.5">
        <div className="flex gap-1 h-2">
          {sorted.map((t, i) => {
            const active = current && current.desde === t.desde;
            const passed = total >= (t.desde ?? 0);
            return (
              <div key={i} className={cn('flex-1 rounded-full transition-all',
                active ? 'bg-primary' : passed ? 'bg-emerald-500' : 'bg-muted')} />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1">
          {sorted.map((t, i) => {
            const active = current && (current.desde === t.desde);
            return (
              <span key={i} className={cn('px-1.5 py-0.5 text-[10px] rounded border font-mono',
                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-foreground border-border')}>
                {fmt(t.desde ?? 0)}{t.hasta ? `-${fmt(Number(t.hasta))}` : '+'} · {t.pct ?? 0}%
              </span>
            );
          })}
        </div>
        {!alcanzado && meta > 0 && (
          <div className="text-xs text-muted-foreground bg-primary/5 rounded px-2 py-1.5">
            Faltan <span className="font-bold text-primary">{fmt(meta - total)}</span> para subir
          </div>
        )}
      </div>
    );
  } else if (esquema.tipo === 'volumen_pct') {
    const pct = Number(esquema.config?.pct ?? 0);
    metaLabel = `vs Top`;
    metaPct = topVentas > 0 ? Math.min(100, (total / topVentas) * 100) : 0;
    subtitulo = `${pct}% fijo sobre ${esquema.base === 'cobradas' ? 'cobradas' : 'todas'}`;
  }

  const ringColor = alcanzado ? '#10b981' : metaPct >= 75 ? '#f59e0b' : color;
  const rankIcon = rank === 1 ? <Crown className="h-3.5 w-3.5" /> : rank === 2 ? <Medal className="h-3.5 w-3.5" /> : rank === 3 ? <Medal className="h-3.5 w-3.5" /> : null;
  const rankBg = rank === 1 ? 'bg-amber-500 text-white' : rank === 2 ? 'bg-slate-400 text-white' : rank === 3 ? 'bg-orange-500 text-white' : 'bg-muted text-foreground';

  return (
    <div className={cn('relative bg-card border rounded-lg p-4 space-y-3 transition-shadow hover:shadow-md',
      alcanzado ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-border')}>
      {/* Acento de color superior */}
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg" style={{ backgroundColor: ringColor }} />

      {/* Header con anillo */}
      <div className="flex items-start gap-3 pt-1">
        <ProgressRing pct={metaPct} color={ringColor} size={88} stroke={8}>
          <div className="h-14 w-14 rounded-full bg-white border-2 flex items-center justify-center font-bold text-base" style={{ color, borderColor: color }}>
            {initials(vendedor.nombre)}
          </div>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold', rankBg)}>
              {rankIcon} #{rank}
            </span>
            <h3 className="font-bold text-sm truncate flex-1">{vendedor.nombre}</h3>
          </div>
          <div className="text-[10px] text-muted-foreground truncate mb-1.5">{esquema.nombre}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-primary/5 rounded p-1.5">
              <div className="text-[9px] uppercase text-muted-foreground font-semibold">Vendido</div>
              <div className="text-sm font-bold font-mono truncate">{fmt(total)}</div>
            </div>
            <div className={cn('rounded p-1.5', alcanzado ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
              <div className="text-[9px] uppercase text-muted-foreground font-semibold">Comisión</div>
              <div className={cn('text-sm font-bold font-mono truncate', alcanzado ? 'text-emerald-600' : 'text-amber-600')}>{fmt(comision)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra inferior con métricas */}
      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border">
        <span className="text-muted-foreground">{subtitulo}</span>
        <span className="font-mono text-muted-foreground">{numV} ventas · <span className="font-bold text-foreground">{metaPct.toFixed(0)}%</span> {metaLabel}</span>
      </div>

      {extraInfo}
    </div>
  );
}
