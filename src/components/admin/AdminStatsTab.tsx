import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, UserCheck, UserMinus, Calendar as CalendarIcon, Target, Activity,
  Heart, Wallet, Repeat, Zap, DollarSign, TrendingUp, CreditCard, Users, UserPlus,
  ArrowRight, LayoutDashboard, TrendingDown, BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RPieChart, Pie, Cell, CartesianGrid, Line, AreaChart, Area, Legend,
} from 'recharts';
import {
  format, subDays, eachDayOfInterval, startOfMonth, endOfMonth,
  startOfYear, differenceInDays, subMonths, eachMonthOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';

interface DashboardStats {
  balance_available: number; balance_pending: number; total_invoiced: number;
  total_paid: number; paid_count?: number; total_open: number; open_count?: number;
  active_subscriptions: number; total_customers: number; mrr: number;
}

interface EmpresaRow {
  id: string; nombre: string; created_at: string;
  subscriptions: { status: string; plan_id: string | null; created_at: string; updated_at?: string; current_period_end?: string | null; fecha_vencimiento?: string | null; trial_ends_at?: string | null }[];
}

interface FacturaRow {
  id: string; total: number; fecha_emision: string | null; fecha_pago: string | null;
  fecha_vencimiento: string | null; estado: string; empresa_id: string;
  metodo_pago: string | null; stripe_payment_intent_id: string | null;
  numero_factura?: string | null; concepto?: string | null;
  empresas?: { nombre: string } | null;
}

const PRIMARY = 'hsl(var(--primary))';
const SUCCESS = 'hsl(var(--success))';
const DANGER = 'hsl(var(--destructive))';
const MUTED = 'hsl(var(--muted-foreground))';
const WARN = 'hsl(38 92% 50%)';
const COLORS = [PRIMARY, SUCCESS, WARN, DANGER, 'hsl(280 70% 55%)', MUTED];

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa', trial: 'Trial', past_due: 'Vencida',
  suspended: 'Suspendida', gracia: 'Gracia', cancelada: 'Cancelada', sin_sub: 'Sin sub',
};
const BAJA_STATUSES = ['cancelada', 'canceled', 'cancelled', 'suspended', 'expired'];
// Fecha efectiva de baja:
//  - Trial que no pagó: trial_ends_at (día siguiente al alta sin pago).
//  - Cliente que pagaba y dejó de pagar: current_period_end (cuando terminó su acceso).
// NUNCA usar updated_at: el cron de cobros toca todas las filas y rompe el cálculo.
const bajaDate = (s: { current_period_end?: string | null; fecha_vencimiento?: string | null; trial_ends_at?: string | null; updated_at?: string | null; created_at: string }) =>
  s.current_period_end || s.fecha_vencimiento || s.trial_ends_at || s.created_at;
const STATS_STALE = 2 * 60 * 1000;

type Preset = 'hoy' | '7d' | '30d' | 'mes' | 'ytd' | 'todo' | 'custom';

const fmtMoney = (n: number) =>
  `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtMoney2 = (n: number) =>
  `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCents = (cents: number) => fmtMoney2((cents || 0) / 100);
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

const isCollected = (f: FacturaRow) =>
  f.estado === 'pagada' && (!!f.stripe_payment_intent_id || f.metodo_pago === 'transferencia');

const methodLabel = (f: FacturaRow) =>
  f.stripe_payment_intent_id ? 'Stripe' : f.metodo_pago === 'transferencia' ? 'Transferencia' : 'Otro';

export default function AdminStatsTab() {
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

  const { data: empresasData } = useQuery<EmpresaRow[]>({
    queryKey: ['admin-stats-empresas'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('empresas')
        .select('id, nombre, created_at, subscriptions(status, plan_id, created_at, updated_at, current_period_end, fecha_vencimiento, trial_ends_at)')
        .order('created_at', { ascending: true });
      return (data as any) || [];
    },
  });
  const empresas = empresasData || [];

  const { data: facturasAll } = useQuery<FacturaRow[]>({
    queryKey: ['admin-stats-facturas-all'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('facturas')
        .select('id, total, fecha_emision, fecha_pago, fecha_vencimiento, estado, empresa_id, metodo_pago, stripe_payment_intent_id, numero_factura, concepto, empresas(nombre)')
        .order('fecha_emision', { ascending: false });
      return (data as any) || [];
    },
  });
  const facturas = facturasAll || [];
  const pendientes = facturas.filter(f => f.estado === 'pendiente');
  const cobradas = facturas.filter(isCollected);
  const totalPendientesLocal = pendientes.reduce((s, f) => s + Number(f.total || 0), 0);

  // ── Stripe invoices (todas, agrupadas por status) ──
  const { data: stripeInvoices, isLoading: loadingStripeInv } = useQuery<any[]>({
    queryKey: ['admin-stats-stripe-invoices'],
    staleTime: STATS_STALE,
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return [];
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices&status=all`,
        { headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await res.json();
      return data?.invoices || [];
    },
  });
  const stripeInvs = stripeInvoices || [];



  // ── A la fecha ──
  const aLaFecha = useMemo(() => {
    const endTs = to.getTime();
    const altas = empresas.filter(e => new Date(e.created_at).getTime() <= endTs).length;
    const activos = empresas.filter(e =>
      e.subscriptions?.some(s => s.status === 'active' && new Date(s.created_at).getTime() <= endTs)
    ).length;
    const bajas = empresas.filter(e =>
      e.subscriptions?.some(s => BAJA_STATUSES.includes(s.status) && new Date(bajaDate(s)).getTime() <= endTs)
    ).length;
    const ingresos = cobradas
      .filter(f => f.fecha_pago && new Date(f.fecha_pago).getTime() <= endTs)
      .reduce((s, f) => s + Number(f.total || 0), 0);
    return { altas, activos, bajas, ingresos };
  }, [empresas, cobradas, to]);

  // ── Este mes ──
  const esteMes = useMemo(() => {
    const start = startOfMonth(new Date()).getTime();
    const end = endOfMonth(new Date()).getTime();
    const inWin = (d: string | null | undefined) => {
      if (!d) return false; const t = new Date(d).getTime();
      return t >= start && t <= end;
    };
    return {
      altas: empresas.filter(e => inWin(e.created_at)).length,
      bajas: empresas.filter(e => e.subscriptions?.some(s => BAJA_STATUSES.includes(s.status) && inWin(bajaDate(s)))).length,
      ingresos: cobradas.filter(f => inWin(f.fecha_pago)).reduce((s, f) => s + Number(f.total || 0), 0),
    };
  }, [empresas, cobradas]);

  // ── BI ──
  const bi = useMemo(() => {
    const activos = aLaFecha.activos;
    const altas = aLaFecha.altas;
    const conversion = altas > 0 ? (activos / altas) * 100 : 0;
    const demosPor100 = Math.round(conversion);
    const churn = activos > 0 ? (esteMes.bajas / activos) * 100 : 0;
    const retencion = 100 - churn;
    const mrrPesos = (stats?.mrr || 0) / 100;
    const arpu = activos > 0 ? mrrPesos / activos : 0;
    const churnDec = churn / 100;
    const ltv = churnDec > 0 ? arpu / churnDec : arpu * 24;
    const tiempos: number[] = [];
    empresas.forEach(e => {
      const pagada = cobradas
        .filter(f => f.empresa_id === e.id && f.fecha_pago)
        .sort((a, b) => new Date(a.fecha_pago!).getTime() - new Date(b.fecha_pago!).getTime())[0];
      if (pagada) {
        const d = differenceInDays(new Date(pagada.fecha_pago!), new Date(e.created_at));
        if (d >= 0 && d < 365) tiempos.push(d);
      }
    });
    const tiempoAvg = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
    const nuevosPagadosEsteMes = empresas.filter(e => {
      const t = new Date(e.created_at).getTime();
      return t >= startOfMonth(new Date()).getTime() && e.subscriptions?.some(s => s.status === 'active');
    }).length;
    const netNewMRR = activos > 0 ? (mrrPesos / activos) * nuevosPagadosEsteMes : 0;
    return { conversion, demosPor100, churn, retencion, arpu, ltv, tiempoAvg, netNewMRR };
  }, [aLaFecha, esteMes, empresas, cobradas, stats]);

  // ── Series mensuales últimos 12 meses ──
  const monthlySeries = useMemo(() => {
    const months = eachMonthOfInterval({ start: subMonths(new Date(), 11), end: new Date() });
    let cumAltas = 0, cumActivos = 0, cumBajas = 0;

    return months.map(m => {
      const ms = startOfMonth(m).getTime();
      const me = endOfMonth(m).getTime();
      const altas = empresas.filter(e => {
        const t = new Date(e.created_at).getTime();
        return t >= ms && t <= me;
      }).length;
      const bajas = empresas.filter(e =>
        e.subscriptions?.some(s => {
          const t = new Date(bajaDate(s)).getTime();
          return BAJA_STATUSES.includes(s.status) && t >= ms && t <= me;
        })
      ).length;
      const ingresos = cobradas.filter(f => {
        if (!f.fecha_pago) return false;
        const t = new Date(f.fecha_pago).getTime();
        return t >= ms && t <= me;
      }).reduce((s, f) => s + Number(f.total || 0), 0);
      const stripeIng = cobradas.filter(f => {
        if (!f.fecha_pago || !f.stripe_payment_intent_id) return false;
        const t = new Date(f.fecha_pago).getTime();
        return t >= ms && t <= me;
      }).reduce((s, f) => s + Number(f.total || 0), 0);
      const transfIng = ingresos - stripeIng;
      const activosMes = empresas.filter(e =>
        e.subscriptions?.some(s => s.status === 'active' && new Date(s.created_at).getTime() <= me)
      ).length;
      cumAltas += altas; cumBajas += bajas; cumActivos = activosMes;
      const churnMes = activosMes > 0 ? (bajas / activosMes) * 100 : 0;
      return {
        mes: format(m, 'MMM yy', { locale: es }),
        altas, bajas, ingresos, stripeIng, transfIng,
        netNew: altas - bajas, activos: activosMes,
        cumAltas, cumBajas, churn: Number(churnMes.toFixed(1)),
      };
    });
  }, [empresas, cobradas]);

  // ── Top empresas pagadoras ──
  const topPagadoras = useMemo(() => {
    const map: Record<string, { id: string; nombre: string; total: number; count: number }> = {};
    cobradas.forEach(f => {
      const key = f.empresa_id;
      const nombre = f.empresas?.nombre || '—';
      if (!map[key]) map[key] = { id: key, nombre, total: 0, count: 0 };
      map[key].total += Number(f.total || 0);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [cobradas]);

  // ── Distribución por método ──
  const metodoDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    cobradas.forEach(f => {
      const k = methodLabel(f);
      map[k] = (map[k] || 0) + Number(f.total || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [cobradas]);

  // ── Status distribution ──
  const statusDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    empresas.forEach(e => {
      const status = e.subscriptions?.[0]?.status || 'sin_sub';
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status, value: count,
    }));
  }, [empresas]);

  // ── Funnel ──
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

  // ── Daily signups (últimos 60d) ──
  const signupsByDay = useMemo(() => {
    if (!empresas.length) return [];
    const start = subDays(new Date(), 60);
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
  }, [empresas]);

  // ── Bajas recientes ──
  const bajasRecientes = useMemo(() => {
    return empresas
      .filter(e => e.subscriptions?.some(s => BAJA_STATUSES.includes(s.status)))
      .map(e => ({
        ...e,
        status: e.subscriptions?.find(s => BAJA_STATUSES.includes(s.status))?.status || 'cancelada',
        fechaBaja: (() => { const s = e.subscriptions?.find(x => BAJA_STATUSES.includes(x.status)); return s ? bajaDate(s) : e.created_at; })(),
      }))
      .sort((a, b) => new Date(b.fechaBaja).getTime() - new Date(a.fechaBaja).getTime())
      .slice(0, 15);
  }, [empresas]);

  const rangeLabel = preset === 'hoy' ? 'Hoy'
    : preset === 'todo' ? 'Histórico'
    : from ? `${format(from, 'dd MMM', { locale: es })} → ${format(to, 'dd MMM yyyy', { locale: es })}`
    : `al ${format(to, 'dd MMM yyyy', { locale: es })}`;

  const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-4">
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
                <Button variant="outline" size="sm" className={cn('h-8 text-xs', preset === 'custom' && 'border-primary text-primary')}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {preset === 'custom' && from ? `${format(from, 'dd/MM/yy')} - ${format(to, 'dd/MM/yy')}` : 'Personalizado'}
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

      {/* ── TABS ── */}
      <Tabs defaultValue="panel">
        <TabsList className="grid grid-cols-5 w-full">
          {[
            { v: 'panel', icon: LayoutDashboard, l: 'Panel' },
            { v: 'altas', icon: UserPlus, l: 'Altas' },
            { v: 'bajas', icon: UserMinus, l: 'Bajas' },
            { v: 'ingresos', icon: DollarSign, l: 'Ingresos' },
            { v: 'salud', icon: Activity, l: 'Salud SaaS' },
          ].map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />{t.l}
              </TabsTrigger>
            );
          })}
        </TabsList>


        {/* ──────────── PANEL ──────────── */}
        <TabsContent value="panel" className="space-y-4 mt-4">
          <Story
            title="Resumen del negocio"
            subtitle={`Tu plataforma tiene ${aLaFecha.activos} cuentas pagando, ${esteMes.altas} altas y ${esteMes.bajas} bajas este mes.`}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
            {loadingStats && (
              <div className="absolute -top-2 right-0 text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Actualizando…
              </div>
            )}
            <StatCard icon={UserPlus} label="Altas a la fecha" value={aLaFecha.altas.toString()} accent="primary" />
            <StatCard icon={UserCheck} label="Activos a la fecha" value={aLaFecha.activos.toString()} accent="success" />
            <StatCard icon={DollarSign} label="Ingresos cobrados" value={fmtMoney(aLaFecha.ingresos)} hint={`${cobradas.length} facturas reales`} accent="success" />
            <StatCard icon={UserMinus} label="Bajas a la fecha" value={aLaFecha.bajas.toString()} accent="destructive" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard icon={UserPlus} label="Altas este mes" value={esteMes.altas.toString()} accent="primary" />
            <StatCard icon={UserMinus} label="Bajas este mes" value={esteMes.bajas.toString()} accent="destructive" />
            <StatCard icon={DollarSign} label="Ingresos este mes" value={fmtMoney(esteMes.ingresos)} accent="success" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartCard title="Ingresos cobrados (12 meses)" subtitle={`Stripe + Transferencia · ${fmtMoney(monthlySeries.reduce((s, m) => s + m.ingresos, 0))} total`} icon={DollarSign}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlySeries}>
                  <defs>
                    <linearGradient id="gIng" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SUCCESS} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={SUCCESS} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis tick={{ fontSize: 10 }} stroke={MUTED} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney2(v)} />
                  <Area type="monotone" dataKey="ingresos" stroke={SUCCESS} strokeWidth={2} fill="url(#gIng)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Altas vs Bajas (12 meses)" subtitle="Crecimiento neto del negocio" icon={TrendingUp}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="altas" fill={PRIMARY} radius={[3, 3, 0, 0]} name="Altas" />
                  <Bar dataKey="bajas" fill={DANGER} radius={[3, 3, 0, 0]} name="Bajas" />
                  <Line type="monotone" dataKey="netNew" stroke={SUCCESS} strokeWidth={2} dot name="Neto" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Distribución de cuentas" subtitle={`${empresas.length} empresas totales`} icon={Users}>
              <ResponsiveContainer width="100%" height={240}>
                <RPieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}>
                    {statusDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </RPieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Facturas de Stripe (todas, agrupadas por status) ── */}
          <StripeInvoicesTable invoices={stripeInvs} loading={loadingStripeInv} />
        </TabsContent>


        {/* ──────────── ALTAS ──────────── */}
        <TabsContent value="altas" className="space-y-4 mt-4">
          <Story
            title="Historia de tus altas"
            subtitle={`Llevas ${aLaFecha.altas} registros históricos. Este mes entraron ${esteMes.altas}. De cada 100 que se registran, ${bi.demosPor100} terminan pagando.`}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={UserPlus} label="Altas históricas" value={aLaFecha.altas.toString()} accent="primary" />
            <StatCard icon={UserPlus} label="Altas este mes" value={esteMes.altas.toString()} accent="primary" />
            <StatCard icon={Target} label="Conversión a pago" value={fmtPct(bi.conversion)} hint={`${bi.demosPor100} de 100`} accent="success" />
            <StatCard icon={CalendarIcon} label="Días a primer pago" value={`${Math.round(bi.tiempoAvg)} d`} accent="muted" />
          </div>

          <ChartCard title="Registros por día (60 días)" subtitle="Tendencia diaria + acumulado" icon={UserPlus}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={signupsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke={MUTED} />
                <YAxis yAxisId="L" allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                <YAxis yAxisId="R" orientation="right" allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="L" dataKey="nuevas" fill={PRIMARY} radius={[3, 3, 0, 0]} name="Nuevas/día" />
                <Line yAxisId="R" type="monotone" dataKey="total" stroke={SUCCESS} strokeWidth={2} dot={false} name="Acumulado" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Altas mensuales (12 meses)" subtitle="Estacionalidad de adquisición" icon={BarChart3}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlySeries}>
                  <defs>
                    <linearGradient id="gAltas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="altas" stroke={PRIMARY} strokeWidth={2} fill="url(#gAltas)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Embudo de conversión" subtitle="De registro a cliente pagando" icon={ArrowRight}>
              <div className="space-y-3 py-2">
                {conversionData.map((step, i) => (
                  <div key={step.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{step.name}</span>
                      <span className="text-xs text-muted-foreground">{step.value} ({step.pct}%)</span>
                    </div>
                    <div className="h-8 bg-card rounded-lg overflow-hidden border border-border">
                      <div className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-3"
                        style={{ width: `${Math.max(step.pct, 5)}%`, backgroundColor: COLORS[i % COLORS.length] }}>
                        <span className="text-[10px] font-bold text-white drop-shadow">{step.pct}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </TabsContent>

        {/* ──────────── BAJAS ──────────── */}
        <TabsContent value="bajas" className="space-y-4 mt-4">
          <Story
            title="Historia de las bajas"
            subtitle={`Acumulas ${aLaFecha.bajas} cuentas perdidas. Tu churn mensual es ${fmtPct(bi.churn)}. ${bi.churn > 5 ? 'Está sobre el promedio saludable SaaS (<5%).' : 'Saludable — debajo del 5% promedio SaaS.'}`}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={UserMinus} label="Bajas históricas" value={aLaFecha.bajas.toString()} accent="destructive" />
            <StatCard icon={UserMinus} label="Bajas este mes" value={esteMes.bajas.toString()} accent="destructive" />
            <StatCard icon={Activity} label="Churn mensual" value={fmtPct(bi.churn)} accent={bi.churn > 5 ? 'destructive' : 'success'} />
            <StatCard icon={Repeat} label="Retención" value={fmtPct(bi.retencion)} accent="success" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Altas vs Bajas por mes" subtitle="Últimos 12 meses — comparativo mensual" icon={UserMinus}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="altas" fill={SUCCESS} radius={[3, 3, 0, 0]} name="Altas" />
                  <Bar dataKey="bajas" fill={DANGER} radius={[3, 3, 0, 0]} name="Bajas" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Churn % mensual" subtitle="% de cuentas activas que se dan de baja" icon={TrendingDown}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis tick={{ fontSize: 10 }} stroke={MUTED} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="churn" fill={WARN} radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="churn" stroke={DANGER} strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Bajas recientes" subtitle={`${bajasRecientes.length} más recientes`} icon={UserMinus}>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {bajasRecientes.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Sin bajas</div>
              ) : bajasRecientes.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-xs bg-accent/30 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">{e.nombre}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Baja: {format(new Date(e.fechaBaja), "dd MMM yyyy", { locale: es })}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-destructive/30 text-destructive font-medium ml-3 shrink-0">
                    {STATUS_LABELS[e.status] || e.status}
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </TabsContent>

        {/* ──────────── INGRESOS ──────────── */}
        <TabsContent value="ingresos" className="space-y-4 mt-4">
          <Story
            title="Historia del dinero cobrado"
            subtitle={`Has cobrado ${fmtMoney(aLaFecha.ingresos)} con ${cobradas.length} facturas reales (Stripe o transferencia). Este mes llevas ${fmtMoney(esteMes.ingresos)}. Aún hay ${fmtMoney(totalPendientesLocal)} por cobrar en ${pendientes.length} facturas.`}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={DollarSign} label="Cobrado histórico" value={fmtMoney(aLaFecha.ingresos)} hint={`${cobradas.length} facturas`} accent="success" />
            <StatCard icon={DollarSign} label="Cobrado este mes" value={fmtMoney(esteMes.ingresos)} accent="success" />
            <StatCard icon={TrendingUp} label="MRR" value={fmtCents(stats?.mrr || 0)} hint={`${aLaFecha.activos} activos`} accent="primary" />
            <StatCard icon={CreditCard} label="Por cobrar" value={fmtMoney(totalPendientesLocal)} hint={`${pendientes.length} facturas`} accent="destructive" />
          </div>

          <ChartCard title="Ingresos cobrados por método (12 meses)" subtitle="Stripe vs Transferencia" icon={DollarSign}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                <YAxis tick={{ fontSize: 10 }} stroke={MUTED} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney2(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="stripeIng" stackId="a" fill={PRIMARY} name="Stripe" radius={[0, 0, 0, 0]} />
                <Bar dataKey="transfIng" stackId="a" fill={SUCCESS} name="Transferencia" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="ingresos" stroke={DANGER} strokeWidth={2} dot name="Total" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="Mix por método de pago" subtitle="Histórico" icon={CreditCard}>
              <ResponsiveContainer width="100%" height={240}>
                <RPieChart>
                  <Pie data={metodoDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value"
                    label={({ name, value }) => `${name}: ${fmtMoney(value as number)}`}>
                    {metodoDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney2(v)} />
                </RPieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 10 empresas pagadoras" subtitle="Por monto histórico cobrado" icon={Wallet}>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {topPagadoras.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">Sin pagos</div>
                ) : topPagadoras.map((e, i) => {
                  const max = topPagadoras[0]?.total || 1;
                  const pct = (e.total / max) * 100;
                  return (
                    <div key={e.id} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-foreground truncate flex-1">
                          <span className="text-muted-foreground mr-1.5">#{i + 1}</span>{e.nombre}
                        </span>
                        <span className="font-semibold text-success ml-2">{fmtMoney(e.total)}</span>
                      </div>
                      <div className="h-1.5 bg-card rounded-full overflow-hidden">
                        <div className="h-full bg-success rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{e.count} pagos</div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Facturas por cobrar" subtitle={`Total: ${fmtMoney(totalPendientesLocal)}`} icon={CreditCard}>
            {pendientes.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Sin facturas pendientes</div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
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
                    <span className="font-semibold text-destructive ml-3 shrink-0">{fmtMoney2(Number(f.total))}</span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </TabsContent>

        {/* ──────────── SALUD SAAS ──────────── */}
        <TabsContent value="salud" className="space-y-4 mt-4">
          <Story
            title="Salud del SaaS"
            subtitle={`Tu LTV es ${fmtMoney(bi.ltv)} con un ARPU de ${fmtMoney(bi.arpu)} y churn ${fmtPct(bi.churn)}. ${bi.ltv > bi.arpu * 12 ? 'Excelente — clientes con alta permanencia.' : 'Trabaja en la retención para subir el LTV.'}`}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Wallet} label="ARPU" value={fmtMoney(bi.arpu)} hint="Ingreso prom./cliente" accent="primary" />
            <StatCard icon={Heart} label="LTV" value={fmtMoney(bi.ltv)} hint="Valor vida cliente" accent="success" />
            <StatCard icon={Activity} label="Churn mensual" value={fmtPct(bi.churn)} accent={bi.churn > 5 ? 'destructive' : 'success'} />
            <StatCard icon={Zap} label="Net New MRR" value={fmtMoney(bi.netNewMRR)} hint="Nuevo MRR del mes" accent="success" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="MRR y cuentas activas (12 meses)" subtitle="Crecimiento del negocio recurrente" icon={TrendingUp}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis yAxisId="L" tick={{ fontSize: 10 }} stroke={MUTED} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="R" orientation="right" allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="L" dataKey="ingresos" fill={SUCCESS} name="Ingresos $" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="R" type="monotone" dataKey="activos" stroke={PRIMARY} strokeWidth={2} dot name="Activos" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Crecimiento neto (Altas - Bajas)" subtitle="¿Estás creciendo o decreciendo?" icon={BarChart3}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke={MUTED} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke={MUTED} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="netNew" radius={[3, 3, 0, 0]}>
                    {monthlySeries.map((entry, i) => (
                      <Cell key={i} fill={entry.netNew >= 0 ? SUCCESS : DANGER} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Indicadores de referencia SaaS" subtitle="Comparativo con benchmarks de la industria" icon={Target}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Benchmark label="Tasa de conversión registro→pago" value={bi.conversion} unit="%" good={20} warn={10} reverse={false} />
              <Benchmark label="Churn mensual" value={bi.churn} unit="%" good={3} warn={5} reverse={true} />
              <Benchmark label="Retención mensual" value={bi.retencion} unit="%" good={95} warn={90} reverse={false} />
              <Benchmark label="LTV/ARPU (meses promedio)" value={bi.arpu > 0 ? bi.ltv / bi.arpu : 0} unit=" meses" good={24} warn={12} reverse={false} />
            </div>
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────── Helpers UI ───────────

function Story({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-4 border-primary rounded-r-lg px-4 py-3">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle?: string; icon: any; children: React.ReactNode;
}) {
  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-foreground leading-tight">{value}</div>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            {hint && <div className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Benchmark({ label, value, unit, good, warn, reverse }: {
  label: string; value: number; unit: string; good: number; warn: number; reverse: boolean;
}) {
  // reverse=true: lower is better
  const isGood = reverse ? value <= good : value >= good;
  const isOk = reverse ? value <= warn : value >= warn;
  const color = isGood ? 'text-success bg-success/10 border-success/30'
    : isOk ? 'text-warning bg-yellow-500/10 border-yellow-500/30'
    : 'text-destructive bg-destructive/10 border-destructive/30';
  const statusText = isGood ? 'Saludable' : isOk ? 'Aceptable' : 'Requiere atención';
  const benchmarkText = reverse ? `Meta: ≤ ${good}${unit}` : `Meta: ≥ ${good}${unit}`;
  return (
    <div className={`border rounded-lg px-4 py-3 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] font-semibold uppercase">{statusText}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value.toFixed(1)}{unit}</span>
        <span className="text-[10px] opacity-70">{benchmarkText}</span>
      </div>
    </div>
  );
}

// ─────────── Stripe Invoices Table (grouped by status) ───────────
const STRIPE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid:          { label: 'Pagadas',     color: 'text-success bg-success/10 border-success/30' },
  open:          { label: 'Abiertas',    color: 'text-warning bg-yellow-500/10 border-yellow-500/30' },
  uncollectible: { label: 'Incobrables', color: 'text-destructive bg-destructive/10 border-destructive/30' },
  void:          { label: 'Anuladas',    color: 'text-muted-foreground bg-muted/30 border-border' },
  draft:         { label: 'Borrador',    color: 'text-muted-foreground bg-muted/30 border-border' },
};

function StripeInvoicesTable({ invoices, loading }: { invoices: any[]; loading: boolean }) {
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    invoices.forEach((inv: any) => {
      const k = inv.status || 'open';
      if (!map[k]) map[k] = [];
      map[k].push(inv);
    });
    return map;
  }, [invoices]);

  const order = ['paid', 'open', 'uncollectible', 'void', 'draft'];
  const statuses = order.filter(s => grouped[s]?.length).concat(
    Object.keys(grouped).filter(s => !order.includes(s))
  );

  const grandTotal = invoices.reduce((s, i) => s + (i.amount_due || 0) / 100, 0);
  const grandPaid = invoices.reduce((s, i) => s + (i.amount_paid || 0) / 100, 0);
  const grandPending = invoices.reduce((s, i) => s + (i.amount_remaining || 0) / 100, 0);

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" /> Facturas de Stripe ({invoices.length})
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Todas las facturas emitidas en Stripe, agrupadas por status. IDs de cliente y suscripción incluidos.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando facturas de Stripe…
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Sin facturas en Stripe</div>
        ) : (
          <div className="space-y-6">
            {statuses.map(status => {
              const rows = grouped[status] || [];
              const meta = STRIPE_STATUS_LABELS[status] || { label: status, color: 'text-foreground bg-muted/30 border-border' };
              const sumDue = rows.reduce((s, r) => s + (r.amount_due || 0) / 100, 0);
              const sumPaid = rows.reduce((s, r) => s + (r.amount_paid || 0) / 100, 0);
              const sumRem = rows.reduce((s, r) => s + (r.amount_remaining || 0) / 100, 0);
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold uppercase px-3 py-1 rounded-full border ${meta.color}`}>
                      {meta.label} · {rows.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Total: <strong className="text-foreground">{fmtMoney2(sumDue)}</strong>
                    </span>
                  </div>
                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-semibold">Folio</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Empresa</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Cliente Stripe</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Suscripción</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Fecha</th>
                          <th className="text-right px-2 py-1.5 font-semibold">Total</th>
                          <th className="text-right px-2 py-1.5 font-semibold">Pagado</th>
                          <th className="text-right px-2 py-1.5 font-semibold">Pendiente</th>
                          <th className="text-center px-2 py-1.5 font-semibold">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className="border-t border-border hover:bg-accent/30">
                            <td className="px-2 py-1.5 font-mono text-[10px]">{r.number || r.id.slice(0, 14)}</td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium text-foreground truncate max-w-[180px]">{r.empresa_nombre || r.customer_name || '—'}</div>
                              {r.customer_email && <div className="text-[9px] text-muted-foreground truncate max-w-[180px]">{r.customer_email}</div>}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{r.customer_id || '—'}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{r.subscription_id || '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.created ? format(new Date(r.created * 1000), 'dd/MM/yy', { locale: es }) : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-semibold">{fmtMoney2((r.amount_due || 0) / 100)}</td>
                            <td className="px-2 py-1.5 text-right text-success">{fmtMoney2((r.amount_paid || 0) / 100)}</td>
                            <td className="px-2 py-1.5 text-right text-destructive">{fmtMoney2((r.amount_remaining || 0) / 100)}</td>
                            <td className="px-2 py-1.5 text-center">
                              {r.hosted_invoice_url && (
                                <a href={r.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver</a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 font-semibold border-t-2 border-border">
                        <tr>
                          <td colSpan={5} className="px-2 py-2 text-right text-muted-foreground">Subtotal {meta.label.toLowerCase()}:</td>
                          <td className="px-2 py-2 text-right">{fmtMoney2(sumDue)}</td>
                          <td className="px-2 py-2 text-right text-success">{fmtMoney2(sumPaid)}</td>
                          <td className="px-2 py-2 text-right text-destructive">{fmtMoney2(sumRem)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Gran total */}
            <div className="border-t-2 border-primary pt-3 mt-4 grid grid-cols-3 gap-3">
              <div className="bg-primary/5 border border-primary/30 rounded-lg px-4 py-3">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Total facturado</div>
                <div className="text-lg font-bold text-foreground">{fmtMoney2(grandTotal)}</div>
              </div>
              <div className="bg-success/5 border border-success/30 rounded-lg px-4 py-3">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Total cobrado</div>
                <div className="text-lg font-bold text-success">{fmtMoney2(grandPaid)}</div>
              </div>
              <div className="bg-destructive/5 border border-destructive/30 rounded-lg px-4 py-3">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Total pendiente</div>
                <div className="text-lg font-bold text-destructive">{fmtMoney2(grandPending)}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
