import { useState, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, CreditCard,
  Package, AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight,
  BarChart3, Users, UserX, Loader2, RotateCcw,
  MapPin, Truck, ClipboardList, Activity,
} from 'lucide-react';
import { cn, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useVendedores } from '@/hooks/useClientes';
import {
  useDashboardVentas, useDashboardCobros, useDashboardCompras,
  useDashboardGastos, useDashboardCartera, useDashboardStock,
  useDashboardTopProductos, useDashboardVentasPorDia, useDashboardVentasPorVendedor,
  useDashboardDevoluciones, useDashboardHoy,
  useDashboardEvolucionMensual, useDashboardVentasPorMes, useDashboardVentasUsuarioMes,
  useDashboardVentaLineasIS,
  type DateRange
} from '@/hooks/useDashboardData';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart, Legend, ReferenceLine,
} from 'recharts';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TrialCountdownBanner from '@/components/TrialCountdownBanner';
import DashboardAIAdvisor from '@/components/dashboard/DashboardAIAdvisor';

import MetaDelMesCard from './dashboard/sections/MetaDelMesCard';
import KpiExtras from './dashboard/sections/KpiExtras';
import TabEquipo from './dashboard/sections/TabEquipo';
import TabCartera from './dashboard/sections/TabCartera';
import TabInventario from './dashboard/sections/TabInventario';
import TabMetas from './dashboard/sections/TabMetas';
import ClientesSinCompraModal from './dashboard/sections/ClientesSinCompraModal';
import { useMonthlyGoal } from './dashboard/hooks/useMonthlyGoal';
import { useDashboardVisitas, useClientesActivos, useUltimaCompraPorCliente } from './dashboard/hooks/useDashboardExtra';
import { Target, Route, Wrench, Sparkles } from 'lucide-react';
import { startOfMonth as startOfMonthFn, endOfMonth as endOfMonthFn } from 'date-fns';

const PRESETS = [
  { label: 'Hoy', range: () => ({ from: new Date(), to: new Date() }) },
  { label: '7 días', range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: '30 días', range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: 'Este mes', range: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Semana', range: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
];

const CHART_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', '#f97316', '#06b6d4', '#8b5cf6'
];

// money is now defined inside the component to use useCurrency hook

function KpiCard({ title, value, subtitle, icon: Icon, trend, color }: {
  title: string; value: string; subtitle?: string; icon: React.ElementType; trend?: number; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-4.5 w-4.5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
      {(subtitle || trend !== undefined) && (
        <div className="flex items-center gap-2">
          {trend !== undefined && (
            <span className={cn("flex items-center gap-0.5 text-xs font-semibold",
              trend >= 0 ? "text-emerald-600" : "text-red-500"
            )}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend).toFixed(0)}%
            </span>
          )}
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

function HoyTile({ label, value, sub, icon: Icon, tone = 'default' }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneMap = {
    default: 'before:bg-primary text-foreground',
    success: 'before:bg-[hsl(var(--success))] text-foreground',
    warning: 'before:bg-[hsl(var(--warning))] text-foreground',
    danger:  'before:bg-destructive text-foreground',
    info:    'before:bg-[hsl(var(--chart-2))] text-foreground',
  } as const;
  return (
    <div className={cn(
      "relative bg-card border border-border rounded-lg pl-3 pr-3 py-2.5",
      "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full",
      toneMap[tone]
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
      </div>
      <div className="text-xl md:text-2xl font-black tabular-nums tracking-tight text-foreground leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function IsTile({ label, value, hint, tone = 'default', emphasize }: {
  label: string; value: string; hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  emphasize?: boolean;
}) {
  const toneMap = {
    default: 'before:bg-primary',
    success: 'before:bg-[hsl(var(--success))]',
    warning: 'before:bg-[hsl(var(--warning))]',
    danger:  'before:bg-destructive',
    info:    'before:bg-[hsl(var(--chart-2))]',
  } as const;
  return (
    <div className={cn(
      "relative bg-card border rounded-lg pl-3 pr-3 py-2.5",
      emphasize ? "border-primary/40 shadow-sm" : "border-border",
      "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full",
      toneMap[tone]
    )}>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums tracking-tight text-foreground leading-tight mt-0.5",
        emphasize ? "text-2xl font-black" : "text-xl font-bold"
      )}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function HoyBand({ hoy, money }: { hoy: any; money: (n: number) => string }) {
  const todayLabel = (() => {
    try {
      const d = hoy?.today ? new Date(hoy.today + 'T12:00:00') : new Date();
      return format(d, "EEEE d 'de' MMMM", { locale: es });
    } catch { return ''; }
  })();
  const pctEntregas = hoy && hoy.entregasTotales > 0 ? Math.round((hoy.entregasHechas / hoy.entregasTotales) * 100) : null;
  const entregasTone: 'success' | 'warning' | 'danger' | 'info' =
    pctEntregas === null ? 'info' : pctEntregas >= 90 ? 'success' : pctEntregas >= 60 ? 'warning' : 'danger';

  return (
    <section className="bg-gradient-to-br from-primary/[0.04] via-card to-card border border-primary/20 rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-[0.15em] text-foreground">Hoy</h2>
          <span className="text-xs text-muted-foreground capitalize">· {todayLabel}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Actualizado en vivo</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <HoyTile
          label="Visitas"
          value={fmtNum(hoy?.visitasCount ?? 0)}
          sub={`${hoy?.vendedoresActivos ?? 0} vendedor${(hoy?.vendedoresActivos ?? 0) === 1 ? '' : 'es'} activo${(hoy?.vendedoresActivos ?? 0) === 1 ? '' : 's'}`}
          icon={MapPin}
          tone="info"
        />
        <HoyTile
          label="Entregas"
          value={`${fmtNum(hoy?.entregasHechas ?? 0)} / ${fmtNum(hoy?.entregasTotales ?? 0)}`}
          sub={pctEntregas === null ? 'Sin programadas' : `${pctEntregas}% completado`}
          icon={Truck}
          tone={entregasTone}
        />
        <HoyTile
          label="Ventas"
          value={money(hoy?.ventasTotal ?? 0)}
          sub={`${hoy?.ventasCount ?? 0} operaciones`}
          icon={ShoppingCart}
          tone="default"
        />
        <HoyTile
          label="Cobros"
          value={money(hoy?.cobrosTotal ?? 0)}
          sub={`${hoy?.cobrosCount ?? 0} movimientos`}
          icon={Wallet}
          tone="success"
        />
        <HoyTile
          label="Pedidos pend."
          value={fmtNum(hoy?.pedidosPendientes ?? 0)}
          sub="Por entregar"
          icon={ClipboardList}
          tone={(hoy?.pedidosPendientes ?? 0) > 0 ? 'warning' : 'default'}
        />
        <HoyTile
          label="Gastos"
          value={money(hoy?.gastosTotal ?? 0)}
          sub={`${hoy?.gastosCount ?? 0} movimientos`}
          icon={Activity}
          tone={(hoy?.gastosTotal ?? 0) > 0 ? 'danger' : 'default'}
        />
      </div>
    </section>
  );
}

function SectionTitle({ children, icon: Icon }: { children: string; icon: React.ElementType }) {
  return (
    <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mt-6 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      {children}
    </h2>
  );
}

// ============ Rankings: Top/Bottom productos & clientes con selector N ============
function buildParetoInsight(sortedDesc: { nombre: string; total: number }[], totalAll: number, label: string) {
  if (totalAll <= 0 || sortedDesc.length === 0) return null;
  let acc = 0;
  let count50 = 0;
  for (const it of sortedDesc) {
    acc += it.total;
    count50 += 1;
    if (acc / totalAll >= 0.5) break;
  }
  const top1Pct = (sortedDesc[0].total / totalAll) * 100;
  return { count50, pct50: (acc / totalAll) * 100, top1Pct, top1Name: sortedDesc[0].nombre, totalAll, label };
}

function RankingRow({
  pos, nombre, sub, total, pct, accPct, money, tone,
}: {
  pos: number; nombre: string; sub?: string; total: number; pct: number; accPct: number;
  money: (n: number) => string; tone: 'top' | 'bottom';
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
        tone === 'top' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>{pos}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{nombre}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
        <div className="mt-1 h-1 bg-accent rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full", tone === 'top' ? 'bg-primary' : 'bg-destructive')}
            style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-semibold text-foreground tabular-nums">{money(total)}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground/80">{pct.toFixed(1)}%</span>
          <span className="opacity-60"> · acum {accPct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function ParetoBanner({ insight, kind }: { insight: ReturnType<typeof buildParetoInsight>; kind: 'productos' | 'clientes' }) {
  if (!insight) return null;
  return (
    <div className="rounded-lg bg-primary/[0.06] border border-primary/20 px-3 py-2 mb-3 text-[11px] leading-snug text-foreground">
      <strong className="text-primary">{insight.count50} {kind === 'productos' ? 'producto' : 'cliente'}{insight.count50 === 1 ? '' : 's'}</strong>
      {' '}representa{insight.count50 === 1 ? '' : 'n'} el <strong>{insight.pct50.toFixed(0)}%</strong> de tus ventas.
      {insight.top1Pct >= 15 && (
        <> Solo <strong>{insight.top1Name}</strong> aporta el <strong>{insight.top1Pct.toFixed(0)}%</strong>.</>
      )}
    </div>
  );
}

function RankingsSection({
  topProductos,
  topClientesAll,
  money,
}: {
  topProductos: { id: string; nombre: string; codigo?: string; qty: number; total: number }[];
  topClientesAll: { id: string; nombre: string; total: number; count: number }[];
  money: (n: number) => string;
}) {
  const [nProd, setNProd] = useState(10);
  const [ordProd, setOrdProd] = useState<'top' | 'bottom'>('top');
  const [nCli, setNCli] = useState(10);
  const [ordCli, setOrdCli] = useState<'top' | 'bottom'>('top');

  const prodActive = topProductos.filter(p => p.total > 0);
  const cliActive = topClientesAll.filter(c => c.total > 0);
  const totalProd = prodActive.reduce((s, p) => s + p.total, 0);
  const totalCli = cliActive.reduce((s, c) => s + c.total, 0);

  const prodSortedFull = useMemo(
    () => [...prodActive].sort((a, b) => b.total - a.total),
    [prodActive],
  );
  const cliSortedFull = useMemo(
    () => [...cliActive].sort((a, b) => b.total - a.total),
    [cliActive],
  );
  const paretoProd = useMemo(() => buildParetoInsight(prodSortedFull, totalProd, 'productos'), [prodSortedFull, totalProd]);
  const paretoCli = useMemo(() => buildParetoInsight(cliSortedFull, totalCli, 'clientes'), [cliSortedFull, totalCli]);

  // Cumulative is always computed from the descending order (so even "Menos" view shows real ranking position)
  const prodWithCum = useMemo(() => {
    let acc = 0;
    return prodSortedFull.map(p => {
      acc += p.total;
      return { ...p, pct: totalProd > 0 ? (p.total / totalProd) * 100 : 0, accPct: totalProd > 0 ? (acc / totalProd) * 100 : 0 };
    });
  }, [prodSortedFull, totalProd]);
  const cliWithCum = useMemo(() => {
    let acc = 0;
    return cliSortedFull.map(c => {
      acc += c.total;
      return { ...c, pct: totalCli > 0 ? (c.total / totalCli) * 100 : 0, accPct: totalCli > 0 ? (acc / totalCli) * 100 : 0 };
    });
  }, [cliSortedFull, totalCli]);

  const prodsView = ordProd === 'top' ? prodWithCum.slice(0, nProd) : [...prodWithCum].reverse().slice(0, nProd);
  const cliView = ordCli === 'top' ? cliWithCum.slice(0, nCli) : [...cliWithCum].reverse().slice(0, nCli);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Productos */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            {ordProd === 'top' ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            {ordProd === 'top' ? 'Productos más vendidos' : 'Productos menos vendidos'}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-accent rounded-lg p-[4px] gap-0">
              <button onClick={() => setOrdProd('top')} className={cn("px-2 py-1 rounded text-[11px] font-semibold", ordProd === 'top' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>Más</button>
              <button onClick={() => setOrdProd('bottom')} className={cn("px-2 py-1 rounded text-[11px] font-semibold", ordProd === 'bottom' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>Menos</button>
            </div>
            <select value={nProd} onChange={e => setNProd(Number(e.target.value))} className="text-[11px] border border-border rounded-md bg-card px-2 py-1 font-medium">
              {[5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
        </div>
        {ordProd === 'top' && <ParetoBanner insight={paretoProd} kind="productos" />}
        <div className="space-y-0 max-h-[460px] overflow-y-auto pr-1">
          {prodsView.map((p, i) => (
            <RankingRow
              key={p.id}
              pos={ordProd === 'top' ? i + 1 : prodWithCum.length - i}
              nombre={p.nombre}
              sub={`${fmtNum(p.qty)} uds${p.codigo ? ` · ${p.codigo}` : ''}`}
              total={p.total}
              pct={p.pct}
              accPct={p.accPct}
              money={money}
              tone={ordProd}
            />
          ))}
          {prodsView.length === 0 && <p className="text-xs text-muted-foreground py-2">Sin datos</p>}
        </div>
        {totalProd > 0 && (
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Total ventas (productos)</span>
            <span className="font-bold tabular-nums">{money(totalProd)}</span>
          </div>
        )}
      </div>

      {/* Clientes */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {ordCli === 'top' ? 'Mejores clientes' : 'Clientes con menos compras'}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-accent rounded-lg p-[4px] gap-0">
              <button onClick={() => setOrdCli('top')} className={cn("px-2 py-1 rounded text-[11px] font-semibold", ordCli === 'top' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>Más</button>
              <button onClick={() => setOrdCli('bottom')} className={cn("px-2 py-1 rounded text-[11px] font-semibold", ordCli === 'bottom' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>Menos</button>
            </div>
            <select value={nCli} onChange={e => setNCli(Number(e.target.value))} className="text-[11px] border border-border rounded-md bg-card px-2 py-1 font-medium">
              {[5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
        </div>
        {ordCli === 'top' && <ParetoBanner insight={paretoCli} kind="clientes" />}
        <div className="space-y-0 max-h-[460px] overflow-y-auto pr-1">
          {cliView.map((c, i) => (
            <RankingRow
              key={c.id}
              pos={ordCli === 'top' ? i + 1 : cliWithCum.length - i}
              nombre={c.nombre}
              sub={`${c.count} venta${c.count === 1 ? '' : 's'}`}
              total={c.total}
              pct={c.pct}
              accPct={c.accPct}
              money={money}
              tone={ordCli}
            />
          ))}
          {cliView.length === 0 && <p className="text-xs text-muted-foreground py-2">Sin datos</p>}
        </div>
        {totalCli > 0 && (
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Total ventas (clientes)</span>
            <span className="font-bold tabular-nums">{money(totalCli)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Evolución mensual con selección múltiple ============
const EVO_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', '#f97316', '#06b6d4', '#8b5cf6'];

function EvolucionMensualSection({
  evolucion,
  money,
  cSym,
}: {
  evolucion: any;
  money: (n: number) => string;
  cSym: string;
}) {
  const [tipo, setTipo] = useState<'producto' | 'cliente' | 'vendedor'>('producto');
  const [seleccion, setSeleccion] = useState<Record<string, string[]>>({ producto: [], cliente: [], vendedor: [] });
  const [search, setSearch] = useState('');

  const lista = useMemo(() => {
    if (!evolucion) return [];
    const arr = (tipo === 'producto' ? evolucion.productos : tipo === 'cliente' ? evolucion.clientes : evolucion.vendedores) as any[];
    return arr;
  }, [evolucion, tipo]);

  // Auto-seleccionar top 3 al cambiar tipo si vacío
  const seleccionados = seleccion[tipo];
  const effective = seleccionados.length > 0
    ? lista.filter(x => seleccionados.includes(x.id))
    : lista.slice(0, 3);

  const chartData = useMemo(() => {
    if (!evolucion) return [];
    return evolucion.meses.map(({ key, label }: any) => {
      const row: any = { label };
      effective.forEach((e: any) => { row[e.nombre] = e.porMes[key] ?? 0; });
      return row;
    });
  }, [evolucion, effective]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? lista.filter(x => x.nombre.toLowerCase().includes(s)) : lista.slice(0, 30);
  }, [lista, search]);

  const toggle = (id: string) => {
    setSeleccion(prev => {
      const cur = prev[tipo];
      const next = cur.includes(id) ? cur.filter(x => x !== id) : cur.length >= 8 ? cur : [...cur, id];
      return { ...prev, [tipo]: next };
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Crecimiento de ventas por mes (12 meses)
        </h2>
        <div className="flex bg-accent rounded-lg p-[4px] gap-0">
          {(['producto', 'cliente', 'vendedor'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} className={cn("px-3 py-1 rounded text-[11px] font-semibold capitalize", tipo === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
              {t === 'producto' ? 'Productos' : t === 'cliente' ? 'Clientes' : 'Vendedores'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 border border-border rounded-lg p-2 bg-accent/20">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar ${tipo}...`}
            className="w-full text-xs px-2 py-1.5 border border-border rounded-md bg-card mb-2"
          />
          <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-bold flex items-center justify-between">
            <span>Selección ({seleccionados.length}/8)</span>
            {seleccionados.length > 0 && (
              <button onClick={() => setSeleccion(p => ({ ...p, [tipo]: [] }))} className="text-primary hover:underline normal-case">Limpiar</button>
            )}
          </div>
          <div className="max-h-[260px] overflow-y-auto space-y-0.5">
            {filtered.map((x: any) => {
              const checked = seleccionados.includes(x.id);
              return (
                <label key={x.id} className={cn("flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[11px] hover:bg-accent/50", checked && "bg-primary/10")}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(x.id)} className="shrink-0" />
                  <span className="flex-1 truncate font-medium">{x.nombre}</span>
                  <span className="tabular-nums text-muted-foreground">{money(x.total)}</span>
                </label>
              );
            })}
            {filtered.length === 0 && <p className="text-[11px] text-muted-foreground p-2">Sin resultados</p>}
          </div>
          {seleccionados.length === 0 && <p className="text-[10px] text-muted-foreground mt-2 italic">Mostrando top 3 por defecto</p>}
        </div>

        <div className="lg:col-span-3">
          {chartData.length > 0 && effective.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${cSym}${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => money(v)} />
                {effective.map((e: any, i: number) => (
                  <Line key={e.id} type="monotone" dataKey={e.nombre} stroke={EVO_COLORS[i % EVO_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-xs text-muted-foreground">Selecciona elementos para ver su evolución</div>
          )}
          {effective.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {effective.map((e: any, i: number) => (
                <span key={e.id} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/50">
                  <span className="w-2 h-2 rounded-full" style={{ background: EVO_COLORS[i % EVO_COLORS.length] }} />
                  {e.nombre}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Tabla: ventas por mes con crecimiento ============
function VentasPorMesTable({ data, money, cSym }: { data: any[]; money: (n: number) => string; cSym: string }) {
  const chartData = (data ?? []).map((r: any) => ({
    label: r.label,
    total: r.total,
    prev: r.prev,
    growth: r.growth ?? 0,
    growthDisplay: r.growth === null ? null : r.growth,
  }));
  const promedio = chartData.length > 0 ? chartData.reduce((s, r) => s + r.total, 0) / chartData.length : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mt-4">
      <SectionTitle icon={BarChart3}>Ventas por mes — Crecimiento vs mes anterior</SectionTitle>

      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Combo: barras ventas + línea crecimiento */}
          <div className="border border-border rounded-lg p-3 bg-accent/10">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Ventas y % crecimiento</h4>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${cSym}${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, name: string) => name === 'Crecimiento' ? [`${Number(v).toFixed(1)}%`, name] : [money(Number(v)), name]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine yAxisId="left" y={promedio} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'Promedio', position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                <Bar yAxisId="left" dataKey="total" name="Ventas" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="growth" name="Crecimiento" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Barras comparativas mes actual vs mes anterior por mes */}
          <div className="border border-border rounded-lg p-3 bg-accent/10">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Comparativo: mes vs mes anterior</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${cSym}${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="prev" name="Mes anterior" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="total" name="Mes" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-muted-foreground font-medium">Mes</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Operaciones</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Total</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Mes anterior</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Crecimiento</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map(r => (
              <tr key={r.key} className="border-b border-border/30 hover:bg-accent/30">
                <td className="py-2 font-medium text-foreground capitalize">{r.label}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{r.count}</td>
                <td className="py-2 text-right font-semibold text-foreground tabular-nums">{money(r.total)}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{money(r.prev)}</td>
                <td className="py-2 text-right">
                  {r.growth === null ? <span className="text-muted-foreground">—</span> : (
                    <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums",
                      r.growth >= 0 ? 'text-emerald-600' : 'text-red-500'
                    )}>
                      {r.growth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(r.growth).toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sin datos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Tabla: ventas por usuario mes actual vs anterior ============
function UsuarioMesVsMesTable({ data, money, cSym }: { data: any[]; money: (n: number) => string; cSym: string }) {
  const sorted = [...(data ?? [])].sort((a, b) => b.cur - a.cur);
  const chartData = sorted.map(r => ({
    nombre: r.nombre.length > 14 ? r.nombre.slice(0, 14) + '…' : r.nombre,
    nombreFull: r.nombre,
    'Mes anterior': r.prev,
    'Mes actual': r.cur,
    growth: r.growth,
  }));
  const growthData = sorted.map(r => ({
    nombre: r.nombre.length > 14 ? r.nombre.slice(0, 14) + '…' : r.nombre,
    growth: r.growth,
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-4 mt-4">
      <SectionTitle icon={Users}>Ventas por usuario — Mes actual vs mes anterior</SectionTitle>

      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Barras agrupadas vendedor: mes vs mes anterior */}
          <div className="border border-border rounded-lg p-3 bg-accent/10">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Por vendedor</h4>
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 32)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${cSym}${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={100} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => money(v)} labelFormatter={(_, p) => p?.[0]?.payload?.nombreFull ?? ''} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Mes anterior" fill="hsl(var(--chart-3))" radius={[0, 3, 3, 0]} />
                <Bar dataKey="Mes actual" fill="hsl(var(--chart-1))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Barras de % crecimiento por vendedor */}
          <div className="border border-border rounded-lg p-3 bg-accent/10">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">% Crecimiento por vendedor</h4>
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 32)}>
              <BarChart data={growthData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={100} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'Crecimiento']} />
                <ReferenceLine x={0} stroke="hsl(var(--border))" />
                <Bar dataKey="growth" radius={[0, 3, 3, 0]}>
                  {growthData.map((r, i) => (
                    <Cell key={i} fill={r.growth >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-muted-foreground font-medium">Vendedor</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Mes anterior</th>
              <th className="text-right py-2 text-muted-foreground font-medium"># mes ant.</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Mes actual</th>
              <th className="text-right py-2 text-muted-foreground font-medium"># mes act.</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Crecimiento</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className="border-b border-border/30 hover:bg-accent/30">
                <td className="py-2 font-medium text-foreground">{r.nombre}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{money(r.prev)}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{r.prevCount}</td>
                <td className="py-2 text-right font-semibold text-foreground tabular-nums">{money(r.cur)}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{r.curCount}</td>
                <td className="py-2 text-right">
                  <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums",
                    r.growth >= 0 ? 'text-emerald-600' : 'text-red-500'
                  )}>
                    {r.growth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(r.growth).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Sin datos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {


  const { symbol: cSym, code: cCode } = useCurrency();
  const money = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: cCode, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const [activePreset, setActivePreset] = useState(3); // Este mes
  const [dateRange, setDateRange] = useState<DateRange>(PRESETS[3].range());
  const [vendedorId, setVendedorId] = useState('');

  const { data: vendedores } = useVendedores();

  // Data hooks
  const { data: ventas, isLoading: loadingVentas } = useDashboardVentas(dateRange, vendedorId || undefined);
  const { data: cobros } = useDashboardCobros(dateRange, vendedorId || undefined);
  const { data: compras } = useDashboardCompras(dateRange);
  const { data: gastos } = useDashboardGastos(dateRange, vendedorId || undefined);
  const { data: cartera } = useDashboardCartera();
  const { data: stock } = useDashboardStock();
  const { data: topProductos } = useDashboardTopProductos(dateRange);
  const { data: ventasPorDia } = useDashboardVentasPorDia(dateRange, vendedorId || undefined);
  const { data: ventasPorVendedor } = useDashboardVentasPorVendedor(dateRange);
  const { data: devoluciones } = useDashboardDevoluciones(dateRange, vendedorId || undefined);
  const { data: hoy } = useDashboardHoy(vendedorId || undefined);
  const { data: ventaLineasIS } = useDashboardVentaLineasIS(dateRange, vendedorId || undefined);

  // === Período anterior (comparativo) ===
  const prevRange = useMemo<DateRange>(() => {
    const fromMs = dateRange.from.getTime();
    const toMs = dateRange.to.getTime();
    const spanMs = toMs - fromMs;
    const dayMs = 24 * 60 * 60 * 1000;
    const span = spanMs + dayMs;
    return { from: new Date(fromMs - span), to: new Date(fromMs - dayMs) };
  }, [dateRange]);
  const { data: ventasPrev } = useDashboardVentas(prevRange, vendedorId || undefined);
  const { data: cobrosPrev } = useDashboardCobros(prevRange, vendedorId || undefined);
  const { data: comprasPrev } = useDashboardCompras(prevRange);
  const { data: gastosPrev } = useDashboardGastos(prevRange, vendedorId || undefined);
  const prevKpis = useMemo(() => {
    const v = (ventasPrev ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
    const c = (cobrosPrev ?? []).reduce((s, r) => s + Number(r.monto ?? 0), 0);
    const co = (comprasPrev ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
    const g = (gastosPrev ?? []).reduce((s, r) => s + Number(r.monto ?? 0), 0);
    const n = (ventasPrev ?? []).length;
    return { ventas: v, cobros: c, compras: co, gastos: g, ticket: n > 0 ? v / n : 0 };
  }, [ventasPrev, cobrosPrev, comprasPrev, gastosPrev]);
  const calcTrend = (curr: number, prev: number) => {
    if (!prev || prev === 0) return undefined;
    return ((curr - prev) / prev) * 100;
  };

  // === Datos para nuevas secciones ===
  const { data: monthlyGoal = 0 } = useMonthlyGoal();
  const monthRange = useMemo(() => ({ from: startOfMonthFn(new Date()), to: endOfMonthFn(new Date()) }), []);
  const { data: ventasMesData } = useDashboardVentas(monthRange);
  const { data: cobrosMesData } = useDashboardCobros(monthRange);
  const { data: comprasMesData } = useDashboardCompras(monthRange);
  const { data: gastosMesData } = useDashboardGastos(monthRange);
  const { data: visitasPeriodo } = useDashboardVisitas(dateRange, vendedorId || undefined);
  const { data: clientesActivos = [] } = useClientesActivos();
  const { data: ultimaCompraMap } = useUltimaCompraPorCliente();
  const [sinCompraOpen, setSinCompraOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');

  const MOTIVO_LABELS: Record<string, string> = { no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro' };

  const devStats = useMemo(() => {
    let totalUnidades = 0;
    let totalCredito = 0;
    const porMotivo: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    const porVendedor: Record<string, { nombre: string; uds: number }> = {};
    (devoluciones ?? []).forEach((d: any) => {
      const tipo = d.tipo || 'otro';
      (d.devolucion_lineas ?? []).forEach((l: any) => {
        const qty = Number(l.cantidad) || 0;
        totalUnidades += qty;
        totalCredito += Number(l.monto_credito) || 0;
        const motivo = l.motivo || 'otro';
        porMotivo[motivo] = (porMotivo[motivo] || 0) + qty;
        porTipo[tipo] = (porTipo[tipo] || 0) + qty;
      });
      const vNombre = d.vendedores?.nombre || 'Sin vendedor';
      const vId = d.vendedor_id || 'none';
      if (!porVendedor[vId]) porVendedor[vId] = { nombre: vNombre, uds: 0 };
      porVendedor[vId].uds += (d.devolucion_lineas ?? []).reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
    });
    const motivoChart = Object.entries(porMotivo).map(([key, value]) => ({ name: MOTIVO_LABELS[key] || key, value }));
    const tipoChart = Object.entries(porTipo).map(([key, value]) => ({ name: key.charAt(0).toUpperCase() + key.slice(1), value }));
    const vendedorChart = Object.values(porVendedor).sort((a, b) => b.uds - a.uds);
    return { totalUnidades, totalCredito, count: (devoluciones ?? []).length, motivoChart, tipoChart, vendedorChart };
  }, [devoluciones]);

  // KPI calculations
  const kpis = useMemo(() => {
    const totalVentas = (ventas ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0);
    const numVentas = (ventas ?? []).length;
    const ticketPromedio = numVentas > 0 ? totalVentas / numVentas : 0;
    const pedidos = (ventas ?? []).filter(v => v.tipo === 'pedido').length;
    const ventasDirectas = numVentas - pedidos;

    const totalCobrado = (cobros ?? []).reduce((s, c) => s + Number(c.monto ?? 0), 0);
    const totalCartera = (cartera ?? []).reduce((s, v) => s + Number(v.saldo_pendiente ?? 0), 0);
    const clientesMorosos = new Set((cartera ?? []).map(v => v.cliente_id)).size;

    const totalCompras = (compras ?? []).reduce((s, c) => s + Number(c.total ?? 0), 0);
    const saldoProveedores = (compras ?? []).reduce((s, c) => s + Number(c.saldo_pendiente ?? 0), 0);

    const totalGastos = (gastos ?? []).reduce((s, g) => s + Number(g.monto ?? 0), 0);

    const productosTotal = (stock ?? []).length;
    const productosBajoMinimo = (stock ?? []).filter(p => Number(p.cantidad ?? 0) <= Number(p.min ?? 0) && Number(p.min ?? 0) > 0).length;
    const valorInventario = (stock ?? []).reduce((s, p) => s + Number(p.cantidad ?? 0) * Number(p.costo ?? 0), 0);

    const utilidadBruta = totalVentas - totalCompras - totalGastos;

    return {
      totalVentas, numVentas, ticketPromedio, pedidos, ventasDirectas,
      totalCobrado, totalCartera, clientesMorosos,
      totalCompras, saldoProveedores,
      totalGastos, utilidadBruta,
      productosTotal, productosBajoMinimo, valorInventario,
    };
  }, [ventas, cobros, compras, gastos, cartera, stock]);

  const lowStockProducts = useMemo(() =>
    (stock ?? [])
      .filter(p => Number(p.cantidad ?? 0) <= Number(p.min ?? 0) && Number(p.min ?? 0) > 0)
      .slice(0, 8),
    [stock]
  );

  const topClientsAll = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; count: number }>();
    (ventas ?? []).forEach((v: any) => {
      if (!v.cliente_id) return;
      const existing = map.get(v.cliente_id) ?? { nombre: v.clientes?.nombre ?? 'N/A', total: 0, count: 0 };
      existing.total += Number(v.total ?? 0);
      existing.count += 1;
      map.set(v.cliente_id, existing);
    });
    return [...map.entries()]
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => b.total - a.total);
  }, [ventas]);

  // === KPIs adicionales (periodo seleccionado) ===
  const kpisExtra = useMemo(() => {
    const visitas = (visitasPeriodo ?? []).length;
    const ventasConPedido = (visitasPeriodo ?? []).filter((v: any) => !!v.venta_id).length;
    const efectividadPct = visitas > 0 ? (ventasConPedido / visitas) * 100 : 0;
    const visitasPlaneadas = 0; // se calcula por vendedor en TabEquipo; aquí dejamos genérico
    const cumplimientoPct = 0;
    const dropSize = ventasConPedido > 0 ? kpis.totalVentas / ventasConPedido : 0;
    const desde = new Date(dateRange.from); desde.setHours(0,0,0,0);
    const hasta = new Date(dateRange.to); hasta.setHours(23,59,59,999);
    const clientesIdsConCompra = new Set<string>();
    (ventas ?? []).forEach((v: any) => { if (v.cliente_id) clientesIdsConCompra.add(v.cliente_id); });
    const totalActivos = (clientesActivos ?? []).length;
    const cobertura = totalActivos > 0 ? (clientesIdsConCompra.size / totalActivos) * 100 : 0;
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const sinCompra30 = (clientesActivos ?? []).filter((c: any) => {
      const last = ultimaCompraMap?.get(c.id);
      if (!last) return true;
      const d = new Date(last); d.setHours(0,0,0,0);
      return Math.floor((hoyD.getTime() - d.getTime()) / 86400000) >= 30;
    });
    return {
      visitas, ventasConPedido, efectividadPct, visitasPlaneadas, cumplimientoPct,
      dropSize, cobertura, clientesConCompra: clientesIdsConCompra.size,
      clientesActivos: totalActivos, clientesSinCompra30d: sinCompra30.length, sinCompra30,
    };
  }, [visitasPeriodo, ventas, clientesActivos, ultimaCompraMap, kpis.totalVentas, dateRange]);

  const metaMesData = useMemo(() => {
    const ventasMes = (ventasMesData ?? []).reduce((s, v: any) => s + Number(v.total || 0), 0);
    const cobradoMes = (cobrosMesData ?? []).reduce((s, c: any) => s + Number(c.monto || 0), 0);
    const gastosMes = (gastosMesData ?? []).reduce((s, g: any) => s + Number(g.monto || 0), 0);
    const comprasMes = (comprasMesData ?? []).reduce((s, c: any) => s + Number(c.total || 0), 0);
    const margenMonto = ventasMes - comprasMes;
    return { ventasMes, cobradoMes, gastosMes, margenMonto };
  }, [ventasMesData, cobrosMesData, gastosMesData, comprasMesData]);

  const devolucionesPct = kpis.totalVentas > 0 ? (devStats.totalCredito / kpis.totalVentas) * 100 : 0;

  // === Estado de resultados (rango seleccionado) ===
  const estadoResultados = useMemo(() => {
    const lineas = (ventaLineasIS?.lineas ?? []) as any[];
    const costMap = ventaLineasIS?.costMap ?? new Map<string, number>();
    const ventasMap = new Map<string, any>();
    let ventasNetas = 0;     // subtotal después de descuento, antes de impuestos
    let ventasBrutas = 0;    // subtotal de la venta antes de descuentos
    let descuentos = 0;
    let impuestos = 0;
    let totalConImpuestos = 0;
    let costo = 0;
    for (const l of lineas) {
      const cant = Number(l.cantidad) || 0;
      const venta = l.ventas;
      if (venta?.id && !ventasMap.has(venta.id)) ventasMap.set(venta.id, venta);
      const cu = costMap.get(l.producto_id) || 0;
      const factor = Number(l.presentacion_factor) || 1;
      costo += cu * factor * cant;
    }
    ventasMap.forEach((v: any) => {
      const bruto = Number(v.subtotal) || 0;
      const iva = Number(v.iva_total) || 0;
      const ieps = Number(v.ieps_total) || 0;
      const total = Number(v.total) || 0;
      const descuento = Number(v.descuento_total) || Math.max(0, bruto - total + iva + ieps);
      ventasBrutas += bruto;
      descuentos += descuento;
      ventasNetas += Math.max(0, bruto - descuento);
      impuestos += iva + ieps;
      totalConImpuestos += total;
    });
    const devoluciones = devStats.totalCredito || 0;
    const ventasNetasFinal = ventasNetas - devoluciones;
    const utilidadBruta = ventasNetasFinal - costo;
    const margenPct = ventasNetasFinal > 0 ? (utilidadBruta / ventasNetasFinal) * 100 : 0;
    return { ventasNetas, ventasBrutas, descuentos, devoluciones, impuestos, totalConImpuestos, costo, utilidadBruta, margenPct, ventasNetasFinal };
  }, [ventaLineasIS, devStats.totalCredito]);


  const { data: evolucion } = useDashboardEvolucionMensual(12);
  const { data: ventasPorMes } = useDashboardVentasPorMes(12);
  const { data: usuarioMes } = useDashboardVentasUsuarioMes();

  const handlePreset = (idx: number) => {
    setActivePreset(idx);
    setDateRange(PRESETS[idx].range());
  };

  return (
    <div className="p-5 space-y-0 max-w-[1400px] mx-auto">
      <TrialCountdownBanner />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Dashboard
            <HelpButton title={HELP.dashboard.title} sections={HELP.dashboard.sections} />
            <VideoHelpButton module="dashboard" />
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(dateRange.from, "d MMM", { locale: es })} — {format(dateRange.to, "d MMM yyyy", { locale: es })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
          <div className="flex bg-accent rounded-lg p-[4px] gap-0 shrink-0">
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => handlePreset(i)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                  activePreset === i ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25" : "text-muted-foreground hover:text-foreground"
                )}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="shrink-0"><OdooDatePicker value={format(dateRange.from, 'yyyy-MM-dd')} onChange={d => { if (d) { setDateRange(prev => ({ ...prev, from: new Date(d + 'T12:00:00') })); setActivePreset(-1); }}} /></div>
          <div className="shrink-0"><OdooDatePicker value={format(dateRange.to, 'yyyy-MM-dd')} onChange={d => { if (d) { setDateRange(prev => ({ ...prev, to: new Date(d + 'T12:00:00') })); setActivePreset(-1); }}} /></div>
          <div className="w-[180px] shrink-0">
            <SearchableSelect
              options={[{ value: '', label: 'Todos los vendedores' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
              value={vendedorId}
              onChange={setVendedorId}
              placeholder="Vendedor..."
            />
          </div>
        </div>
      </div>

      {loadingVentas && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos...
        </div>
      )}







      {/* === Meta del mes + KPI Cards (solo visible en Resumen) === */}
      {activeTab === 'resumen' && (
        <>
          <MetaDelMesCard
            ventasMes={metaMesData.ventasMes}
            cobradoMes={metaMesData.cobradoMes}
            gastosMes={metaMesData.gastosMes}
            margenMonto={metaMesData.margenMonto}
            money={money}
          />


          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-3">
            <KpiCard title="Ventas" value={money(kpis.totalVentas)} subtitle={`${kpis.numVentas} ops · ant. ${money(prevKpis.ventas)}`} icon={ShoppingCart} color="bg-[hsl(var(--chart-1))]" trend={calcTrend(kpis.totalVentas, prevKpis.ventas)} />
            <KpiCard title="Ticket promedio" value={money(kpis.ticketPromedio)} subtitle={`${kpis.pedidos} pedidos · ${kpis.ventasDirectas} directas`} icon={TrendingUp} color="bg-[hsl(var(--chart-2))]" trend={calcTrend(kpis.ticketPromedio, prevKpis.ticket)} />
            <KpiCard title="Cobrado" value={money(kpis.totalCobrado)} subtitle={`${(cobros ?? []).length} cobros · ant. ${money(prevKpis.cobros)}`} icon={Wallet} color="bg-[hsl(var(--success))]" trend={calcTrend(kpis.totalCobrado, prevKpis.cobros)} />
            <KpiCard title="Cartera" value={money(kpis.totalCartera)} subtitle={`${kpis.clientesMorosos} clientes`} icon={CreditCard} color="bg-[hsl(var(--warning))]" />
            <KpiCard title="Compras" value={money(kpis.totalCompras)} subtitle={`Pendiente: ${money(kpis.saldoProveedores)}`} icon={Package} color="bg-[hsl(var(--chart-3))]" trend={calcTrend(kpis.totalCompras, prevKpis.compras)} />
            <KpiCard title="Gastos" value={money(kpis.totalGastos)} subtitle={`Utilidad: ${money(kpis.utilidadBruta)}`} icon={DollarSign} color={kpis.utilidadBruta >= 0 ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--destructive))]"} trend={calcTrend(kpis.totalGastos, prevKpis.gastos)} />
            <KpiCard title="Utilidad" value={money(estadoResultados.utilidadBruta)} subtitle={`Costo: ${money(estadoResultados.costo)} · Margen ${estadoResultados.margenPct.toFixed(1)}%`} icon={TrendingUp} color={estadoResultados.utilidadBruta >= 0 ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--destructive))]"} />
            <KpiCard title="Devoluciones" value={`${fmtNum(devStats.totalUnidades)} uds`} subtitle={`${devStats.count} registros · ${money(devStats.totalCredito)} crédito · ${devolucionesPct.toFixed(1)}% s/venta`} icon={RotateCcw} color="bg-[hsl(var(--chart-5))]" />
            <KpiExtras
              efectividadPct={kpisExtra.efectividadPct}
              visitas={kpisExtra.visitas}
              ventasConPedido={kpisExtra.ventasConPedido}
              cumplimientoPct={kpisExtra.cumplimientoPct}
              visitasPlaneadas={kpisExtra.visitasPlaneadas}
              dropSize={kpisExtra.dropSize}
              cobertura={kpisExtra.cobertura}
              clientesConCompra={kpisExtra.clientesConCompra}
              clientesActivos={kpisExtra.clientesActivos}
              clientesSinCompra30d={kpisExtra.clientesSinCompra30d}
              onSinCompraClick={() => setSinCompraOpen(true)}
              money={money}
            />
          </div>
        </>
      )}

      <ClientesSinCompraModal
        open={sinCompraOpen}
        onClose={() => setSinCompraOpen(false)}
        clientes={kpisExtra.sinCompra30.map((c: any) => {
          const last = ultimaCompraMap?.get(c.id) || null;
          const dias = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : 9999;
          return { id: c.id, nombre: c.nombre, vendedor_id: c.vendedor_id, ultimaCompra: last, diasSinCompra: dias };
        })}
      />


      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-5">
        <TabsList className="flex flex-wrap h-auto w-full bg-accent/50 p-1 rounded-lg gap-1 justify-start">
          <TabsTrigger value="resumen" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <BarChart3 className="h-3.5 w-3.5 mr-2" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="rankings" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <TrendingUp className="h-3.5 w-3.5 mr-2" /> Productos y Clientes
          </TabsTrigger>
          <TabsTrigger value="evolucion" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <Activity className="h-3.5 w-3.5 mr-2" /> Evolución mensual
          </TabsTrigger>
          <TabsTrigger value="comparativo" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <ArrowUpRight className="h-3.5 w-3.5 mr-2" /> Mes vs Mes
          </TabsTrigger>
          <TabsTrigger value="equipo" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <Users className="h-3.5 w-3.5 mr-2" /> Equipo
          </TabsTrigger>
          <TabsTrigger value="cartera" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <CreditCard className="h-3.5 w-3.5 mr-2" /> Cartera
          </TabsTrigger>
          <TabsTrigger value="inventario-tab" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <Package className="h-3.5 w-3.5 mr-2" /> Inventario
          </TabsTrigger>
          <TabsTrigger value="asesor-ia" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 mr-2" /> Asesor IA
          </TabsTrigger>
        </TabsList>

        {/* === RESUMEN === */}
        <TabsContent value="resumen" className="mt-4 space-y-4">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sales trend */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Tendencia de ventas</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ventasPorDia ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => { try { return format(new Date(v + 'T12:00:00'), 'd MMM', { locale: es }); } catch { return v; }}} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => `${cSym}${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [money(v), 'Total']}
                    labelFormatter={v => { try { return format(new Date(v + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es }); } catch { return v; }}}
                  />
                  <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sales by vendedor */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Ventas por vendedor</h3>
              {(ventasPorVendedor ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={ventasPorVendedor ?? []} dataKey="total" nameKey="nombre" cx="50%" cy="50%" outerRadius={90}
                      label={({ nombre, percent }) => `${(nombre as string).slice(0, 10)} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false} fontSize={10}>
                      {(ventasPorVendedor ?? []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>
              )}
            </div>
          </div>

          {/* Devoluciones charts */}
          {devStats.count > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-primary" /> Devoluciones por motivo
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={devStats.motivoChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false} fontSize={10}>
                      {devStats.motivoChart.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} uds`, 'Cantidad']} contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-primary" /> Devoluciones por tipo
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={devStats.tipoChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                    <Tooltip formatter={(v: number) => [`${v} uds`, 'Cantidad']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Low stock alerts */}
          <div className="bg-card border border-border rounded-xl p-4">
            <SectionTitle icon={AlertTriangle}>
              {`Alertas de stock (${kpis.productosBajoMinimo})`}
            </SectionTitle>
            {lowStockProducts.length > 0 ? (
              <div className="space-y-2">
                {lowStockProducts.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full shrink-0",
                      Number(p.cantidad ?? 0) <= 0 ? "bg-destructive" : "bg-[hsl(var(--warning))]"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{p.nombre}</div>
                      <div className="text-[10px] text-muted-foreground">{p.codigo}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-xs font-bold", Number(p.cantidad ?? 0) <= 0 ? "text-destructive" : "text-[hsl(var(--warning))]")}>
                        {fmtNum(Number(p.cantidad ?? 0))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">mín: {fmtNum(Number(p.min ?? 0))}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs text-muted-foreground">Sin productos bajo mínimo</p>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Valor del inventario</span>
              <span className="text-sm font-bold text-foreground">{money(kpis.valorInventario)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">Productos activos</span>
              <span className="text-sm font-semibold text-foreground">{kpis.productosTotal}</span>
            </div>
          </div>

          {/* Vendedor detail table */}
          {!vendedorId && (ventasPorVendedor ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <SectionTitle icon={Users}>Detalle por vendedor</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Vendedor</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Ventas</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Total</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Ticket prom.</th>
                      <th className="text-left py-2 text-muted-foreground font-medium pl-4">Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ventasPorVendedor ?? []).map(v => {
                      const pct = kpis.totalVentas > 0 ? (v.total / kpis.totalVentas) * 100 : 0;
                      return (
                        <tr key={v.id} className="border-b border-border/30 hover:bg-accent/30">
                          <td className="py-2 font-medium text-foreground">{v.nombre}</td>
                          <td className="py-2 text-right text-muted-foreground">{v.count}</td>
                          <td className="py-2 text-right font-semibold text-foreground">{money(v.total)}</td>
                          <td className="py-2 text-right text-muted-foreground">{money(v.count > 0 ? v.total / v.count : 0)}</td>
                          <td className="py-2 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* === RANKINGS === */}
        <TabsContent value="rankings" className="mt-4">
          <RankingsSection
            topProductos={topProductos ?? []}
            topClientesAll={topClientsAll}
            money={money}
          />
        </TabsContent>

        {/* === EVOLUCIÓN === */}
        <TabsContent value="evolucion" className="mt-4">
          <EvolucionMensualSection evolucion={evolucion} money={money} cSym={cSym} />
        </TabsContent>

        {/* === MES VS MES === */}
        <TabsContent value="comparativo" className="mt-4 space-y-4">
          <VentasPorMesTable data={ventasPorMes ?? []} money={money} cSym={cSym} />
          <UsuarioMesVsMesTable data={usuarioMes ?? []} money={money} cSym={cSym} />
        </TabsContent>

        {/* === EQUIPO === */}
        <TabsContent value="equipo" className="mt-4">
          <TabEquipo range={dateRange} metaMes={monthlyGoal} money={money} />
        </TabsContent>

        {/* === CARTERA === */}
        <TabsContent value="cartera" className="mt-4">
          <TabCartera range={dateRange} ventasMes={metaMesData.ventasMes} ventas={ventas ?? []} cobros={cobros ?? []} money={money} />
        </TabsContent>

        {/* === INVENTARIO === */}
        <TabsContent value="inventario-tab" className="mt-4">
          <TabInventario range={dateRange} money={money} />
        </TabsContent>




        {/* === ASESOR IA === */}
        <TabsContent value="asesor-ia" className="mt-4">
          <DashboardAIAdvisor buildSnapshot={() => ({
            periodo: { desde: format(dateRange.from, 'yyyy-MM-dd'), hasta: format(dateRange.to, 'yyyy-MM-dd') },
            hoy: hoy ? {
              ventasHoy: hoy.ventasTotal, ventasOps: hoy.ventasCount,
              cobrosHoy: hoy.cobrosTotal, cobrosOps: hoy.cobrosCount,
              visitas: hoy.visitasCount, vendedoresActivos: hoy.vendedoresActivos,
              entregasHechas: hoy.entregasHechas, entregasTotales: hoy.entregasTotales,
              pedidosPendientes: hoy.pedidosPendientes, gastos: hoy.gastosTotal,
            } : null,
            kpis: {
              totalVentas: kpis.totalVentas, numVentas: kpis.numVentas, ticketPromedio: kpis.ticketPromedio,
              pedidos: kpis.pedidos, ventasDirectas: kpis.ventasDirectas,
              totalCobrado: kpis.totalCobrado, totalCartera: kpis.totalCartera, clientesMorosos: kpis.clientesMorosos,
              totalCompras: kpis.totalCompras, saldoProveedores: kpis.saldoProveedores,
              totalGastos: kpis.totalGastos, utilidadBruta: kpis.utilidadBruta,
              productosBajoMinimo: kpis.productosBajoMinimo, valorInventario: kpis.valorInventario,
            },
            top5Productos: (topProductos ?? []).slice(0, 5).map((p: any) => ({ nombre: p.nombre, total: p.total, uds: p.qty })),
            top5Clientes: topClientsAll.slice(0, 5).map((c: any) => ({ nombre: c.nombre, total: c.total, ventas: c.count })),
            ventasPorVendedor: (ventasPorVendedor ?? []).map((v: any) => ({ nombre: v.nombre, total: v.total, ops: v.count })),
            ventasUltimos12Meses: (ventasPorMes ?? []).map((m: any) => ({ mes: m.label, total: m.total, growth: m.growth })),
            mesVsMesPorVendedor: (usuarioMes ?? []).slice(0, 10).map((u: any) => ({
              nombre: u.nombre, mesActual: u.cur, mesAnterior: u.prev, growthPct: u.growth,
            })),
            devoluciones: { count: devStats.count, unidades: devStats.totalUnidades, credito: devStats.totalCredito },
            stockCritico: lowStockProducts.slice(0, 10).map((p: any) => ({ nombre: p.nombre, cantidad: Number(p.cantidad ?? 0), min: Number(p.min ?? 0) })),
          })} />
        </TabsContent>
      </Tabs>

    </div>
  );
}
