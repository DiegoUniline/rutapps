import { useMemo, useState } from 'react';
import { todayLocal } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Users, Banknote, TrendingUp, Truck, Receipt, Search, Calendar as CalendarIcon, X, RotateCcw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

type TabKey = 'resumen' | 'ventas' | 'entregas' | 'cobros' | 'gastos' | 'devoluciones';

export default function RutaDashboard() {
  const navigate = useNavigate();
  const { profile, empresa, user } = useAuth();
  const { fmt } = useCurrency();
  const today = todayLocal();
  const vendedorId = profile?.id;

  // Filtros
  const [tab, setTab] = useState<TabKey>('resumen');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data: ventas } = useOfflineQuery('ventas', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: entregas } = useOfflineQuery('entregas', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: gastos } = useOfflineQuery('gastos', { empresa_id: empresa?.id, user_id: user?.id }, { enabled: !!empresa?.id && !!user?.id });
  const { data: cobros } = useOfflineQuery('cobros', { empresa_id: empresa?.id, user_id: user?.id }, { enabled: !!empresa?.id && !!user?.id });
  const { data: devoluciones } = useOfflineQuery('devoluciones', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });

  const clienteById = useMemo(() => {
    const m = new Map<string, any>();
    (clientes ?? []).forEach((c: any) => m.set(c.id, c));
    return m;
  }, [clientes]);

  // KPIs del día (hoy fijo, no afectados por filtros)
  const ventasHoy = (ventas ?? []).filter((v: any) => v.fecha === today && v.status !== 'cancelada');
  const entregasHoy = (entregas ?? []).filter((e: any) => (e.fecha_entrega ?? e.fecha) === today && e.status === 'entregado');
  const cobrosHoy = (cobros ?? []).filter((c: any) => c.fecha === today);
  const gastosHoy = (gastos ?? []).filter((g: any) => g.fecha === today);
  const clientesVisitadosHoy = new Set([
    ...ventasHoy.map((v: any) => v.cliente_id),
    ...entregasHoy.map((e: any) => e.cliente_id),
  ].filter(Boolean)).size;

  const kpis = {
    totalVentas: ventasHoy.reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    numVentas: ventasHoy.length,
    totalEntregas: entregasHoy.length,
    totalCobros: cobrosHoy.reduce((s: number, c: any) => s + (c.monto ?? 0), 0),
    numCobros: cobrosHoy.length,
    totalGastos: gastosHoy.reduce((s: number, g: any) => s + (g.monto ?? 0), 0),
    numGastos: gastosHoy.length,
    clientesVisitados: clientesVisitadosHoy,
  };

  const dayName = new Date().toLocaleDateString('es-MX', { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

  // Filtrado de listas
  const inRange = (fecha?: string) => {
    if (!fecha) return false;
    const f = (fecha || '').slice(0, 10);
    return f >= from && f <= to;
  };
  const matchSearch = (texts: (string | undefined | null)[]) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return texts.some(t => (t ?? '').toString().toLowerCase().includes(s));
  };

  const ventasFiltradas = useMemo(() => (ventas ?? [])
    .filter((v: any) => inRange(v.fecha))
    .filter((v: any) => matchSearch([v.folio, clienteById.get(v.cliente_id)?.nombre]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  , [ventas, from, to, search, clienteById]);

  const entregasFiltradas = useMemo(() => (entregas ?? [])
    .filter((e: any) => inRange(e.fecha_entrega ?? e.fecha))
    .filter((e: any) => matchSearch([e.folio, clienteById.get(e.cliente_id)?.nombre]))
    .sort((a: any, b: any) => ((b.fecha_entrega ?? b.fecha) ?? '').localeCompare((a.fecha_entrega ?? a.fecha) ?? ''))
  , [entregas, from, to, search, clienteById]);

  const cobrosFiltrados = useMemo(() => (cobros ?? [])
    .filter((c: any) => inRange(c.fecha))
    .filter((c: any) => matchSearch([c.folio, clienteById.get(c.cliente_id)?.nombre]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  , [cobros, from, to, search, clienteById]);

  const gastosFiltrados = useMemo(() => (gastos ?? [])
    .filter((g: any) => inRange(g.fecha))
    .filter((g: any) => matchSearch([g.concepto, g.descripcion, g.categoria]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  , [gastos, from, to, search]);

  const devolucionesFiltradas = useMemo(() => (devoluciones ?? [])
    .filter((d: any) => inRange(d.fecha))
    .filter((d: any) => matchSearch([d.tipo, d.notas, clienteById.get(d.cliente_id)?.nombre]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  , [devoluciones, from, to, search, clienteById]);

  const tabs: { key: TabKey; label: string; count: number; icon: any }[] = [
    { key: 'resumen', label: 'Resumen', count: 0, icon: TrendingUp },
    { key: 'ventas', label: 'Ventas', count: ventasFiltradas.length, icon: ShoppingCart },
    { key: 'entregas', label: 'Entregas', count: entregasFiltradas.length, icon: Truck },
    { key: 'cobros', label: 'Cobros', count: cobrosFiltrados.length, icon: Banknote },
    { key: 'gastos', label: 'Gastos', count: gastosFiltrados.length, icon: Receipt },
    { key: 'devoluciones', label: 'Devol.', count: devolucionesFiltradas.length, icon: RotateCcw },
  ];

  // Top clientes por ventas en el rango
  const topClientes = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; count: number }>();
    ventasFiltradas.forEach((v: any) => {
      if (v.status === 'cancelada') return;
      const key = v.cliente_id ?? 'sin';
      const nombre = clienteById.get(v.cliente_id)?.nombre ?? 'Cliente';
      const cur = map.get(key) ?? { nombre, total: 0, count: 0 };
      cur.total += v.total ?? 0;
      cur.count += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [ventasFiltradas, clienteById]);

  // Tendencia 7 días (ventas)
  const trend7 = useMemo(() => {
    const days: { d: string; label: string; total: number }[] = [];
    const base = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
      days.push({ d: iso, label, total: 0 });
    }
    (ventas ?? []).forEach((v: any) => {
      if (v.status === 'cancelada') return;
      const day = days.find(x => x.d === (v.fecha ?? '').slice(0, 10));
      if (day) day.total += v.total ?? 0;
    });
    return days;
  }, [ventas]);
  const trendMax = Math.max(1, ...trend7.map(t => t.total));

  // Totales del rango
  const rangoTotales = {
    ventas: ventasFiltradas.filter((v: any) => v.status !== 'cancelada').reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    cobros: cobrosFiltrados.reduce((s: number, c: any) => s + (c.monto ?? 0), 0),
    gastos: gastosFiltrados.reduce((s: number, g: any) => s + (g.monto ?? 0), 0),
    entregas: entregasFiltradas.filter((e: any) => e.status === 'entregado').length,
  };

  const resetFilters = () => { setSearch(''); setFrom(today); setTo(today); };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div>
        <p className="text-muted-foreground text-[13px] capitalize">{dayName}, {dateStr}</p>
        <h1 className="text-[22px] font-bold text-foreground">
          Hola, {profile?.nombre?.split(' ')[0] ?? 'Vendedor'} 👋
        </h1>
      </div>

      {/* KPI hero */}
      <div className="bg-primary rounded-2xl p-4 text-primary-foreground">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4" />
          <span className="text-[13px] font-medium opacity-90">Vendido hoy</span>
        </div>
        <div className="text-[26px] font-bold leading-tight">{fmt(kpis.totalVentas)}</div>
        <p className="text-[12px] opacity-80">{kpis.numVentas} ventas · {kpis.clientesVisitados} clientes visitados</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-3 gap-2">
        <KpiMini icon={Truck} label="Entregas" value={`${kpis.totalEntregas}`} color="bg-warning/10 text-warning" />
        <KpiMini icon={Banknote} label="Cobrado" value={fmt(kpis.totalCobros)} color="bg-success/10 text-success" />
        <KpiMini icon={Receipt} label="Gastos" value={fmt(kpis.totalGastos)} color="bg-destructive/10 text-destructive" />
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por folio, cliente, concepto..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-background border border-border text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2 py-2 min-w-0">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground shrink-0">Desde</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="flex-1 bg-transparent text-[11px] focus:outline-none min-w-0 w-full" />
          </label>
          <label className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2 py-2 min-w-0">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground shrink-0">Hasta</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="flex-1 bg-transparent text-[11px] focus:outline-none min-w-0 w-full" />
          </label>
        </div>
        <div className="flex gap-1 flex-wrap">
          {([
            { k: 'hoy', label: 'Hoy' },
            { k: '7d', label: '7 días' },
            { k: '30d', label: '30 días' },
            { k: 'mes', label: 'Este mes' },
          ] as const).map(p => (
            <button
              key={p.k}
              onClick={() => {
                const iso = (d: Date) => d.toISOString().slice(0,10);
                const t = new Date();
                if (p.k === 'hoy') { setFrom(today); setTo(today); }
                else if (p.k === '7d') { const d = new Date(t); d.setDate(d.getDate()-6); setFrom(iso(d)); setTo(today); }
                else if (p.k === '30d') { const d = new Date(t); d.setDate(d.getDate()-29); setFrom(iso(d)); setTo(today); }
                else { const d = new Date(t.getFullYear(), t.getMonth(), 1); setFrom(iso(d)); setTo(today); }
              }}
              className="px-2.5 py-1 rounded-lg bg-muted text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg transition-colors",
              tab === t.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            <span className="text-[10px] font-semibold truncate max-w-full">{t.label}</span>
            <span className="text-[9px] opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {tab === 'ventas' && (ventasFiltradas.length === 0
          ? <Empty label="Sin ventas en el rango" />
          : ventasFiltradas.map((v: any) => (
            <Row
              key={v.id}
              onClick={() => navigate(`/ruta/ventas/${v.id}`)}
              title={clienteById.get(v.cliente_id)?.nombre ?? 'Cliente'}
              subtitle={`${v.folio ?? ''} · ${formatDate(v.fecha)}`}
              right={fmt(v.total ?? 0)}
              rightSub={v.status === 'cancelada' ? 'Cancelada' : (v.saldo_pendiente > 0 ? `Saldo ${fmt(v.saldo_pendiente)}` : 'Pagada')}
              rightColor={v.status === 'cancelada' ? 'text-muted-foreground' : v.saldo_pendiente > 0 ? 'text-warning' : 'text-success'}
              dim={v.status === 'cancelada'}
            />
          )))}

        {tab === 'entregas' && (entregasFiltradas.length === 0
          ? <Empty label="Sin entregas en el rango" />
          : entregasFiltradas.map((e: any) => (
            <Row
              key={e.id}
              onClick={() => navigate(`/ruta/entregas/${e.id}`)}
              title={clienteById.get(e.cliente_id)?.nombre ?? 'Cliente'}
              subtitle={`${e.folio ?? ''} · ${formatDate(e.fecha_entrega ?? e.fecha)}`}
              right={statusLabel(e.status)}
              rightColor={e.status === 'entregado' ? 'text-success' : e.status === 'no_entregado' ? 'text-destructive' : 'text-warning'}
            />
          )))}

        {tab === 'cobros' && (cobrosFiltrados.length === 0
          ? <Empty label="Sin cobros en el rango" />
          : cobrosFiltrados.map((c: any) => (
            <Row
              key={c.id}
              title={clienteById.get(c.cliente_id)?.nombre ?? 'Cliente'}
              subtitle={`${c.folio ?? ''} · ${formatDate(c.fecha)} · ${c.forma_pago ?? ''}`}
              right={fmt(c.monto ?? 0)}
              rightColor="text-success"
            />
          )))}

        {tab === 'gastos' && (gastosFiltrados.length === 0
          ? <Empty label="Sin gastos en el rango" />
          : gastosFiltrados.map((g: any) => (
            <Row
              key={g.id}
              title={g.concepto ?? g.categoria ?? 'Gasto'}
              subtitle={`${formatDate(g.fecha)}${g.descripcion ? ' · ' + g.descripcion : ''}`}
              right={fmt(g.monto ?? 0)}
              rightColor="text-destructive"
            />
          )))}

        {tab === 'devoluciones' && (devolucionesFiltradas.length === 0
          ? <Empty label="Sin devoluciones en el rango" />
          : devolucionesFiltradas.map((d: any) => (
            <Row
              key={d.id}
              title={clienteById.get(d.cliente_id)?.nombre ?? 'Cliente'}
              subtitle={`${formatDate(d.fecha)}${d.tipo ? ' · ' + d.tipo : ''}${d.notas ? ' · ' + d.notas : ''}`}
              right={d.tipo ?? 'Devolución'}
              rightColor="text-destructive"
            />
          )))}
      </div>
    </div>
  );
}

function KpiMini({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
      <p className="text-[14px] font-bold text-foreground truncate">{value}</p>
    </div>
  );
}

function Row({ onClick, title, subtitle, right, rightSub, rightColor, dim }: { onClick?: () => void; title: string; subtitle: string; right: string; rightSub?: string; rightColor?: string; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "w-full bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform",
        !onClick && "cursor-default",
        dim && "opacity-60"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-[14px] font-bold", rightColor ?? 'text-foreground')}>{right}</p>
        {rightSub && <p className="text-[10px] text-muted-foreground">{rightSub}</p>}
      </div>
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

function formatDate(d?: string) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function statusLabel(s?: string) {
  if (!s) return '—';
  if (s === 'entregado') return 'Entregada';
  if (s === 'no_entregado') return 'No entregada';
  if (s === 'pendiente') return 'Pendiente';
  if (s === 'cargado') return 'Cargada';
  return s;
}
