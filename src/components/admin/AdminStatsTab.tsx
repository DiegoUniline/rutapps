import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserCheck, UserMinus, Calendar as CalendarIcon, Target, Activity, Heart, Wallet, Repeat, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DollarSign, TrendingUp, CreditCard, Receipt, Users, UserPlus, ArrowRight, PieChart } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RPieChart, Pie, Cell, CartesianGrid, Line } from 'recharts';
import { format, subDays, eachDayOfInterval, startOfMonth, endOfMonth, startOfYear, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';


interface DashboardStats {
  balance_available: number; balance_pending: number; total_invoiced: number;
  total_paid: number; paid_count?: number; total_open: number; open_count?: number;
  active_subscriptions: number; total_customers: number; mrr: number;
}

interface EmpresaRow {
  id: string; nombre: string; created_at: string;
  subscriptions: { status: string; plan_id: string | null; created_at: string; updated_at?: string }[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(142 71% 45%)', 'hsl(var(--destructive))', 'hsl(38 92% 50%)', 'hsl(var(--muted-foreground))'];

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa', trial: 'Trial', past_due: 'Vencida',
  suspended: 'Suspendida', gracia: 'Gracia', cancelada: 'Cancelada', sin_sub: 'Sin sub',
};

const BAJA_STATUSES = ['cancelada', 'canceled', 'suspended', 'past_due'];

const STATS_STALE = 2 * 60 * 1000;

type ClientesTab = 'porcobrar' | 'activos' | 'nuevos' | 'bajas';
type Preset = 'hoy' | '7d' | '30d' | 'mes' | 'ytd' | 'todo' | 'custom';

const fmtMoney = (n: number) =>
  `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCents = (cents: number) => fmtMoney((cents || 0) / 100);
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

export default function AdminStatsTab() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<ClientesTab>('porcobrar');

  // Date filter (default: "a la fecha" — today)
  const [preset, setPreset] = useState<Preset>('hoy');
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date>(new Date());

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === 'hoy') { setFrom(undefined); setTo(now); }
    else if (p === '7d') { setFrom(subDays(now, 7)); setTo(now); }
    else if (p === '30d') { setFrom(subDays(now, 30)); setTo(now); }
    else if (p === 'mes') { setFrom(startOfMonth(now)); setTo(now); }
    else if (p === 'ytd') { setFrom(startOfYear(now)); setTo(now); }
    else if (p === 'todo') { setFrom(undefined); setTo(now); }
  };

  // KPIs (admin-billing edge function)
  const { data: stats, isLoading: loadingStats } = useQuery<DashboardStats | null>({
    queryKey: ['admin-stats-dashboard'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=dashboard_stats`,
        { headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  });

  // Empresas + subs
  const { data: empresasData } = useQuery<EmpresaRow[]>({
    queryKey: ['admin-stats-empresas'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('empresas')
        .select('id, nombre, created_at, subscriptions(status, plan_id, created_at, updated_at)')
        .order('created_at', { ascending: true });
      return (data as any) || [];
    },
  });
  const empresas = empresasData || [];

  // Facturas pendientes
  const { data: facturasPendientes } = useQuery({
    queryKey: ['admin-stats-facturas-pendientes'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('facturas')
        .select('id, total, fecha_emision, fecha_vencimiento, concepto, numero_factura, empresa_id, empresas(nombre)')
        .eq('estado', 'pendiente')
        .order('fecha_emision', { ascending: false });
      return (data as any[]) || [];
    },
  });
  const pendientes = facturasPendientes || [];
  const totalPendientesLocal = pendientes.reduce((s, f) => s + Number(f.total || 0), 0);

  // Facturas pagadas (para ingresos por fecha)
  const { data: facturasPagadas } = useQuery({
    queryKey: ['admin-stats-facturas-pagadas'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('facturas')
        .select('id, total, fecha_pago, fecha_emision, estado, empresa_id')
        .eq('estado', 'pagada')
        .order('fecha_pago', { ascending: false });
      return (data as any[]) || [];
    },
  });
  const pagadas = facturasPagadas || [];

  // ── A la fecha (cumulativo hasta `to`) ──
  const aLaFecha = useMemo(() => {
    const endTs = to.getTime();
    const altas = empresas.filter(e => new Date(e.created_at).getTime() <= endTs).length;
    const activos = empresas.filter(e =>
      e.subscriptions?.some(s => s.status === 'active' && new Date(s.created_at).getTime() <= endTs)
    ).length;
    const bajas = empresas.filter(e =>
      e.subscriptions?.some(s => BAJA_STATUSES.includes(s.status) && new Date(s.updated_at || s.created_at).getTime() <= endTs)
    ).length;
    const ingresos = pagadas
      .filter(f => f.fecha_pago && new Date(f.fecha_pago).getTime() <= endTs)
      .reduce((s, f) => s + Number(f.total || 0), 0);
    return { altas, activos, bajas, ingresos };
  }, [empresas, pagadas, to]);

  // ── En rango (entre `from` y `to`) ──
  const enRango = useMemo(() => {
    const startTs = from ? from.getTime() : 0;
    const endTs = to.getTime();
    const inRange = (d: string | null | undefined) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= startTs && t <= endTs;
    };
    const altas = empresas.filter(e => inRange(e.created_at)).length;
    const bajas = empresas.filter(e =>
      e.subscriptions?.some(s => BAJA_STATUSES.includes(s.status) && inRange(s.updated_at || s.created_at))
    ).length;
    const ingresos = pagadas
      .filter(f => inRange(f.fecha_pago))
      .reduce((s, f) => s + Number(f.total || 0), 0);
    const nuevosPagados = empresas.filter(e =>
      inRange(e.created_at) && e.subscriptions?.some(s => s.status === 'active')
    ).length;
    const trials = empresas.filter(e =>
      inRange(e.created_at) && e.subscriptions?.some(s => s.status === 'trial')
    ).length;
    return { altas, bajas, ingresos, nuevosPagados, trials };
  }, [empresas, pagadas, from, to]);

  // ── Este mes (fijo) ──
  const esteMes = useMemo(() => {
    const start = startOfMonth(new Date()).getTime();
    const end = endOfMonth(new Date()).getTime();
    const altas = empresas.filter(e => {
      const t = new Date(e.created_at).getTime();
      return t >= start && t <= end;
    }).length;
    const bajas = empresas.filter(e =>
      e.subscriptions?.some(s => {
        const t = new Date(s.updated_at || s.created_at).getTime();
        return BAJA_STATUSES.includes(s.status) && t >= start && t <= end;
      })
    ).length;
    const ingresos = pagadas
      .filter(f => {
        if (!f.fecha_pago) return false;
        const t = new Date(f.fecha_pago).getTime();
        return t >= start && t <= end;
      })
      .reduce((s, f) => s + Number(f.total || 0), 0);
    return { altas, bajas, ingresos };
  }, [empresas, pagadas]);

  // ── SaaS BI ──
  const bi = useMemo(() => {
    const activos = aLaFecha.activos;
    const altas = aLaFecha.altas;
    const bajas = aLaFecha.bajas;

    // Trial→Pago conversion = activos / total registros
    const conversion = altas > 0 ? (activos / altas) * 100 : 0;
    const demosPor100 = altas > 0 ? Math.round((activos / altas) * 100) : 0;

    // Churn mensual = bajas este mes / activos al inicio del mes (aprox activos actuales)
    const churn = activos > 0 ? (esteMes.bajas / activos) * 100 : 0;
    const retencion = 100 - churn;

    // ARPU = MRR / activos (MRR viene en centavos)
    const mrrPesos = (stats?.mrr || 0) / 100;
    const arpu = activos > 0 ? mrrPesos / activos : 0;

    // LTV = ARPU / churn_rate (mensual decimal)
    const churnDec = churn / 100;
    const ltv = churnDec > 0 ? arpu / churnDec : arpu * 24; // si churn=0, asumir 24 meses

    // Tiempo promedio a primera factura pagada
    const tiempos: number[] = [];
    empresas.forEach(e => {
      const pagada = pagadas
        .filter(f => f.empresa_id === e.id && f.fecha_pago)
        .sort((a, b) => new Date(a.fecha_pago).getTime() - new Date(b.fecha_pago).getTime())[0];
      if (pagada) {
        const d = differenceInDays(new Date(pagada.fecha_pago), new Date(e.created_at));
        if (d >= 0 && d < 365) tiempos.push(d);
      }
    });
    const tiempoAvg = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;

    // Net New MRR este mes (aprox por nuevos pagados)
    const nuevosPagadosEsteMes = empresas.filter(e => {
      const t = new Date(e.created_at).getTime();
      const start = startOfMonth(new Date()).getTime();
      return t >= start && e.subscriptions?.some(s => s.status === 'active');
    }).length;
    const netNewMRR = activos > 0 ? (mrrPesos / activos) * nuevosPagadosEsteMes : 0;

    return { conversion, demosPor100, churn, retencion, arpu, ltv, tiempoAvg, netNewMRR };
  }, [aLaFecha, esteMes, empresas, pagadas, stats]);

  // Bajas / Activos / Nuevos detalle
  const bajas = useMemo(() => {
    return empresas
      .filter(e => e.subscriptions?.some(s => BAJA_STATUSES.includes(s.status)))
      .map(e => ({ ...e, status: e.subscriptions?.[0]?.status || 'cancelada' }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [empresas]);

  const activos = useMemo(() => {
    return empresas
      .filter(e => e.subscriptions?.some(s => s.status === 'active'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [empresas]);

  const nuevosEsteMesPagados = useMemo(() => {
    const inicioMes = startOfMonth(new Date());
    return empresas
      .filter(e => new Date(e.created_at) >= inicioMes && e.subscriptions?.some(s => s.status === 'active'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [empresas]);

  // Charts data
  const signupsByDay = useMemo(() => {
    if (!empresas.length) return [];
    const start = subDays(new Date(), days);
    const interval = eachDayOfInterval({ start, end: new Date() });
    const counts: Record<string, number> = {};
    interval.forEach(d => { counts[format(d, 'yyyy-MM-dd')] = 0; });
    empresas.forEach(e => {
      const day = format(new Date(e.created_at), 'yyyy-MM-dd');
      if (counts[day] !== undefined) counts[day]++;
    });
    let cum = empresas.filter(e => new Date(e.created_at) < start).length;
    return Object.entries(counts).map(([date, count]) => {
      cum += count;
      return { date, label: format(new Date(date), 'dd MMM', { locale: es }), nuevas: count, total: cum };
    });
  }, [empresas, days]);

  const conversionData = useMemo(() => {
    const total = empresas.length;
    const withSub = empresas.filter(e => e.subscriptions?.length > 0).length;
    const active = empresas.filter(e => e.subscriptions?.some(s => s.status === 'active')).length;
    const trial = empresas.filter(e => e.subscriptions?.some(s => s.status === 'trial')).length;
    return [
      { name: 'Registros', value: total, pct: 100 },
      { name: 'Con suscripción', value: withSub, pct: total ? Math.round(withSub / total * 100) : 0 },
      { name: 'En trial', value: trial, pct: total ? Math.round(trial / total * 100) : 0 },
      { name: 'Activas (pagando)', value: active, pct: total ? Math.round(active / total * 100) : 0 },
    ];
  }, [empresas]);

  const statusDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    empresas.forEach(e => {
      const status = e.subscriptions?.[0]?.status || 'sin_sub';
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
    }));
  }, [empresas]);

  const recentSignups = useMemo(() => {
    return [...empresas]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10) as (EmpresaRow & { nombre: string })[];
  }, [empresas]);

  const rangeLabel = preset === 'hoy' ? 'Hoy'
    : preset === 'todo' ? 'Histórico'
    : from ? `${format(from, 'dd MMM', { locale: es })} → ${format(to, 'dd MMM yyyy', { locale: es })}`
    : `al ${format(to, 'dd MMM yyyy', { locale: es })}`;

  return (
    <div className="space-y-6">
      {/* ── Filtro de fecha ── */}
      <Card className="border border-border/60 shadow-sm">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground mr-2 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" /> Periodo:
            </span>
            {([
              { k: 'hoy', l: 'A la fecha' },
              { k: '7d', l: '7 días' },
              { k: '30d', l: '30 días' },
              { k: 'mes', l: 'Mes actual' },
              { k: 'ytd', l: 'Año' },
              { k: 'todo', l: 'Histórico' },
            ] as { k: Preset; l: string }[]).map(p => (
              <button
                key={p.k}
                onClick={() => applyPreset(p.k)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  preset === p.k
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                )}
              >
                {p.l}
              </button>
            ))}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 text-xs',
                    preset === 'custom' && 'border-primary text-primary'
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {preset === 'custom' && from
                    ? `${format(from, 'dd/MM/yy')} - ${format(to, 'dd/MM/yy')}`
                    : 'Personalizado'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <Calendar
                  mode="range"
                  selected={{ from, to }}
                  onSelect={(r: any) => {
                    if (r?.from) setFrom(r.from);
                    if (r?.to) setTo(r.to);
                    setPreset('custom');
                  }}
                  numberOfMonths={2}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <span className="ml-auto text-[11px] text-muted-foreground font-medium">{rangeLabel}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── A LA FECHA (cumulativo) ── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          A la fecha {preset !== 'hoy' && preset !== 'todo' && `(${format(to, 'dd MMM yyyy', { locale: es })})`}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
          {loadingStats && (
            <div className="absolute -top-2 right-0 text-[10px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Actualizando…
            </div>
          )}
          <StatCard icon={UserPlus} label="Altas a la fecha" value={aLaFecha.altas.toString()} accent="primary" />
          <StatCard icon={UserCheck} label="Activos a la fecha" value={aLaFecha.activos.toString()} accent="success" />
          <StatCard icon={DollarSign} label="Ingresos a la fecha" value={fmtMoney(aLaFecha.ingresos)} accent="success" />
          <StatCard icon={UserMinus} label="Bajas a la fecha" value={aLaFecha.bajas.toString()} accent="destructive" />
        </div>
      </div>

      {/* ── ESTE MES (fijo) ── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          Este mes ({format(new Date(), 'MMMM yyyy', { locale: es })})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={UserPlus} label="Altas este mes" value={esteMes.altas.toString()} accent="primary" />
          <StatCard icon={UserMinus} label="Bajas este mes" value={esteMes.bajas.toString()} accent="destructive" />
          <StatCard icon={DollarSign} label="Ingresos este mes" value={fmtMoney(esteMes.ingresos)} accent="success" />
        </div>
      </div>

      {/* ── SaaS BUSINESS INTELLIGENCE ── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" /> Inteligencia SaaS
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Target}
            label="Tasa de conversión"
            value={fmtPct(bi.conversion)}
            hint={`${bi.demosPor100} de cada 100 registros pagan`}
            accent="primary"
          />
          <StatCard
            icon={Activity}
            label="Churn mensual"
            value={fmtPct(bi.churn)}
            hint={`${esteMes.bajas} bajas / ${aLaFecha.activos} activos`}
            accent={bi.churn > 5 ? 'destructive' : 'success'}
          />
          <StatCard
            icon={Wallet}
            label="ARPU"
            value={fmtMoney(bi.arpu)}
            hint="Ingreso promedio por cliente"
            accent="primary"
          />
          <StatCard
            icon={Heart}
            label="LTV"
            value={fmtMoney(bi.ltv)}
            hint="Valor de vida del cliente"
            accent="success"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatCard
            icon={Repeat}
            label="Retención"
            value={fmtPct(bi.retencion)}
            hint="Inversa del churn"
            accent="success"
          />
          <StatCard
            icon={TrendingUp}
            label="MRR"
            value={fmtCents(stats?.mrr || 0)}
            hint={`${aLaFecha.activos} cuentas activas`}
            accent="primary"
          />
          <StatCard
            icon={Zap}
            label="Net New MRR"
            value={fmtMoney(bi.netNewMRR)}
            hint="Nuevo ingreso recurrente del mes"
            accent="success"
          />
          <StatCard
            icon={CalendarIcon}
            label="Días a primer pago"
            value={`${Math.round(bi.tiempoAvg)} d`}
            hint="Promedio registro → factura pagada"
            accent="muted"
          />
        </div>
      </div>

      {/* ── COBRANZA & FACTURACIÓN ── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Cobranza</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={CreditCard} label="Por cobrar" value={fmtCents(stats?.total_open || 0)} hint={`${pendientes.length} pendientes`} accent="destructive" />
          <StatCard icon={Receipt} label="Total facturado" value={fmtCents(stats?.total_invoiced || 0)} accent="muted" />
          <StatCard icon={DollarSign} label="Total pagado histórico" value={fmtCents(stats?.total_paid || 0)} hint={stats?.paid_count ? `${stats.paid_count} facturas` : undefined} accent="success" />
          <StatCard icon={Users} label="Total empresas" value={empresas.length.toString()} accent="primary" />
        </div>
      </div>

      {/* Tabs de detalle */}
      <Card className="border border-border/60 shadow-sm">
        <CardContent className="pt-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as ClientesTab)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="porcobrar">Por cobrar ({pendientes.length})</TabsTrigger>
              <TabsTrigger value="activos">Activos ({activos.length})</TabsTrigger>
              <TabsTrigger value="nuevos">Nuevos mes ({nuevosEsteMesPagados.length})</TabsTrigger>
              <TabsTrigger value="bajas">Bajas ({bajas.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="porcobrar" className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-destructive" /> Facturas pendientes</span>
                <span className="text-xs font-semibold text-destructive">Total local: {fmtMoney(totalPendientesLocal)}</span>
              </div>
              {pendientes.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Sin facturas pendientes</div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {pendientes.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between text-xs bg-accent/30 rounded-lg px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{f.empresas?.nombre || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {f.numero_factura ? `${f.numero_factura} · ` : ''}
                          {f.concepto || 'Suscripción'} ·
                          Emitida {f.fecha_emision ? format(new Date(f.fecha_emision), 'dd MMM yyyy', { locale: es }) : '—'}
                          {f.fecha_vencimiento ? ` · Vence ${format(new Date(f.fecha_vencimiento), 'dd MMM yyyy', { locale: es })}` : ''}
                        </div>
                      </div>
                      <span className="font-semibold text-destructive ml-3 shrink-0">
                        {fmtMoney(Number(f.total))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="activos" className="mt-4">
              <EmpresaList
                rows={activos.map(e => ({ id: e.id, nombre: e.nombre, fecha: e.created_at, badge: 'Activa' }))}
                accent="success"
              />
            </TabsContent>

            <TabsContent value="nuevos" className="mt-4">
              <EmpresaList
                rows={nuevosEsteMesPagados.map(e => ({ id: e.id, nombre: e.nombre, fecha: e.created_at, badge: 'Activa' }))}
                accent="primary"
              />
            </TabsContent>

            <TabsContent value="bajas" className="mt-4">
              <EmpresaList
                rows={bajas.map((e: any) => ({ id: e.id, nombre: e.nombre, fecha: e.created_at, badge: STATUS_LABELS[e.status] || e.status }))}
                accent="destructive"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Nuevos registros por día */}
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Nuevos registros por día
            </CardTitle>
            <div className="flex gap-1">
              {[7, 14, 30, 60].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${days === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={signupsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [value, name === 'nuevas' ? 'Nuevas' : 'Acumulado']}
                />
                <Bar dataKey="nuevas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {recentSignups.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Últimas altas</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {recentSignups.map(e => {
                  const sub = e.subscriptions?.[0];
                  const status = sub?.status || 'sin_sub';
                  const statusLabel = STATUS_LABELS[status] || status;
                  return (
                    <div key={e.id} className="flex items-center justify-between text-xs bg-accent/30 rounded-lg px-3 py-1.5">
                      <div>
                        <span className="font-medium text-foreground">{e.nombre}</span>
                        <span className="text-muted-foreground ml-2">{format(new Date(e.created_at), "dd MMM yyyy, HH:mm", { locale: es })}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border font-medium">{statusLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel + Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" /> Embudo de conversión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conversionData.map((step, i) => (
                <div key={step.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{step.name}</span>
                    <span className="text-xs text-muted-foreground">{step.value} ({step.pct}%)</span>
                  </div>
                  <div className="h-7 bg-card rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max(step.pct, 5)}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">{step.pct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Distribución por status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                  >
                    {statusDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  />
                </RPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent }: {
  icon: any; label: string; value: string; hint?: string;
  accent: 'primary' | 'success' | 'destructive' | 'muted';
}) {
  const accentMap = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    destructive: 'text-destructive bg-destructive/10',
    muted: 'text-muted-foreground bg-card/80',
  };
  const [iconColor, iconBg] = accentMap[accent].split(' ');

  return (
    <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
            {hint && <div className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmpresaList({ accent, rows }: {
  accent: 'primary' | 'success' | 'destructive' | 'muted';
  rows: { id: string; nombre: string; fecha: string; badge: string }[];
}) {
  const accentColor = {
    primary: 'text-primary',
    success: 'text-success',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
  }[accent];

  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">Sin registros</div>;
  }
  return (
    <div className="space-y-1 max-h-96 overflow-y-auto">
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs bg-accent/30 rounded-lg px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground truncate">{r.nombre}</div>
            <div className="text-[10px] text-muted-foreground">
              Registrada {format(new Date(r.fecha), "dd MMM yyyy", { locale: es })}
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full bg-card border border-border font-medium ml-3 shrink-0 ${accentColor}`}>
            {r.badge}
          </span>
        </div>
      ))}
    </div>
  );
}
