import { useState, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, CreditCard,
  Package, AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight,
  BarChart3, Users, Loader2, RotateCcw
} from 'lucide-react';
import { cn, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useVendedores } from '@/hooks/useClientes';
import {
  useDashboardVentas, useDashboardCobros, useDashboardCompras,
  useDashboardGastos, useDashboardCartera, useDashboardStock,
  useDashboardTopProductos, useDashboardVentasPorDia, useDashboardVentasPorVendedor,
  useDashboardDevoluciones,
  type DateRange
} from '@/hooks/useDashboardData';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { OdooDatePicker } from '@/components/OdooDatePicker';

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

function SectionTitle({ children, icon: Icon }: { children: string; icon: React.ElementType }) {
  return (
    <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mt-6 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      {children}
    </h2>
  );
}

export default function DashboardPage() {
  const { symbol: cSym, code: cCode } = useCurrency();
  const money = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: cCode, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

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

  const topClients = useMemo(() => {
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
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventas]);

  const handlePreset = (idx: number) => {
    setActivePreset(idx);
    setDateRange(PRESETS[idx].range());
  };

  return (
    <div className="p-5 space-y-0 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Dashboard
            <HelpButton title={HELP.dashboard.title} sections={HELP.dashboard.sections} />
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(dateRange.from, "d MMM", { locale: es })} — {format(dateRange.to, "d MMM yyyy", { locale: es })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets */}
          <div className="flex bg-accent/50 rounded-lg p-0.5 gap-0.5">
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => handlePreset(i)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activePreset === i ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom dates */}
          <OdooDatePicker value={format(dateRange.from, 'yyyy-MM-dd')} onChange={d => { if (d) { setDateRange(prev => ({ ...prev, from: new Date(d + 'T12:00:00') })); setActivePreset(-1); }}} />
          <OdooDatePicker value={format(dateRange.to, 'yyyy-MM-dd')} onChange={d => { if (d) { setDateRange(prev => ({ ...prev, to: new Date(d + 'T12:00:00') })); setActivePreset(-1); }}} />

          {/* Vendedor filter */}
          <div className="min-w-[160px]">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="Ventas" value={money(kpis.totalVentas)} subtitle={`${kpis.numVentas} operaciones`} icon={ShoppingCart} color="bg-[hsl(var(--chart-1))]" />
        <KpiCard title="Ticket promedio" value={money(kpis.ticketPromedio)} subtitle={`${kpis.pedidos} pedidos · ${kpis.ventasDirectas} directas`} icon={TrendingUp} color="bg-[hsl(var(--chart-2))]" />
        <KpiCard title="Cobrado" value={money(kpis.totalCobrado)} subtitle={`${(cobros ?? []).length} cobros`} icon={Wallet} color="bg-[hsl(var(--success))]" />
        <KpiCard title="Cartera" value={money(kpis.totalCartera)} subtitle={`${kpis.clientesMorosos} clientes`} icon={CreditCard} color="bg-[hsl(var(--warning))]" />
        <KpiCard title="Compras" value={money(kpis.totalCompras)} subtitle={`Pendiente: ${money(kpis.saldoProveedores)}`} icon={Package} color="bg-[hsl(var(--chart-3))]" />
        <KpiCard title="Gastos" value={money(kpis.totalGastos)} subtitle={`Utilidad: ${money(kpis.utilidadBruta)}`} icon={DollarSign} color={kpis.utilidadBruta >= 0 ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--destructive))]"} />
        <KpiCard title="Devoluciones" value={`${fmtNum(devStats.totalUnidades)} uds`} subtitle={`${devStats.count} registros · ${money(devStats.totalCredito)} crédito`} icon={RotateCcw} color="bg-[hsl(var(--chart-5))]" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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

      {/* Bottom row: Top products, Top clients, Low stock */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* Top Products */}
        <div className="bg-card border border-border rounded-xl p-4">
          <SectionTitle icon={TrendingUp}>Productos más vendidos</SectionTitle>
          <div className="space-y-2">
            {(topProductos ?? []).slice(0, 6).map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{p.nombre}</div>
                  <div className="text-[10px] text-muted-foreground">{p.qty} uds</div>
                </div>
                <span className="text-xs font-semibold text-foreground">{money(p.total)}</span>
              </div>
            ))}
            {(topProductos ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
          </div>
        </div>

        {/* Top Clients */}
        <div className="bg-card border border-border rounded-xl p-4">
          <SectionTitle icon={Users}>Mejores clientes</SectionTitle>
          <div className="space-y-2">
            {topClients.slice(0, 6).map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{c.nombre}</div>
                  <div className="text-[10px] text-muted-foreground">{c.count} ventas</div>
                </div>
                <span className="text-xs font-semibold text-foreground">{money(c.total)}</span>
              </div>
            ))}
            {topClients.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
          </div>
        </div>

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
              <p className="text-xs text-muted-foreground">Todo en orden 👍</p>
            </div>
          )}

          {/* Inventory value */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Valor del inventario</span>
            <span className="text-sm font-bold text-foreground">{money(kpis.valorInventario)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-muted-foreground">Productos activos</span>
            <span className="text-sm font-semibold text-foreground">{kpis.productosTotal}</span>
          </div>
        </div>
      </div>

      {/* Vendedor detail table */}
      {!vendedorId && (ventasPorVendedor ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mt-4">
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
    </div>
  );
}
