import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight,
  ChevronDown, ChevronRight, CircleDollarSign, Clock3,
  Loader2, PackageSearch, RefreshCw, Search, ShoppingBag, Sparkles,
  Target, UserPlus, Users, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn, fmtNum } from '@/lib/utils';
import {
  CUSTOMER_SEGMENTS, CUSTOMER_SEGMENT_INFO, customerAction,
  type CustomerSegment,
} from '@/lib/customerIntelligence';
import {
  useCustomerIntelligenceDetail,
  useCustomerIntelligenceSnapshot,
  type CustomerIntelligenceRow,
} from '../hooks/useCustomerIntelligence';

interface Props {
  enabled: boolean;
  money: (value: number) => string;
  cSym: string;
}

const dateLabel = (value?: string | null, pattern = 'd MMM yyyy') => {
  if (!value) return '—';
  try { return format(new Date(`${value.slice(0, 10)}T12:00:00`), pattern, { locale: es }); }
  catch { return value; }
};

const compactMoney = (value: number, symbol: string) => {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}k`;
  return `${symbol}${amount.toFixed(0)}`;
};

const errorMessage = (error: unknown) => {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '');
  if (message.includes('fn_customer_intelligence_') || message.includes('schema cache')) {
    return 'Falta instalar la función SQL de Inteligencia de clientes en Supabase.';
  }
  if (message.toLowerCase().includes('permission') || message.includes('42501')) {
    return 'Tu usuario no tiene permiso para consultar la inteligencia de esta empresa.';
  }
  return 'No se pudo calcular la inteligencia de clientes. Reintenta en unos segundos.';
};

function MetricCard({ label, value, detail, icon: Icon, tone = 'blue' }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-600', green: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600', red: 'bg-red-500/10 text-red-600',
    violet: 'bg-violet-500/10 text-violet-600',
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-black tabular-nums truncate">{value}</p>
        </div>
        <div className={cn('rounded-lg p-2', tones[tone])}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground leading-snug">{detail}</p>
    </div>
  );
}

function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  const info = CUSTOMER_SEGMENT_INFO[segment];
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold', info.badgeClass)}>{info.label}</span>;
}

function Change({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(Number(value))) return <span className="text-muted-foreground">—</span>;
  const n = Number(value);
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-bold tabular-nums', n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-600' : 'text-muted-foreground')}>
      {n > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : n < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
      {n > 0 ? '+' : ''}{n.toFixed(1)}%
    </span>
  );
}

function CustomerDetail({
  clientId, windowDays, money, cSym, onClose,
}: {
  clientId: string;
  windowDays: number;
  money: (value: number) => string;
  cSym: string;
  onClose: () => void;
}) {
  const [months, setMonths] = useState(12);
  const detail = useCustomerIntelligenceDetail(clientId, months, windowDays, true);
  const data = detail.data;

  return (
    <section className="rounded-xl border-2 border-primary/20 bg-card overflow-hidden scroll-mt-4" id="customer-360">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-primary/[0.035] p-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="rounded-lg border border-border bg-background p-2 hover:bg-accent" title="Cerrar detalle">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base truncate">Cliente 360 · {data?.client.nombre ?? 'Cargando…'}</h3>
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-600">Listo para IA</span>
            </div>
            <p className="text-xs text-muted-foreground">Historia, frecuencia, tendencia y productos que cambiaron</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={months} onChange={e => setMonths(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-background px-3 text-xs">
            <option value={6}>6 meses</option><option value={12}>12 meses</option><option value={18}>18 meses</option><option value={24}>24 meses</option>
          </select>
          <button onClick={() => detail.refetch()} className="rounded-lg border border-border bg-background p-2 hover:bg-accent" title="Actualizar">
            <RefreshCw className={cn('h-4 w-4', detail.isFetching && 'animate-spin')} />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-accent" title="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      </header>

      {detail.isLoading && <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Armando historia del cliente…</div>}
      {detail.isError && (
        <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600">
          <p className="font-bold">No se pudo cargar el detalle</p><p className="mt-1">{errorMessage(detail.error)}</p>
        </div>
      )}
      {data && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {[
              ['Alta', dateLabel(data.client.signup_date)], ['Primera compra', dateLabel(data.client.first_purchase)],
              ['Última compra', dateLabel(data.client.last_purchase)], ['Compras', fmtNum(data.client.orders)],
              ['Venta histórica', money(data.client.lifetime_total)], ['Ticket promedio', money(data.client.avg_ticket)],
              ['Cambio reciente', data.client.change_pct == null ? '—' : `${data.client.change_pct > 0 ? '+' : ''}${Number(data.client.change_pct).toFixed(1)}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background p-3 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-black tabular-nums truncate" title={value}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-4">
              <h4 className="font-bold text-sm">Comportamiento mensual</h4>
              <p className="text-[11px] text-muted-foreground mb-3">Importe comprado y número de operaciones</p>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.monthly}>
                  <defs><linearGradient id="customerTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={v => dateLabel(v, 'MMM yy')} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => compactMoney(v, cSym)} />
                  <Tooltip formatter={(v: number) => money(v)} labelFormatter={v => dateLabel(String(v), 'MMMM yyyy')} />
                  <Area type="monotone" dataKey="total" name="Comprado" stroke="hsl(var(--primary))" fill="url(#customerTotal)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h4 className="font-bold text-sm">Pulso de las últimas 16 semanas</h4>
              <p className="text-[11px] text-muted-foreground mb-3">Permite detectar una caída antes de cerrar el mes</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={v => dateLabel(v, 'd MMM')} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => compactMoney(v, cSym)} />
                  <Tooltip formatter={(v: number) => money(v)} labelFormatter={v => `Semana del ${dateLabel(String(v))}`} />
                  <Bar dataKey="total" name="Comprado" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div><h4 className="font-bold text-sm">Qué productos cambiaron</h4><p className="text-[11px] text-muted-foreground">Compara unidades e importe de los últimos {windowDays} días contra los {windowDays} anteriores</p></div>
              <PackageSearch className="h-5 w-5 text-primary" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-4 py-2.5 text-left">Producto</th><th className="px-3 py-2.5 text-right">Uds. anteriores</th>
                    <th className="px-3 py-2.5 text-right">Uds. recientes</th><th className="px-3 py-2.5 text-center">Cambio uds.</th>
                    <th className="px-3 py-2.5 text-right">Importe anterior</th><th className="px-3 py-2.5 text-right">Importe reciente</th>
                    <th className="px-4 py-2.5 text-center">Señal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map(product => (
                    <tr key={product.id} className="border-b border-border/70 hover:bg-accent/30">
                      <td className="px-4 py-2.5"><p className="font-semibold">{product.nombre}</p><p className="text-[10px] text-muted-foreground">{product.codigo || 'Sin código'} · {product.unit}</p></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(product.previous_qty)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtNum(product.recent_qty)}</td>
                      <td className="px-3 py-2.5 text-center"><Change value={product.qty_change_pct} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(product.previous_total)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(product.recent_total)}</td>
                      <td className="px-4 py-2.5 text-center"><span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', product.trend === 'detenido' ? 'border-red-500/30 bg-red-500/10 text-red-600' : product.trend === 'bajando' ? 'border-orange-500/30 bg-orange-500/10 text-orange-600' : product.trend === 'creciendo' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-border bg-muted text-muted-foreground')}>{product.trend === 'detenido' ? 'Dejó de comprarlo' : product.trend === 'bajando' ? 'Bajando' : product.trend === 'creciendo' ? 'Creciendo' : 'Estable'}</span></td>
                    </tr>
                  ))}
                  {!data.products.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No hay productos vendidos en el periodo analizado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-border overflow-hidden">
              <div className="border-b border-border p-4"><h4 className="font-bold text-sm">Compras más recientes</h4></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs"><thead className="bg-muted/70"><tr><th className="px-4 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Folio</th><th className="px-3 py-2 text-center">Tipo</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
                  <tbody>{data.recent_purchases.map(sale => <tr key={sale.id} className="border-t border-border/60"><td className="px-4 py-2">{dateLabel(sale.fecha)}</td><td className="px-3 py-2 font-semibold">{sale.folio || '—'}</td><td className="px-3 py-2 text-center capitalize">{sale.type?.replace('_', ' ')}</td><td className="px-4 py-2 text-right font-bold tabular-nums">{money(sale.total)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.035] p-4">
              <div className="flex items-center gap-2 text-violet-600"><Sparkles className="h-4 w-4" /><h4 className="font-bold text-sm">Base para próxima IA</h4></div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Este perfil ya entrega a la futura inteligencia artificial una historia limpia por mes, semana y producto. Así podrá explicar qué cambió y proponer acciones con evidencia, sin alterar ventas.</p>
              <div className="mt-4 space-y-2 text-[11px]">
                <p className="rounded-lg bg-background/80 p-2">✓ Tendencia de compra y frecuencia habitual</p>
                <p className="rounded-lg bg-background/80 p-2">✓ Productos que crecieron, bajaron o se detuvieron</p>
                <p className="rounded-lg bg-background/80 p-2">✓ Valor, ticket e historial comercial verificable</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function TabClientes({ enabled, money, cSym }: Props) {
  const [windowDays, setWindowDays] = useState(30);
  const [inactiveDays, setInactiveDays] = useState(45);
  const [segment, setSegment] = useState<'todos' | CustomerSegment>('todos');
  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState('todos');
  const [zone, setZone] = useState('todos');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState(100);
  const snapshot = useCustomerIntelligenceSnapshot(windowDays, inactiveDays, enabled);
  const data = snapshot.data;

  const sellers = useMemo(() => [...new Set((data?.clients ?? []).map(c => c.seller_name))].sort((a, b) => a.localeCompare(b)), [data?.clients]);
  const zones = useMemo(() => [...new Set((data?.clients ?? []).map(c => c.zone_name))].sort((a, b) => a.localeCompare(b)), [data?.clients]);
  const filteredClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return (data?.clients ?? []).filter(client => {
      if (segment !== 'todos' && client.segment !== segment) return false;
      if (seller !== 'todos' && client.seller_name !== seller) return false;
      if (zone !== 'todos' && client.zone_name !== zone) return false;
      return !term || `${client.nombre} ${client.codigo ?? ''} ${client.seller_name} ${client.zone_name}`.toLocaleLowerCase('es').includes(term);
    });
  }, [data?.clients, search, segment, seller, zone]);

  const pieData = useMemo(() => CUSTOMER_SEGMENTS.map(key => ({
    key, name: CUSTOMER_SEGMENT_INFO[key].label, value: Number(data?.segments[key]?.clients ?? 0), color: CUSTOMER_SEGMENT_INFO[key].color,
  })).filter(item => item.value > 0), [data?.segments]);
  const recentChange = data?.metrics.previous_revenue
    ? ((data.metrics.recent_revenue - data.metrics.previous_revenue) / data.metrics.previous_revenue) * 100
    : null;

  const selectClient = (client: CustomerIntelligenceRow) => {
    setSelectedClientId(client.id);
    window.setTimeout(() => document.getElementById('customer-360')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><Users className="h-4 w-4" /></div><div><h2 className="text-base font-black">Inteligencia de clientes</h2><p className="text-xs text-muted-foreground">Detecta crecimiento, caídas, abandono y oportunidades antes de perder la venta</p></div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Comparar</label>
            <select value={windowDays} onChange={e => { setWindowDays(Number(e.target.value)); setVisibleRows(100); }} className="h-9 rounded-lg border border-border bg-background px-3 text-xs">
              <option value={7}>7 vs 7 días</option><option value={30}>30 vs 30 días</option><option value={60}>60 vs 60 días</option><option value={90}>90 vs 90 días</option>
            </select>
            <label className="ml-1 text-[10px] font-bold uppercase text-muted-foreground">Inactivo después de</label>
            <select value={inactiveDays} onChange={e => setInactiveDays(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-background px-3 text-xs">
              <option value={30}>30 días</option><option value={45}>45 días</option><option value={60}>60 días</option><option value={90}>90 días</option>
            </select>
            <button onClick={() => snapshot.refetch()} className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-accent flex items-center gap-1.5"><RefreshCw className={cn('h-3.5 w-3.5', snapshot.isFetching && 'animate-spin')} /> Actualizar</button>
          </div>
        </div>
      </section>

      {snapshot.isLoading && <div className="flex min-h-[360px] items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Analizando cartera sin descargar todas las ventas…</div>}
      {snapshot.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-start gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-red-600" /><div><p className="font-bold text-red-600">No se pudo cargar la inteligencia de clientes</p><p className="mt-1 text-sm text-muted-foreground">{errorMessage(snapshot.error)}</p><button onClick={() => snapshot.refetch()} className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Reintentar</button></div></div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Clientes" value={fmtNum(data.metrics.clients_total)} detail={`${fmtNum(data.metrics.active_clients)} activos en catálogo`} icon={Users} />
            <MetricCard label={`Compraron ${windowDays} d`} value={fmtNum(data.metrics.buyers_recent)} detail={`${fmtNum(data.metrics.buyers_lifetime)} han comprado alguna vez`} icon={ShoppingBag} tone="green" />
            <MetricCard label="Retención" value={`${Number(data.metrics.retention_pct).toFixed(1)}%`} detail={`${fmtNum(data.metrics.retained_buyers)} de ${fmtNum(data.metrics.previous_buyers)} repitieron`} icon={Target} tone="violet" />
            <MetricCard label="Venta reciente" value={money(data.metrics.recent_revenue)} detail={recentChange == null ? 'Sin base anterior comparable' : `${recentChange >= 0 ? '+' : ''}${recentChange.toFixed(1)}% contra periodo anterior`} icon={CircleDollarSign} tone="green" />
            <MetricCard label="Venta en riesgo" value={money(data.metrics.revenue_at_risk)} detail="Base anterior de clientes que bajan o se alejan" icon={AlertTriangle} tone="red" />
            <MetricCard label="Altas recientes" value={fmtNum(data.metrics.new_signups)} detail={`Registrados en los últimos ${windowDays} días`} icon={UserPlus} tone="amber" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3"><div><h3 className="font-bold text-sm">Evolución de la cartera</h3><p className="text-[11px] text-muted-foreground">Venta y clientes compradores por mes</p></div><Activity className="h-5 w-5 text-primary" /></div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.monthly_portfolio}>
                  <defs><linearGradient id="portfolioTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => dateLabel(v, 'MMM yy')} /><YAxis yAxisId="money" tick={{ fontSize: 10 }} tickFormatter={v => compactMoney(v, cSym)} /><YAxis yAxisId="buyers" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(value: number, name: string) => name === 'Venta' ? money(value) : [fmtNum(value), 'Clientes compradores']} labelFormatter={v => dateLabel(String(v), 'MMMM yyyy')} />
                  <Area yAxisId="money" type="monotone" dataKey="total" name="Venta" stroke="hsl(var(--primary))" fill="url(#portfolioTotal)" strokeWidth={2} /><Line yAxisId="buyers" type="monotone" dataKey="buyers" name="Clientes" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-bold text-sm">Radar de comportamiento</h3><p className="text-[11px] text-muted-foreground">Distribución de toda la cartera</p>
              <ResponsiveContainer width="100%" height={210}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>{pieData.map(item => <Cell key={item.key} fill={item.color} />)}</Pie><Tooltip formatter={(v: number) => [`${fmtNum(v)} clientes`, 'Total']} /></PieChart></ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">{pieData.map(item => <button key={item.key} onClick={() => setSegment(item.key)} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-[10px] hover:bg-accent"><span className="flex min-w-0 items-center gap-1.5"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span><b>{item.value}</b></button>)}</div>
            </div>
          </div>

          {selectedClientId && <CustomerDetail clientId={selectedClientId} windowDays={windowDays} money={money} cSym={cSym} onClose={() => setSelectedClientId(null)} />}

          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-sm">Radar accionable de clientes</h3><p className="text-[11px] text-muted-foreground">Abre cualquier renglón para ver su historia y qué productos cambiaron. Mostrando {Math.min(visibleRows, filteredClients.length)} de {filteredClients.length}.</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{fmtNum(filteredClients.length)} resultados</span></div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setVisibleRows(100); }} placeholder="Buscar cliente, código, vendedor o zona…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/30" /></div>
                <select value={segment} onChange={e => { setSegment(e.target.value as 'todos' | CustomerSegment); setVisibleRows(100); }} className="h-9 min-w-[150px] rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todos los estados</option>{CUSTOMER_SEGMENTS.map(key => <option key={key} value={key}>{CUSTOMER_SEGMENT_INFO[key].label}</option>)}</select>
                <select value={seller} onChange={e => setSeller(e.target.value)} className="h-9 min-w-[160px] rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todos los vendedores</option>{sellers.map(value => <option key={value} value={value}>{value}</option>)}</select>
                <select value={zone} onChange={e => setZone(e.target.value)} className="h-9 min-w-[140px] rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todas las zonas</option>{zones.map(value => <option key={value} value={value}>{value}</option>)}</select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1420px] text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr className="border-b border-border text-muted-foreground"><th className="px-4 py-2.5 text-left">Cliente</th><th className="px-3 py-2.5 text-center">Comportamiento</th><th className="px-3 py-2.5 text-center">Alta / primera compra</th><th className="px-3 py-2.5 text-center">Última compra</th><th className="px-3 py-2.5 text-center">Frecuencia</th><th className="px-3 py-2.5 text-right">Periodo anterior</th><th className="px-3 py-2.5 text-right">Periodo reciente</th><th className="px-3 py-2.5 text-center">Cambio</th><th className="px-3 py-2.5 text-left">Acción sugerida</th><th className="px-4 py-2.5 text-center">Detalle</th></tr></thead>
                <tbody>
                  {filteredClients.slice(0, visibleRows).map(client => (
                    <tr key={client.id} onClick={() => selectClient(client)} className={cn('cursor-pointer border-b border-border/70 hover:bg-primary/[0.035]', selectedClientId === client.id && 'bg-primary/[0.06]')}>
                      <td className="px-4 py-2.5"><p className="font-bold">{client.nombre}</p><p className="text-[10px] text-muted-foreground">{client.codigo || 'Sin código'} · {client.seller_name} · {client.zone_name}</p></td>
                      <td className="px-3 py-2.5 text-center"><SegmentBadge segment={client.segment} /></td>
                      <td className="px-3 py-2.5 text-center"><p>{dateLabel(client.signup_date)}</p><p className="text-[10px] text-muted-foreground">1ª {dateLabel(client.first_purchase)}</p></td>
                      <td className="px-3 py-2.5 text-center"><p className="font-semibold">{dateLabel(client.last_purchase)}</p><p className={cn('text-[10px]', (client.days_since_purchase ?? 0) > inactiveDays ? 'text-red-600 font-bold' : 'text-muted-foreground')}>{client.days_since_purchase == null ? 'Nunca' : `Hace ${client.days_since_purchase} d`}</p></td>
                      <td className="px-3 py-2.5 text-center"><p>{client.avg_gap_days ? `Cada ${Number(client.avg_gap_days).toFixed(0)} d` : 'Sin patrón'}</p><p className="text-[10px] text-muted-foreground">Próx. {dateLabel(client.expected_next_purchase, 'd MMM')}</p></td>
                      <td className="px-3 py-2.5 text-right"><p className="tabular-nums">{money(client.previous_total)}</p><p className="text-[10px] text-muted-foreground">{fmtNum(client.previous_orders)} compras</p></td>
                      <td className="px-3 py-2.5 text-right"><p className="font-bold tabular-nums">{money(client.recent_total)}</p><p className="text-[10px] text-muted-foreground">{fmtNum(client.recent_orders)} compras</p></td>
                      <td className="px-3 py-2.5 text-center"><Change value={client.change_pct} /></td>
                      <td className="px-3 py-2.5 text-left max-w-[260px]"><p className="line-clamp-2 text-[11px]">{customerAction(client.segment, client.days_overdue)}</p></td>
                      <td className="px-4 py-2.5 text-center"><ChevronRight className="mx-auto h-4 w-4 text-primary" /></td>
                    </tr>
                  ))}
                  {!filteredClients.length && <tr><td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">No hay clientes que coincidan con estos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            {visibleRows < filteredClients.length && <div className="border-t border-border p-3 text-center"><button onClick={() => setVisibleRows(rows => rows + 100)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-accent">Mostrar 100 más <ChevronDown className="h-3.5 w-3.5" /></button></div>}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border p-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Datos calculados {dateLabel(data.generated_at, "d MMM yyyy 'a las' HH:mm")}</span><span>Solo lectura · no modifica clientes, ventas, precios ni inventario</span></div>
        </>
      )}
    </div>
  );
}
