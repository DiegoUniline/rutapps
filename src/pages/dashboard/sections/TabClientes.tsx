import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight,
  ChevronDown, ChevronRight, CircleDollarSign, Clock3, History,
  Layers3, Loader2, PackageSearch, RefreshCw, Search, ShoppingBag,
  Sparkles, Tags, Target, TrendingDown, TrendingUp, UserPlus, Users, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn, fmtNum } from '@/lib/utils';
import {
  CUSTOMER_SEGMENTS, CUSTOMER_SEGMENT_INFO, customerAction,
  summarizeCustomerProducts, type CustomerProductDimension,
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

type DetailTab = 'attention' | 'evolution' | 'products' | 'dimensions' | 'history';

const productTrendLabel = (trend: string) => trend === 'detenido' ? 'Dejó de comprarlo' : trend === 'bajando' ? 'Bajando' : trend === 'creciendo' ? 'Creciendo' : 'Estable';
const productTrendClass = (trend: string) => trend === 'detenido' ? 'border-red-500/30 bg-red-500/10 text-red-600' : trend === 'bajando' ? 'border-orange-500/30 bg-orange-500/10 text-orange-600' : trend === 'creciendo' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-border bg-muted text-muted-foreground';

function CustomerDetail({ clientId, windowDays, money, cSym, onClose }: {
  clientId: string; windowDays: number; money: (value: number) => string; cSym: string; onClose: () => void;
}) {
  const [months, setMonths] = useState(12);
  const [tab, setTab] = useState<DetailTab>('attention');
  const [productSearch, setProductSearch] = useState('');
  const [productTrend, setProductTrend] = useState('todos');
  const [category, setCategory] = useState('todos');
  const [brand, setBrand] = useState('todos');
  const [dimension, setDimension] = useState<CustomerProductDimension>('category');
  const [visibleProducts, setVisibleProducts] = useState(100);
  const detail = useCustomerIntelligenceDetail(clientId, months, windowDays, true);
  const data = detail.data;

  const categories = useMemo(() => [...new Set((data?.products ?? []).map(p => p.category_name || 'Sin categoría'))].sort(), [data?.products]);
  const brands = useMemo(() => [...new Set((data?.products ?? []).map(p => p.brand_name || 'Sin marca'))].sort(), [data?.products]);
  const productRows = useMemo(() => {
    const term = productSearch.trim().toLocaleLowerCase('es');
    return (data?.products ?? []).filter(product => {
      if (productTrend !== 'todos' && product.trend !== productTrend) return false;
      if (category !== 'todos' && (product.category_name || 'Sin categoría') !== category) return false;
      if (brand !== 'todos' && (product.brand_name || 'Sin marca') !== brand) return false;
      return !term || `${product.nombre} ${product.codigo ?? ''} ${product.category_name ?? ''} ${product.brand_name ?? ''}`.toLocaleLowerCase('es').includes(term);
    });
  }, [brand, category, data?.products, productSearch, productTrend]);
  const attentionProducts = useMemo(() => (data?.products ?? [])
    .filter(product => product.trend === 'detenido' || product.trend === 'bajando')
    .sort((a, b) => (b.previous_total - b.recent_total) - (a.previous_total - a.recent_total)), [data?.products]);
  const growingProducts = useMemo(() => (data?.products ?? []).filter(product => product.trend === 'creciendo')
    .sort((a, b) => (b.recent_total - b.previous_total) - (a.recent_total - a.previous_total)), [data?.products]);
  const categorySummary = useMemo(() => summarizeCustomerProducts(data?.products ?? [], 'category'), [data?.products]);
  const brandSummary = useMemo(() => summarizeCustomerProducts(data?.products ?? [], 'brand'), [data?.products]);
  const dimensionRows = dimension === 'category' ? categorySummary : brandSummary;
  const revenueGap = attentionProducts.reduce((sum, product) => sum + Math.max(0, product.previous_total - product.recent_total), 0);
  const stoppedCount = (data?.products ?? []).filter(product => product.trend === 'detenido').length;
  const biggestLeak = attentionProducts[0];
  const biggestDimensionLeak = categorySummary[0]?.revenue_gap > 0 ? categorySummary[0] : null;
  const recentProductRevenue = (data?.products ?? []).reduce((sum, product) => sum + Number(product.recent_total || 0), 0);
  const topBrand = [...brandSummary].sort((a, b) => b.recent_total - a.recent_total)[0];
  const topBrandShare = topBrand && recentProductRevenue > 0 ? (topBrand.recent_total / recentProductRevenue) * 100 : 0;

  const detailTabs: Array<{ key: DetailTab; label: string; icon: typeof AlertTriangle; count?: number }> = [
    { key: 'attention', label: 'Atención inmediata', icon: AlertTriangle, count: attentionProducts.length },
    { key: 'evolution', label: 'Evolución', icon: Activity },
    { key: 'products', label: 'Productos', icon: PackageSearch, count: data?.products.length },
    { key: 'dimensions', label: 'Categorías y marcas', icon: Layers3 },
    { key: 'history', label: 'Historial', icon: History, count: data?.recent_purchases.length },
  ];

  return (
    <section className="rounded-xl border-2 border-primary/20 bg-card overflow-hidden scroll-mt-4" id="customer-360">
      <header className="flex flex-col gap-3 border-b border-border bg-primary/[0.035] p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="rounded-lg border border-border bg-background p-2 hover:bg-accent" title="Cerrar detalle"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-base truncate">Cliente 360 · {data?.client.nombre ?? 'Cargando…'}</h3><span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-600">Listo para IA</span></div><p className="text-xs text-muted-foreground">Señales comerciales explicables por cliente, producto, categoría y marca</p></div>
        </div>
        <div className="flex items-center gap-2 self-end xl:self-auto"><select value={months} onChange={e => setMonths(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-background px-3 text-xs"><option value={6}>6 meses</option><option value={12}>12 meses</option><option value={18}>18 meses</option><option value={24}>24 meses</option></select><button onClick={() => detail.refetch()} className="rounded-lg border border-border bg-background p-2 hover:bg-accent" title="Actualizar"><RefreshCw className={cn('h-4 w-4', detail.isFetching && 'animate-spin')} /></button><button onClick={onClose} className="rounded-lg p-2 hover:bg-accent" title="Cerrar"><X className="h-4 w-4" /></button></div>
      </header>

      {detail.isLoading && <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Armando historia del cliente…</div>}
      {detail.isError && <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600"><p className="font-bold">No se pudo cargar el detalle</p><p className="mt-1">{errorMessage(detail.error)}</p></div>}
      {data && <>
        <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4 xl:grid-cols-7">
          {[
            ['Alta', dateLabel(data.client.signup_date)], ['Primera compra', dateLabel(data.client.first_purchase)], ['Última compra', dateLabel(data.client.last_purchase)],
            ['Compras', fmtNum(data.client.orders)], ['Venta histórica', money(data.client.lifetime_total)], ['Ticket promedio', money(data.client.avg_ticket)],
            ['Cambio reciente', data.client.change_pct == null ? '—' : `${data.client.change_pct > 0 ? '+' : ''}${Number(data.client.change_pct).toFixed(1)}%`],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-background p-3 min-w-0"><p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-black tabular-nums truncate" title={value}>{value}</p></div>)}
        </div>

        <nav className="flex gap-1 overflow-x-auto border-y border-border bg-muted/30 px-4 pt-2">
          {detailTabs.map(item => { const Icon = item.icon; return <button key={item.key} onClick={() => setTab(item.key)} className={cn('flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-3 text-xs font-bold transition-colors', tab === item.key ? 'border-primary bg-background text-primary' : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground')}><Icon className="h-4 w-4" />{item.label}{item.count !== undefined && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-foreground">{item.count}</span>}</button>; })}
        </nav>

        <div className="p-4">
          {tab === 'attention' && <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Venta por recuperar" value={money(revenueGap)} detail={`Brecha positiva de ${attentionProducts.length} productos que bajaron o se detuvieron`} icon={CircleDollarSign} tone="red" />
              <MetricCard label="Productos detenidos" value={fmtNum(stoppedCount)} detail={stoppedCount ? 'Tenían compra en el periodo anterior y ahora están en cero' : 'No hay productos detenidos en esta comparación'} icon={TrendingDown} tone="red" />
              <MetricCard label="Fuga principal" value={biggestLeak ? money(Math.max(0, biggestLeak.previous_total - biggestLeak.recent_total)) : money(0)} detail={biggestLeak?.nombre ?? 'Sin caída individual detectada'} icon={AlertTriangle} tone="amber" />
              <MetricCard label="Categoría a revisar" value={biggestDimensionLeak?.name ?? 'Sin alerta'} detail={biggestDimensionLeak ? `${money(biggestDimensionLeak.revenue_gap)} menos que el periodo anterior` : 'Todas las categorías se mantienen'} icon={Tags} tone="violet" />
            </div>

            <div className={cn('rounded-xl border p-4', attentionProducts.length ? 'border-red-500/25 bg-red-500/[0.035]' : 'border-emerald-500/25 bg-emerald-500/[0.035]')}>
              <div className="flex items-start gap-3"><div className={cn('rounded-lg p-2', attentionProducts.length ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600')}>{attentionProducts.length ? <AlertTriangle className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}</div><div><h4 className="font-black text-sm">{attentionProducts.length ? `Hay ${attentionProducts.length} señales que merecen una conversación` : 'El cliente no presenta una caída accionable'}</h4><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{biggestLeak ? `Empieza preguntando por “${biggestLeak.nombre}”: pasó de ${money(biggestLeak.previous_total)} a ${money(biggestLeak.recent_total)}. La brecha total observable es ${money(revenueGap)}; es una oportunidad, no una venta garantizada.` : 'Mantén el seguimiento habitual y revisa las oportunidades de crecimiento.'}</p></div></div>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4"><div><h4 className="font-bold text-sm">Prioridad de contacto</h4><p className="text-[11px] text-muted-foreground">Ordenada por la mayor caída de importe. La tabla crece con la página y no tiene un contenedor vertical limitado.</p></div><PackageSearch className="h-5 w-5 text-red-600" /></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[1260px] text-xs"><thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr className="border-b border-border text-muted-foreground"><th className="px-4 py-3 text-left">Producto</th><th className="px-3 py-3 text-left">Categoría</th><th className="px-3 py-3 text-left">Marca</th><th className="px-3 py-3 text-right">Antes</th><th className="px-3 py-3 text-right">Ahora</th><th className="px-3 py-3 text-right">Brecha</th><th className="px-3 py-3 text-center">Cambio uds.</th><th className="px-4 py-3 text-center">Señal</th></tr></thead><tbody>
                {attentionProducts.map(product => <tr key={product.id} className="border-b border-border/70 hover:bg-accent/30"><td className="px-4 py-3"><p className="font-semibold">{product.nombre}</p><p className="text-[10px] text-muted-foreground">{product.codigo || 'Sin código'} · {product.unit}</p></td><td className="px-3 py-3">{product.category_name || 'Sin categoría'}</td><td className="px-3 py-3">{product.brand_name || 'Sin marca'}</td><td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{money(product.previous_total)}</td><td className="px-3 py-3 text-right font-bold tabular-nums">{money(product.recent_total)}</td><td className="px-3 py-3 text-right font-black tabular-nums text-red-600">{money(Math.max(0, product.previous_total - product.recent_total))}</td><td className="px-3 py-3 text-center"><Change value={product.qty_change_pct} /></td><td className="px-4 py-3 text-center"><span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', productTrendClass(product.trend))}>{productTrendLabel(product.trend)}</span></td></tr>)}
                {!attentionProducts.length && <tr><td colSpan={8} className="px-4 py-14 text-center text-muted-foreground">No hay productos detenidos o bajando en esta comparación.</td></tr>}
              </tbody></table></div>
            </div>

            {!!growingProducts.length && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.025] p-4"><div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><h4 className="font-bold text-sm">Lo que sí está creciendo</h4></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{growingProducts.slice(0, 6).map(product => <div key={product.id} className="rounded-lg border border-border bg-background p-3"><p className="truncate text-xs font-bold" title={product.nombre}>{product.nombre}</p><p className="mt-1 text-[10px] text-muted-foreground">{product.category_name || 'Sin categoría'} · {product.brand_name || 'Sin marca'}</p><div className="mt-2 flex items-center justify-between"><Change value={product.total_change_pct} /><span className="text-xs font-black text-emerald-600">+{money(Math.max(0, product.recent_total - product.previous_total))}</span></div></div>)}</div></div>}
          </div>}

          {tab === 'evolution' && <div className="space-y-4">
            <div className="rounded-xl border border-border p-4"><h4 className="font-bold text-sm">Comportamiento mensual</h4><p className="mb-3 text-[11px] text-muted-foreground">Importe comprado durante los últimos {months} meses</p><ResponsiveContainer width="100%" height={330}><AreaChart data={data.monthly}><defs><linearGradient id="customerTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={v => dateLabel(v, 'MMM yy')} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => compactMoney(v, cSym)} /><Tooltip formatter={(v: number) => money(v)} labelFormatter={v => dateLabel(String(v), 'MMMM yyyy')} /><Area type="monotone" dataKey="total" name="Comprado" stroke="hsl(var(--primary))" fill="url(#customerTotal)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
            <div className="rounded-xl border border-border p-4"><h4 className="font-bold text-sm">Pulso de las últimas 16 semanas</h4><p className="mb-3 text-[11px] text-muted-foreground">Hace visible una caída antes de que termine el mes</p><ResponsiveContainer width="100%" height={330}><BarChart data={data.weekly}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={v => dateLabel(v, 'd MMM')} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => compactMoney(v, cSym)} /><Tooltip formatter={(v: number) => money(v)} labelFormatter={v => `Semana del ${dateLabel(String(v))}`} /><Bar dataKey="total" name="Comprado" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </div>}

          {tab === 'products' && <div className="rounded-xl border border-border overflow-hidden">
            <div className="border-b border-border p-4 space-y-3"><div><h4 className="font-bold text-sm">Análisis completo de productos</h4><p className="text-[11px] text-muted-foreground">{productRows.length} resultados · compara {windowDays} días contra los {windowDays} anteriores · sin límite vertical</p></div><div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={productSearch} onChange={e => { setProductSearch(e.target.value); setVisibleProducts(100); }} placeholder="Buscar producto, código, categoría o marca…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs" /></div><select value={productTrend} onChange={e => { setProductTrend(e.target.value); setVisibleProducts(100); }} className="h-9 rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todas las señales</option><option value="detenido">Dejó de comprarlo</option><option value="bajando">Bajando</option><option value="creciendo">Creciendo</option><option value="estable">Estable</option></select><select value={category} onChange={e => { setCategory(e.target.value); setVisibleProducts(100); }} className="h-9 max-w-[220px] rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todas las categorías</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select><select value={brand} onChange={e => { setBrand(e.target.value); setVisibleProducts(100); }} className="h-9 max-w-[220px] rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todas las marcas</option>{brands.map(value => <option key={value} value={value}>{value}</option>)}</select></div></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1420px] text-xs"><thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr className="border-b border-border text-muted-foreground"><th className="px-4 py-3 text-left">Producto</th><th className="px-3 py-3 text-left">Categoría</th><th className="px-3 py-3 text-left">Marca</th><th className="px-3 py-3 text-right">Uds. anteriores</th><th className="px-3 py-3 text-right">Uds. recientes</th><th className="px-3 py-3 text-center">Cambio uds.</th><th className="px-3 py-3 text-right">Importe anterior</th><th className="px-3 py-3 text-right">Importe reciente</th><th className="px-4 py-3 text-center">Señal</th></tr></thead><tbody>{productRows.slice(0, visibleProducts).map(product => <tr key={product.id} className="border-b border-border/70 hover:bg-accent/30"><td className="px-4 py-3"><p className="font-semibold">{product.nombre}</p><p className="text-[10px] text-muted-foreground">{product.codigo || 'Sin código'} · {product.unit}</p></td><td className="px-3 py-3">{product.category_name || 'Sin categoría'}</td><td className="px-3 py-3">{product.brand_name || 'Sin marca'}</td><td className="px-3 py-3 text-right tabular-nums">{fmtNum(product.previous_qty)}</td><td className="px-3 py-3 text-right font-bold tabular-nums">{fmtNum(product.recent_qty)}</td><td className="px-3 py-3 text-center"><Change value={product.qty_change_pct} /></td><td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{money(product.previous_total)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{money(product.recent_total)}</td><td className="px-4 py-3 text-center"><span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', productTrendClass(product.trend))}>{productTrendLabel(product.trend)}</span></td></tr>)}{!productRows.length && <tr><td colSpan={9} className="px-4 py-14 text-center text-muted-foreground">No hay productos que coincidan con estos filtros.</td></tr>}</tbody></table></div>
            {visibleProducts < productRows.length && <div className="border-t border-border p-3 text-center"><button onClick={() => setVisibleProducts(value => value + 100)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-accent">Mostrar 100 más <ChevronDown className="h-3.5 w-3.5" /></button></div>}
          </div>}

          {tab === 'dimensions' && <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between"><div><h4 className="font-black text-sm">La mezcla que el cliente realmente compra</h4><p className="text-[11px] text-muted-foreground">Descubre concentración, categorías abandonadas y marcas con oportunidad</p></div><div className="inline-flex self-start rounded-lg border border-border bg-background p-1"><button onClick={() => setDimension('category')} className={cn('rounded-md px-4 py-2 text-xs font-bold', dimension === 'category' && 'bg-primary text-primary-foreground')}>Por categoría</button><button onClick={() => setDimension('brand')} className={cn('rounded-md px-4 py-2 text-xs font-bold', dimension === 'brand' && 'bg-primary text-primary-foreground')}>Por marca</button></div></div>
            <div className="grid gap-3 md:grid-cols-3"><MetricCard label="Mayor fuga agrupada" value={dimensionRows[0]?.revenue_gap ? money(dimensionRows[0].revenue_gap) : money(0)} detail={dimensionRows[0]?.revenue_gap ? dimensionRows[0].name : 'Sin caída agrupada'} icon={TrendingDown} tone="red" /><MetricCard label="Marca dominante" value={topBrand?.name ?? 'Sin datos'} detail={topBrand ? `${topBrandShare.toFixed(1)}% de la venta reciente del cliente` : 'Aún no hay mezcla suficiente'} icon={Tags} tone="violet" /><MetricCard label="Variedad comprada" value={fmtNum(data.products.length)} detail={`${categorySummary.length} categorías · ${brandSummary.length} marcas`} icon={Layers3} tone="green" /></div>
            <div className="rounded-xl border border-border p-4"><h4 className="font-bold text-sm">Brecha por {dimension === 'category' ? 'categoría' : 'marca'}</h4><p className="mb-3 text-[11px] text-muted-foreground">Muestra dónde se concentra la venta que dejó de repetirse</p><ResponsiveContainer width="100%" height={Math.max(300, Math.min(520, dimensionRows.slice(0, 12).length * 38))}><BarChart data={dimensionRows.slice(0, 12)} layout="vertical" margin={{ left: 24, right: 30 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => compactMoney(v, cSym)} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => money(v)} /><Bar dataKey="revenue_gap" name="Venta por recuperar" fill="#ef4444" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="rounded-xl border border-border overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr className="border-b border-border text-muted-foreground"><th className="px-4 py-3 text-left">{dimension === 'category' ? 'Categoría' : 'Marca'}</th><th className="px-3 py-3 text-center">Productos</th><th className="px-3 py-3 text-center">Detenidos</th><th className="px-3 py-3 text-center">Bajando</th><th className="px-3 py-3 text-center">Creciendo</th><th className="px-3 py-3 text-right">Antes</th><th className="px-3 py-3 text-right">Ahora</th><th className="px-3 py-3 text-center">Cambio</th><th className="px-4 py-3 text-right">Brecha</th></tr></thead><tbody>{dimensionRows.map(row => <tr key={row.name} className="border-b border-border/70 hover:bg-accent/30"><td className="px-4 py-3 font-bold">{row.name}</td><td className="px-3 py-3 text-center">{fmtNum(row.products)}</td><td className="px-3 py-3 text-center font-bold text-red-600">{fmtNum(row.stopped_products)}</td><td className="px-3 py-3 text-center text-orange-600">{fmtNum(row.declining_products)}</td><td className="px-3 py-3 text-center text-emerald-600">{fmtNum(row.growing_products)}</td><td className="px-3 py-3 text-right text-muted-foreground">{money(row.previous_total)}</td><td className="px-3 py-3 text-right font-bold">{money(row.recent_total)}</td><td className="px-3 py-3 text-center"><Change value={row.change_pct} /></td><td className="px-4 py-3 text-right font-black text-red-600">{row.revenue_gap > 0 ? money(row.revenue_gap) : '—'}</td></tr>)}</tbody></table></div></div>
          </div>}

          {tab === 'history' && <div className="space-y-4"><div className="rounded-xl border border-border overflow-hidden"><div className="border-b border-border p-4"><h4 className="font-bold text-sm">Compras más recientes</h4><p className="text-[11px] text-muted-foreground">Últimas {data.recent_purchases.length} operaciones válidas</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="sticky top-0 z-10 bg-muted/70"><tr><th className="px-4 py-3 text-left">Fecha</th><th className="px-3 py-3 text-left">Folio</th><th className="px-3 py-3 text-center">Tipo</th><th className="px-3 py-3 text-center">Estado</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody>{data.recent_purchases.map(sale => <tr key={sale.id} className="border-t border-border/60 hover:bg-accent/30"><td className="px-4 py-3">{dateLabel(sale.fecha)}</td><td className="px-3 py-3 font-semibold">{sale.folio || '—'}</td><td className="px-3 py-3 text-center capitalize">{sale.type?.replace('_', ' ')}</td><td className="px-3 py-3 text-center capitalize">{sale.status}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{money(sale.total)}</td></tr>)}</tbody></table></div></div><div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.035] p-4"><div className="flex items-center gap-2 text-violet-600"><Sparkles className="h-4 w-4" /><h4 className="font-bold text-sm">Base verificable para IA</h4></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">La futura IA podrá explicar frecuencia, caídas, crecimiento y mezcla comercial con esta historia limpia. El tablero actual ya hace el diagnóstico determinista y nunca modifica ventas, precios ni clientes.</p></div></div>}
        </div>
      </>}
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
  const [portfolioView, setPortfolioView] = useState<'attention' | 'opportunity' | 'stable' | 'no_sales' | 'all'>('attention');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState(100);
  const snapshot = useCustomerIntelligenceSnapshot(windowDays, inactiveDays, enabled);
  const data = snapshot.data;

  const sellers = useMemo(() => [...new Set((data?.clients ?? []).map(c => c.seller_name))].sort((a, b) => a.localeCompare(b)), [data?.clients]);
  const zones = useMemo(() => [...new Set((data?.clients ?? []).map(c => c.zone_name))].sort((a, b) => a.localeCompare(b)), [data?.clients]);
  const filteredClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return (data?.clients ?? []).filter(client => {
      if (portfolioView === 'attention' && !['en_riesgo', 'bajando', 'inactivo', 'perdido'].includes(client.segment)) return false;
      if (portfolioView === 'opportunity' && !['recuperado', 'creciendo', 'nuevo'].includes(client.segment)) return false;
      if (portfolioView === 'stable' && client.segment !== 'estable') return false;
      if (portfolioView === 'no_sales' && client.segment !== 'sin_compras') return false;
      if (segment !== 'todos' && client.segment !== segment) return false;
      if (seller !== 'todos' && client.seller_name !== seller) return false;
      if (zone !== 'todos' && client.zone_name !== zone) return false;
      return !term || `${client.nombre} ${client.codigo ?? ''} ${client.seller_name} ${client.zone_name}`.toLocaleLowerCase('es').includes(term);
    });
  }, [data?.clients, portfolioView, search, segment, seller, zone]);

  const portfolioCounts = useMemo(() => {
    const clients = data?.clients ?? [];
    return {
      attention: clients.filter(client => ['en_riesgo', 'bajando', 'inactivo', 'perdido'].includes(client.segment)).length,
      opportunity: clients.filter(client => ['recuperado', 'creciendo', 'nuevo'].includes(client.segment)).length,
      stable: clients.filter(client => client.segment === 'estable').length,
      no_sales: clients.filter(client => client.segment === 'sin_compras').length,
      all: clients.length,
    };
  }, [data?.clients]);

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
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">{pieData.map(item => <button key={item.key} onClick={() => { setPortfolioView('all'); setSegment(item.key); setVisibleRows(100); }} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-[10px] hover:bg-accent"><span className="flex min-w-0 items-center gap-1.5"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span><b>{item.value}</b></button>)}</div>
            </div>
          </div>

          {selectedClientId && <CustomerDetail clientId={selectedClientId} windowDays={windowDays} money={money} cSym={cSym} onClose={() => setSelectedClientId(null)} />}

          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-sm">Radar accionable de clientes</h3><p className="text-[11px] text-muted-foreground">Abre cualquier renglón para ver su historia y qué productos cambiaron. Mostrando {Math.min(visibleRows, filteredClients.length)} de {filteredClients.length}.</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{fmtNum(filteredClients.length)} resultados</span></div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {([
                  ['attention', 'Atención inmediata', 'Caen, se alejan o ya están inactivos', AlertTriangle, 'text-red-600'],
                  ['opportunity', 'Oportunidades', 'Nuevos, recuperados o creciendo', TrendingUp, 'text-emerald-600'],
                  ['stable', 'Estables', 'Mantienen su patrón de compra', Activity, 'text-slate-600'],
                  ['no_sales', 'Sin compras', 'Registrados que aún no convierten', UserPlus, 'text-amber-600'],
                  ['all', 'Toda la cartera', 'Vista completa sin agrupación', Users, 'text-primary'],
                ] as const).map(([key, label, description, Icon, tone]) => <button key={key} onClick={() => { setPortfolioView(key); setSegment('todos'); setVisibleRows(100); }} className={cn('rounded-xl border p-3 text-left transition-colors', portfolioView === key ? 'border-primary bg-primary/[0.055] shadow-sm' : 'border-border bg-background hover:bg-accent/40')}><div className="flex items-center justify-between gap-2"><Icon className={cn('h-4 w-4', tone)} /><span className="text-lg font-black tabular-nums">{fmtNum(portfolioCounts[key])}</span></div><p className="mt-2 text-xs font-black">{label}</p><p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{description}</p></button>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setVisibleRows(100); }} placeholder="Buscar cliente, código, vendedor o zona…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/30" /></div>
                <select value={segment} onChange={e => { setPortfolioView('all'); setSegment(e.target.value as 'todos' | CustomerSegment); setVisibleRows(100); }} className="h-9 min-w-[150px] rounded-lg border border-border bg-background px-3 text-xs"><option value="todos">Todos los estados</option>{CUSTOMER_SEGMENTS.map(key => <option key={key} value={key}>{CUSTOMER_SEGMENT_INFO[key].label}</option>)}</select>
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
