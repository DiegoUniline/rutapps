import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, CreditCard, Receipt, Users, Stamp, Calendar, UserPlus, ArrowRight, PieChart } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RPieChart, Pie, Cell, CartesianGrid, Line } from 'recharts';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface DashboardStats {
  balance_available: number; balance_pending: number; total_invoiced: number;
  total_paid: number; total_open: number; active_subscriptions: number;
  total_customers: number; mrr: number;
}

interface FacturamaPlan {
  Plan: string; CurrentFolios: string; CreationDate: string;
  ExpirationDate: string; Amount: number; Id: string; Type: string;
}

interface EmpresaRow {
  id: string; created_at: string;
  subscriptions: { status: string; plan_id: string | null; created_at: string }[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(142 71% 45%)', 'hsl(var(--destructive))', 'hsl(38 92% 50%)', 'hsl(var(--muted-foreground))'];

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa', trial: 'Trial', past_due: 'Vencida',
  suspended: 'Suspendida', gracia: 'Gracia', cancelada: 'Cancelada', sin_sub: 'Sin sub',
};

export default function AdminStatsTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [facturamaPlan, setFacturamaPlan] = useState<FacturamaPlan | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => { loadStats(); loadFacturamaPlan(); loadEmpresas(); }, []);

  async function loadStats() {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=dashboard_stats`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
    } catch (err) {
      console.error('Stats error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadFacturamaPlan() {
    try {
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: { action: 'suscription_plan' },
      });
      if (error) throw error;
      setFacturamaPlan(data);
    } catch (err) {
      console.error('Facturama plan error:', err);
    }
  }

  async function loadEmpresas() {
    const { data } = await supabase
      .from('empresas')
      .select('id, created_at, subscriptions(status, plan_id, created_at)')
      .order('created_at', { ascending: true });
    setEmpresas((data as any) || []);
  }

  // ── Derived chart data ──
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
    // cumulative
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

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('es-MX')}`;

  if (loading) return <div className="text-muted-foreground text-center py-10">Cargando estadísticas...</div>;
  if (!stats) return <div className="text-muted-foreground text-center py-10">Error al cargar</div>;

  return (
    <div className="space-y-6">
      {/* Facturama plan card */}
      {facturamaPlan && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Stamp className="h-4 w-4 text-primary" /> Cuenta Facturama (Desarrollador)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-2xl font-bold text-primary">{facturamaPlan.CurrentFolios}</div>
              <div className="text-xs text-muted-foreground">Folios disponibles</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{facturamaPlan.Plan}</div>
              <div className="text-xs text-muted-foreground">Plan activo</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {facturamaPlan.ExpirationDate ? new Date(facturamaPlan.ExpirationDate).toLocaleDateString('es-MX') : '—'}
              </div>
              <div className="text-xs text-muted-foreground">Vencimiento</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{facturamaPlan.Type || '—'}</div>
              <div className="text-xs text-muted-foreground">Tipo</div>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Ingresos cobrados" value={fmt(stats.total_paid)} accent="success" />
        <StatCard icon={TrendingUp} label="MRR" value={fmt(stats.mrr)} accent="primary" />
        <StatCard icon={CreditCard} label="Facturas abiertas" value={fmt(stats.total_open)} accent="destructive" />
        <StatCard icon={Users} label="Total empresas" value={empresas.length.toString()} accent="primary" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={CreditCard} label="Suscripciones activas" value={stats.active_subscriptions.toString()} accent="success" />
        <StatCard icon={Receipt} label="Total facturado" value={fmt(stats.total_invoiced)} accent="muted" />
        <StatCard icon={Users} label="Clientes Stripe" value={stats.total_customers.toString()} accent="primary" />
      </div>

      {/* ── Nuevos registros por día ── */}
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

          {/* Recent signups list */}
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
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium">{statusLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Funnel de conversión + Distribución por status ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Conversion funnel */}
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
                  <div className="h-7 bg-muted/30 rounded-lg overflow-hidden relative">
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

        {/* Status distribution */}
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

function StatCard({ icon: Icon, label, value, accent }: {
  icon: any; label: string; value: string; accent: 'primary' | 'success' | 'destructive' | 'muted';
}) {
  const accentMap = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    destructive: 'text-destructive bg-destructive/10',
    muted: 'text-muted-foreground bg-muted/10',
  };
  const [iconColor, iconBg] = accentMap[accent].split(' ');

  return (
    <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
