import { useMemo, useState } from 'react';
import { todayLocal } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Users, Banknote, TrendingUp, Truck, Receipt, Search, Calendar as CalendarIcon, X, RotateCcw, PiggyBank } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';
import { usePermisos } from '@/hooks/usePermisos';
import { cn } from '@/lib/utils';

type TabKey = 'resumen' | 'ventas' | 'entregas' | 'cobros' | 'gastos' | 'devoluciones';

export default function RutaDashboard() {
  const navigate = useNavigate();
  const { profile, empresa, user, overrideEmpresaId, overrideVendedorId } = useAuth();
  const { fmt } = useCurrency();
  const { hasPermisoMovil } = usePermisos();
  const canResumen = hasPermisoMovil('ruta.resumen');
  const today = todayLocal();
  const isSAOverride = !!overrideEmpresaId;
  const vendedorId = isSAOverride ? overrideVendedorId : profile?.id;
  const allVendedores = isSAOverride && !vendedorId;

  // Filtros
  const [tab, setTab] = useState<TabKey>(canResumen ? 'resumen' : 'ventas');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data: perfiles } = useOfflineQuery('profiles', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const vendedorUserId = vendedorId
    ? (vendedorId === profile?.id ? user?.id : (perfiles ?? []).find((p: any) => p.id === vendedorId)?.user_id)
    : null;
  const vendorScopedEnabled = !!empresa?.id && (allVendedores || !!vendedorId);
  const cobrosEnabled = !!empresa?.id && (allVendedores || !!vendedorUserId);

  const { data: ventas } = useOfflineQuery('ventas', vendedorId ? { empresa_id: empresa?.id, vendedor_id: vendedorId } : { empresa_id: empresa?.id }, { enabled: vendorScopedEnabled });
  const { data: entregas } = useOfflineQuery('entregas', { empresa_id: empresa?.id }, { enabled: vendorScopedEnabled });
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: gastos } = useOfflineQuery('gastos', { empresa_id: empresa?.id }, { enabled: vendorScopedEnabled });
  const { data: cobros } = useOfflineQuery('cobros', allVendedores ? { empresa_id: empresa?.id } : { empresa_id: empresa?.id, user_id: vendedorUserId }, { enabled: cobrosEnabled });
  const { data: devoluciones } = useOfflineQuery('devoluciones', vendedorId ? { empresa_id: empresa?.id, vendedor_id: vendedorId } : { empresa_id: empresa?.id }, { enabled: vendorScopedEnabled });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });

  const clienteById = useMemo(() => {
    const m = new Map<string, any>();
    (clientes ?? []).forEach((c: any) => m.set(c.id, c));
    return m;
  }, [clientes]);

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
  const isCancelado = (status?: string | null) => status === 'cancelado' || status === 'cancelada';
  const isEntregaFinalizada = (status?: string | null) => status === 'hecho' || status === 'entregado';
  const belongsToVendedor = (id?: string | null) => allVendedores || (!!vendedorId && id === vendedorId);

  const ventasFiltradas = useMemo(() => (ventas ?? [])
    .filter((v: any) => inRange(v.fecha))
    .filter((v: any) => matchSearch([v.folio, clienteById.get(v.cliente_id)?.nombre]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  , [ventas, from, to, search, clienteById]);

  const entregasFiltradas = useMemo(() => (entregas ?? [])
    .filter((e: any) => belongsToVendedor(e.vendedor_ruta_id || e.vendedor_id))
    .filter((e: any) => inRange(e.fecha_entrega ?? e.fecha))
    .filter((e: any) => matchSearch([e.folio, clienteById.get(e.cliente_id)?.nombre]))
    .sort((a: any, b: any) => ((b.fecha_entrega ?? b.fecha) ?? '').localeCompare((a.fecha_entrega ?? a.fecha) ?? ''))
  , [entregas, from, to, search, clienteById, allVendedores, vendedorId]);

  const cobrosFiltrados = useMemo(() => (cobros ?? [])
    .filter((c: any) => !isCancelado(c.status))
    .filter((c: any) => inRange(c.fecha))
    .filter((c: any) => matchSearch([c.folio, clienteById.get(c.cliente_id)?.nombre]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  , [cobros, from, to, search, clienteById]);

  const gastosFiltrados = useMemo(() => (gastos ?? [])
    .filter((g: any) => belongsToVendedor(g.vendedor_id))
    .filter((g: any) => inRange(g.fecha))
    .filter((g: any) => matchSearch([g.concepto, g.descripcion, g.categoria]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  , [gastos, from, to, search, allVendedores, vendedorId]);

  const devolucionesFiltradas = useMemo(() => (devoluciones ?? [])
    .filter((d: any) => inRange(d.fecha))
    .filter((d: any) => matchSearch([d.tipo, d.notas, clienteById.get(d.cliente_id)?.nombre]))
    .sort((a: any, b: any) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  , [devoluciones, from, to, search, clienteById]);

  const tabs: { key: TabKey; label: string; count: number; icon: any }[] = [
    ...(canResumen ? [{ key: 'resumen' as TabKey, label: 'Resumen', count: 0, icon: TrendingUp }] : []),
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
      if (isCancelado(v.status)) return;
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
    const isoLocal = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const days: { d: string; label: string; total: number }[] = [];
    const base = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
      days.push({ d: isoLocal(d), label, total: 0 });
    }
    (ventas ?? []).forEach((v: any) => {
      if (isCancelado(v.status)) return;
      const day = days.find(x => x.d === (v.fecha ?? '').slice(0, 10));
      if (day) day.total += v.total ?? 0;
    });
    return days;
  }, [ventas]);
  const trendMax = Math.max(1, ...trend7.map(t => t.total));

  // Totales del rango
  const ventasActivasRango = ventasFiltradas.filter((v: any) => !isCancelado(v.status));
  const entregasFinalizadasRango = entregasFiltradas.filter((e: any) => isEntregaFinalizada(e.status));
  const ventaIdsRango = useMemo(() => ventasActivasRango.map((v: any) => v.id).filter(Boolean), [ventasActivasRango]);

  // Costo de ventas (utilidad bruta) — venta_lineas filtradas por ventas del rango
  const { data: ventaLineasRango } = useOfflineQuery('venta_lineas', { venta_id: ventaIdsRango }, { enabled: ventaIdsRango.length > 0 });
  const productoCosto = useMemo(() => {
    const m = new Map<string, number>();
    (productos ?? []).forEach((p: any) => m.set(p.id, Number(p.costo) || 0));
    return m;
  }, [productos]);
  const costoVentasRango = useMemo(() => {
    return (ventaLineasRango ?? []).reduce((s: number, l: any) => {
      const costo = productoCosto.get(l.producto_id) ?? 0;
      const factor = Number(l.presentacion_factor) || 1;
      const cantidad = Number(l.cantidad) || 0;
      return s + costo * factor * cantidad;
    }, 0);
  }, [ventaLineasRango, productoCosto]);

  const totalVentasRango = ventasActivasRango.reduce((s: number, v: any) => s + (v.total ?? 0), 0);
  const totalGastosRango = gastosFiltrados.reduce((s: number, g: any) => s + (g.monto ?? 0), 0);
  const utilidadBruta = totalVentasRango - costoVentasRango;
  const utilidadNeta = utilidadBruta - totalGastosRango;
  const margenPct = totalVentasRango > 0 ? (utilidadNeta / totalVentasRango) * 100 : 0;

  const rangoTotales = {
    ventas: totalVentasRango,
    ventasCount: ventasActivasRango.length,
    cobros: cobrosFiltrados.reduce((s: number, c: any) => s + (c.monto ?? 0), 0),
    gastos: totalGastosRango,
    entregas: entregasFinalizadasRango.length,
    clientesVisitados: new Set([
      ...ventasActivasRango.map((v: any) => v.cliente_id),
      ...entregasFinalizadasRango.map((e: any) => e.cliente_id),
    ].filter(Boolean)).size,
  };

  const resetFilters = () => { setSearch(''); setFrom(today); setTo(today); };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}

      {/* KPI hero */}
      <div className="bg-primary rounded-2xl p-4 text-primary-foreground">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4" />
          <span className="text-[13px] font-medium opacity-90">Vendido en rango</span>
        </div>
        <div className="text-[26px] font-bold leading-tight">{fmt(rangoTotales.ventas)}</div>
        <p className="text-[12px] opacity-80">{rangoTotales.ventasCount} ventas · {rangoTotales.clientesVisitados} clientes visitados</p>
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
          ] as const).map(p => {
            const isoLocal = (d: Date) => {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            };
            const t = new Date();
            let nFrom = today, nTo = today;
            if (p.k === '7d') { const d = new Date(t); d.setDate(d.getDate()-6); nFrom = isoLocal(d); }
            else if (p.k === '30d') { const d = new Date(t); d.setDate(d.getDate()-29); nFrom = isoLocal(d); }
            else if (p.k === 'mes') { const d = new Date(t.getFullYear(), t.getMonth(), 1); nFrom = isoLocal(d); }
            const active = from === nFrom && to === nTo;
            return (
              <button
                key={p.k}
                type="button"
                onClick={() => { setFrom(nFrom); setTo(nTo); }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs - scroll horizontal */}
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="inline-flex gap-1 bg-primary/10 rounded-xl p-1 min-w-full">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 py-2 px-3 rounded-lg transition-colors whitespace-nowrap shrink-0",
                tab === t.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />
              <span className="text-[12px] font-semibold">{t.label}</span>
              {t.count > 0 && <span className="text-[10px] opacity-70 bg-muted px-1.5 rounded">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="space-y-2">
        {tab === 'resumen' && (
          <div className="space-y-3">
            {/* KPI grid */}
            <div className="grid grid-cols-3 gap-2">
              <KpiMini icon={Truck} label="Entregas" value={`${rangoTotales.entregas}`} color="bg-warning/10 text-warning" />
              <KpiMini icon={Banknote} label="Cobrado" value={fmt(rangoTotales.cobros)} color="bg-success/10 text-success" />
              <KpiMini icon={Receipt} label="Gastos" value={fmt(rangoTotales.gastos)} color="bg-destructive/10 text-destructive" />
            </div>

            {/* Utilidad */}
            <div className={cn(
              "rounded-2xl p-4 border",
              utilidadNeta >= 0 ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center",
                  utilidadNeta >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                )}>
                  <PiggyBank className="h-4 w-4" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">Utilidad del rango</p>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className={cn("text-[22px] font-bold leading-tight", utilidadNeta >= 0 ? "text-success" : "text-destructive")}>{fmt(utilidadNeta)}</p>
                  <p className="text-[10px] text-muted-foreground">Margen {margenPct.toFixed(1)}%</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Utilidad bruta</p>
                  <p className="text-[13px] font-semibold text-foreground">{fmt(utilidadBruta)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50">
                <div>
                  <p className="text-[9px] text-muted-foreground">Ventas</p>
                  <p className="text-[12px] font-bold text-foreground">{fmt(totalVentasRango)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Costo</p>
                  <p className="text-[12px] font-bold text-warning">{fmt(costoVentasRango)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Gastos</p>
                  <p className="text-[12px] font-bold text-destructive">{fmt(totalGastosRango)}</p>
                </div>
              </div>
            </div>

            {/* Totales rango */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground font-medium mb-2">Totales del rango</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Ventas</p>
                  <p className="text-[16px] font-bold text-foreground">{fmt(rangoTotales.ventas)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Cobrado</p>
                  <p className="text-[16px] font-bold text-success">{fmt(rangoTotales.cobros)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Entregas</p>
                  <p className="text-[16px] font-bold text-foreground">{rangoTotales.entregas}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Gastos</p>
                  <p className="text-[16px] font-bold text-destructive">{fmt(rangoTotales.gastos)}</p>
                </div>
              </div>
            </div>

            {/* Tendencia 7 días */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground font-medium mb-3">Ventas últimos 7 días</p>
              <div className="flex items-end justify-between gap-1.5 h-28">
                {trend7.map((d, i) => (
                  <div key={i} className="flex-1 h-full flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full h-24 flex items-end">
                      <div
                        className="w-full bg-primary/80 rounded-t-md min-h-[2px] transition-all"
                        style={{ height: d.total > 0 ? `${Math.max(8, (d.total / trendMax) * 100)}%` : '2px' }}
                        title={fmt(d.total)}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground capitalize">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top clientes */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[11px] text-muted-foreground font-medium mb-2">Top clientes del rango</p>
              {topClientes.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-4 text-center">Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {topClientes.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-[13px] font-medium text-foreground truncate">{c.nombre}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-bold text-foreground">{fmt(c.total)}</p>
                        <p className="text-[9px] text-muted-foreground">{c.count} venta{c.count > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'ventas' && (ventasFiltradas.length === 0
          ? <Empty label="Sin ventas en el rango" />
          : ventasFiltradas.map((v: any) => (
            <Row
              key={v.id}
              onClick={() => navigate(`/ruta/ventas/${v.id}`)}
              title={clienteById.get(v.cliente_id)?.nombre ?? 'Cliente'}
              subtitle={`${v.folio ?? ''} · ${formatDate(v.fecha)}`}
              right={fmt(v.total ?? 0)}
              rightSub={isCancelado(v.status) ? 'Cancelada' : (v.saldo_pendiente > 0 ? `Saldo ${fmt(v.saldo_pendiente)}` : 'Pagada')}
              rightColor={isCancelado(v.status) ? 'text-muted-foreground' : v.saldo_pendiente > 0 ? 'text-warning' : 'text-success'}
              dim={isCancelado(v.status)}
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
              rightColor={isEntregaFinalizada(e.status) ? 'text-success' : e.status === 'no_entregado' ? 'text-destructive' : 'text-warning'}
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
  if (s === 'hecho') return 'Entregada';
  if (s === 'entregado') return 'Entregada';
  if (s === 'no_entregado') return 'No entregada';
  if (s === 'pendiente') return 'Pendiente';
  if (s === 'cargado') return 'Cargada';
  return s;
}
