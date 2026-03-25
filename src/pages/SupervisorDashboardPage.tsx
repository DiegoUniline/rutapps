import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  ShoppingCart, Banknote, Users, TrendingUp, MapPin, Package,
  Truck, Eye, Clock, AlertCircle, CheckCircle2, XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, todayInTimezone } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useGoogleMapsKey, GoogleMapsProvider } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';

const MAP_CONTAINER = { width: '100%', height: '360px' };
const MAP_CENTER = { lat: 20.6597, lng: -103.3496 };

export default function SupervisorDashboardPage() {
  const { empresa } = useAuth();
  const { fmt: fmtMoney } = useCurrency();
  const today = new Date().toISOString().split('T')[0];
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('resumen');

  /* ─── QUERIES ─── */

  // Users (non-admin)
  const { data: vendedores } = useQuery({
    queryKey: ['supervisor-usuarios', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data: adminRoles } = await supabase
        .from('roles').select('id').eq('empresa_id', empresa!.id).eq('nombre', 'Administrador');
      const adminRoleIds = (adminRoles ?? []).map(r => r.id);
      let adminUserIds: string[] = [];
      if (adminRoleIds.length > 0) {
        const { data: aa } = await supabase.from('user_roles').select('user_id').in('role_id', adminRoleIds);
        adminUserIds = (aa ?? []).map(a => a.user_id);
      }
      const { data } = await supabase.from('profiles')
        .select('id, user_id, nombre, estado')
        .eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return (data ?? []).filter(p => !adminUserIds.includes(p.user_id))
        .map(p => ({ id: p.id, user_id: p.user_id, nombre: p.nombre ?? 'Sin nombre' }));
    },
  });

  // Today's ventas with lines
  const { data: ventasHoy } = useQuery({
    queryKey: ['supervisor-ventas-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('ventas')
        .select('id, vendedor_id, total, subtotal, status, tipo, condicion_pago, created_at, cliente_id, clientes(nombre), venta_lineas(producto_id, cantidad, total, productos(nombre, codigo))')
        .eq('empresa_id', empresa!.id).eq('fecha', today).neq('status', 'cancelado')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Today's cobros
  const { data: cobrosHoy } = useQuery({
    queryKey: ['supervisor-cobros-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('cobros')
        .select('id, user_id, monto, metodo_pago, created_at, cliente_id, clientes(nombre)')
        .eq('empresa_id', empresa!.id).eq('fecha', today).order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Today's gastos
  const { data: gastosHoy } = useQuery({
    queryKey: ['supervisor-gastos-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('gastos')
        .select('id, vendedor_id, monto, concepto, created_at')
        .eq('empresa_id', empresa!.id).eq('fecha', today);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Today's entregas
  const { data: entregasHoy } = useQuery({
    queryKey: ['supervisor-entregas-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('entregas')
        .select('id, vendedor_id, vendedor_ruta_id, status, cliente_id, clientes(nombre), folio')
        .eq('empresa_id', empresa!.id).eq('fecha', today);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Today's visitas
  const { data: visitasHoy } = useQuery({
    queryKey: ['supervisor-visitas-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('visitas')
        .select('id, user_id, cliente_id, tipo, motivo, gps_lat, gps_lng, created_at, clientes(nombre, gps_lat, gps_lng)')
        .eq('empresa_id', empresa!.id).eq('fecha', today);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Clients assigned to non-admin vendedores
  const vendedorIds = useMemo(() => (vendedores ?? []).map(v => v.id), [vendedores]);
  const { data: clientesAsignados } = useQuery({
    queryKey: ['supervisor-clientes-asignados', empresa?.id, vendedorIds],
    enabled: !!empresa?.id && vendedorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('clientes')
        .select('id, nombre, vendedor_id, gps_lat, gps_lng, dia_visita')
        .eq('empresa_id', empresa!.id).in('vendedor_id', vendedorIds);
      return data ?? [];
    },
  });

  // All ventas for "última visita / días sin comprar" (last 90 days)
  const { data: ventasRecientes } = useQuery({
    queryKey: ['supervisor-ventas-recientes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const desde = new Date(); desde.setDate(desde.getDate() - 90);
      const { data } = await supabase.from('ventas')
        .select('id, cliente_id, fecha, total').eq('empresa_id', empresa!.id)
        .neq('status', 'cancelado').gte('fecha', desde.toISOString().slice(0, 10))
        .order('fecha', { ascending: false });
      return data ?? [];
    },
  });

  // Active cargas
  const { data: cargasActivas } = useQuery({
    queryKey: ['supervisor-cargas-activas', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('cargas')
        .select('id, vendedor_id, status, fecha')
        .eq('empresa_id', empresa!.id)
        .in('status', ['en_ruta', 'pendiente'] as any);
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  /* ─── COMPUTED ─── */

  // Products sold today
  const productosSummary = useMemo(() => {
    const map: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};
    (ventasHoy ?? []).forEach((v: any) => {
      if (selectedVendedor && v.vendedor_id !== selectedVendedor) return;
      (v.venta_lineas ?? []).forEach((l: any) => {
        const pid = l.producto_id;
        if (!pid) return;
        const prod = l.productos as any;
        if (!map[pid]) map[pid] = { nombre: prod?.nombre ?? '—', codigo: prod?.codigo ?? '', cantidad: 0, total: 0 };
        map[pid].cantidad += l.cantidad ?? 0;
        map[pid].total += l.total ?? 0;
      });
    });
    return Object.values(map).sort((a, b) => b.cantidad - a.cantidad);
  }, [ventasHoy, selectedVendedor]);

  // Per-vendedor stats
  const vendedorStats = useMemo(() => {
    const stats: Record<string, {
      ventas: number; totalVentas: number; cobros: number; totalCobros: number;
      gastos: number; totalGastos: number; cargaActiva: boolean;
      entregas: number; entregasHecho: number; visitas: number;
    }> = {};
    (vendedores ?? []).forEach(v => {
      stats[v.id] = { ventas: 0, totalVentas: 0, cobros: 0, totalCobros: 0, gastos: 0, totalGastos: 0, cargaActiva: false, entregas: 0, entregasHecho: 0, visitas: 0 };
    });
    (ventasHoy ?? []).forEach((v: any) => {
      if (v.vendedor_id && stats[v.vendedor_id]) { stats[v.vendedor_id].ventas++; stats[v.vendedor_id].totalVentas += v.total ?? 0; }
    });
    (cobrosHoy ?? []).forEach((c: any) => {
      // Match cobros by user_id → find vendedor with matching user_id
      const vend = (vendedores ?? []).find(v => v.user_id === c.user_id);
      if (vend && stats[vend.id]) { stats[vend.id].cobros++; stats[vend.id].totalCobros += c.monto ?? 0; }
    });
    (gastosHoy ?? []).forEach((g: any) => {
      if (g.vendedor_id && stats[g.vendedor_id]) { stats[g.vendedor_id].gastos++; stats[g.vendedor_id].totalGastos += g.monto ?? 0; }
    });
    (cargasActivas ?? []).forEach((c: any) => {
      if (c.vendedor_id && stats[c.vendedor_id]) stats[c.vendedor_id].cargaActiva = true;
    });
    (entregasHoy ?? []).forEach((e: any) => {
      const vid = e.vendedor_ruta_id || e.vendedor_id;
      if (vid && stats[vid]) { stats[vid].entregas++; if (e.status === 'hecho') stats[vid].entregasHecho++; }
    });
    (visitasHoy ?? []).forEach((vis: any) => {
      const vend = (vendedores ?? []).find(v => v.user_id === vis.user_id);
      if (vend && stats[vend.id]) stats[vend.id].visitas++;
    });
    return stats;
  }, [vendedores, ventasHoy, cobrosHoy, gastosHoy, cargasActivas, entregasHoy, visitasHoy]);

  // Global KPIs
  const globalStats = useMemo(() => {
    const ventas = ventasHoy ?? [];
    const cobros = cobrosHoy ?? [];
    const gastos = gastosHoy ?? [];
    const entregas = entregasHoy ?? [];
    const visitas = visitasHoy ?? [];
    return {
      totalVentas: ventas.reduce((s, v: any) => s + (v.total ?? 0), 0),
      numVentas: ventas.length,
      totalCobros: cobros.reduce((s, c: any) => s + (c.monto ?? 0), 0),
      numCobros: cobros.length,
      totalGastos: gastos.reduce((s, g: any) => s + (g.monto ?? 0), 0),
      numEntregas: entregas.length,
      entregasHecho: entregas.filter((e: any) => e.status === 'hecho').length,
      numVisitas: visitas.length,
      visitasConCompra: visitas.filter((v: any) => v.tipo === 'venta').length,
      vendedoresActivos: Object.values(vendedorStats).filter(v => v.ventas > 0 || v.cargaActiva).length,
    };
  }, [ventasHoy, cobrosHoy, gastosHoy, entregasHoy, visitasHoy, vendedorStats]);

  // Client activity table (visited vs not visited, last purchase, days since)
  const clienteActivity = useMemo(() => {
    const visitedIds = new Set((visitasHoy ?? []).map((v: any) => v.cliente_id).filter(Boolean));
    const ventasByCliente: Record<string, { ultima: string; total: number }> = {};
    (ventasRecientes ?? []).forEach((v: any) => {
      if (!v.cliente_id) return;
      if (!ventasByCliente[v.cliente_id] || v.fecha > ventasByCliente[v.cliente_id].ultima) {
        ventasByCliente[v.cliente_id] = { ultima: v.fecha, total: v.total };
      }
    });
    const todayDate = new Date(today);
    return (clientesAsignados ?? [])
      .filter(c => !selectedVendedor || c.vendedor_id === selectedVendedor)
      .map(c => {
        const visitado = visitedIds.has(c.id);
        const lastSale = ventasByCliente[c.id];
        const diasSinComprar = lastSale ? Math.floor((todayDate.getTime() - new Date(lastSale.ultima).getTime()) / 86400000) : null;
        return {
          id: c.id, nombre: c.nombre, vendedor_id: c.vendedor_id,
          visitado, gps_lat: c.gps_lat, gps_lng: c.gps_lng,
          ultimaVisitaFecha: lastSale?.ultima ?? null,
          ultimaVisitaValor: lastSale?.total ?? 0,
          diasSinComprar,
        };
      })
      .sort((a, b) => {
        if (a.visitado !== b.visitado) return a.visitado ? 1 : -1;
        return (b.diasSinComprar ?? 999) - (a.diasSinComprar ?? 999);
      });
  }, [clientesAsignados, visitasHoy, ventasRecientes, selectedVendedor, today]);

  // Map markers
  const mapMarkers = useMemo(() => {
    return clienteActivity.filter(c => c.gps_lat && c.gps_lng).map(c => ({
      id: c.id, nombre: c.nombre, lat: c.gps_lat!, lng: c.gps_lng!, visitado: c.visitado, diasSinComprar: c.diasSinComprar,
    }));
  }, [clienteActivity]);

  const filteredVentas = selectedVendedor
    ? (ventasHoy ?? []).filter((v: any) => v.vendedor_id === selectedVendedor)
    : ventasHoy ?? [];

  const filteredCobros = selectedVendedor
    ? (cobrosHoy ?? []).filter((c: any) => {
        const vend = (vendedores ?? []).find(v => v.user_id === c.user_id);
        return vend?.id === selectedVendedor;
      })
    : cobrosHoy ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Panel supervisor</h1>
          <p className="text-sm text-muted-foreground">Actividad del día en tiempo real</p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          En vivo
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard icon={ShoppingCart} label="Ventas" value={fmtMoney(globalStats.totalVentas)} sub={`${globalStats.numVentas} ventas`} />
        <KpiCard icon={Banknote} label="Cobros" value={fmtMoney(globalStats.totalCobros)} sub={`${globalStats.numCobros} cobros`} />
        <KpiCard icon={TrendingUp} label="Gastos" value={fmtMoney(globalStats.totalGastos)} sub="Gastos del día" accent />
        <KpiCard icon={Eye} label="Visitas" value={String(globalStats.numVisitas)} sub={`${globalStats.visitasConCompra} con compra`} />
        <KpiCard icon={Truck} label="Entregas" value={`${globalStats.entregasHecho}/${globalStats.numEntregas}`} sub="Realizadas/Total" />
        <KpiCard icon={Users} label="Activos" value={String(globalStats.vendedoresActivos)} sub={`de ${vendedores?.length ?? 0}`} />
      </div>

      {/* Vendedor selector cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Vendedores</h2>
          {selectedVendedor && (
            <button onClick={() => setSelectedVendedor(null)} className="text-xs text-primary font-medium hover:underline">
              Ver todos
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {(vendedores ?? []).map(v => {
            const st = vendedorStats[v.id];
            if (!st) return null;
            const isSelected = selectedVendedor === v.id;
            return (
              <button key={v.id}
                onClick={() => setSelectedVendedor(isSelected ? null : v.id)}
                className={cn(
                  "bg-card border rounded-xl p-4 text-left transition-all active:scale-[0.98]",
                  isSelected ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{v.nombre}</span>
                  <div className="flex items-center gap-1">
                    {st.cargaActiva && <Badge variant="default" className="text-[10px] h-5">En ruta</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  <MiniStat label="Ventas" value={String(st.ventas)} />
                  <MiniStat label="Total" value={fmtMoney(st.totalVentas)} highlight />
                  <MiniStat label="Visitas" value={String(st.visitas)} />
                  <MiniStat label="Entregas" value={`${st.entregasHecho}/${st.entregas}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="mapa">Mapa</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
        </TabsList>

        {/* TAB: Resumen */}
        <TabsContent value="resumen" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ventas */}
            <ActivityList
              title="Ventas del día"
              icon={ShoppingCart}
              items={filteredVentas.slice(0, 15).map((v: any) => ({
                id: v.id,
                primary: (v.clientes as any)?.nombre || 'Público en general',
                secondary: new Date(v.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                badge: v.status,
                value: fmtMoney(v.total ?? 0),
              }))}
              emptyText="No hay ventas hoy"
            />
            {/* Cobros */}
            <ActivityList
              title="Cobros del día"
              icon={Banknote}
              items={filteredCobros.slice(0, 15).map((c: any) => ({
                id: c.id,
                primary: (c.clientes as any)?.nombre || '—',
                secondary: `${c.metodo_pago} · ${new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
                value: fmtMoney(c.monto ?? 0),
              }))}
              emptyText="No hay cobros hoy"
            />
          </div>

          {/* Entregas */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> Entregas del día
            </h3>
            {(entregasHoy ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay entregas programadas</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-foreground">{(entregasHoy ?? []).filter((e: any) => e.status === 'hecho').length}</p>
                  <p className="text-[10px] text-muted-foreground">Realizadas</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-foreground">{(entregasHoy ?? []).filter((e: any) => e.status === 'pendiente').length}</p>
                  <p className="text-[10px] text-muted-foreground">Pendientes</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-lg font-bold text-destructive">{(entregasHoy ?? []).filter((e: any) => e.status === 'cancelado').length}</p>
                  <p className="text-[10px] text-muted-foreground">Canceladas</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB: Mapa */}
        <TabsContent value="mapa" className="mt-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-3 h-3 rounded-full bg-primary" /> Visitado
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-3 h-3 rounded-full bg-destructive" /> Sin visitar
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {mapMarkers.filter(m => m.visitado).length} de {mapMarkers.length} visitados
              </span>
            </div>
            <GoogleMapsProvider>
              <SupervisorMap markers={mapMarkers} />
            </GoogleMapsProvider>
          </div>
        </TabsContent>

        {/* TAB: Productos */}
        <TabsContent value="productos" className="mt-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Productos vendidos hoy
              </h3>
            </div>
            {productosSummary.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Sin productos vendidos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 px-3 text-left text-muted-foreground font-medium">Código</th>
                      <th className="py-2 px-3 text-left text-muted-foreground font-medium">Producto</th>
                      <th className="py-2 px-3 text-right text-muted-foreground font-medium">Cantidad</th>
                      <th className="py-2 px-3 text-right text-muted-foreground font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {productosSummary.map((p, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="py-2 px-3 font-mono text-muted-foreground">{p.codigo || '—'}</td>
                        <td className="py-2 px-3 font-medium text-foreground">{p.nombre}</td>
                        <td className="py-2 px-3 text-right font-bold tabular-nums text-foreground">{p.cantidad}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-foreground">{fmtMoney(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB: Clientes */}
        <TabsContent value="clientes" className="mt-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Actividad de clientes
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {clienteActivity.filter(c => c.visitado).length}/{clienteActivity.length} visitados
              </span>
            </div>
            {clienteActivity.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Sin clientes asignados</p>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 px-3 text-left text-muted-foreground font-medium">Estado</th>
                      <th className="py-2 px-3 text-left text-muted-foreground font-medium">Cliente</th>
                      <th className="py-2 px-3 text-right text-muted-foreground font-medium">Última compra</th>
                      <th className="py-2 px-3 text-right text-muted-foreground font-medium">Valor</th>
                      <th className="py-2 px-3 text-right text-muted-foreground font-medium">Días sin comprar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clienteActivity.map(c => (
                      <tr key={c.id} className={cn("hover:bg-muted/20", !c.visitado && "bg-destructive/3")}>
                        <td className="py-2 px-3">
                          {c.visitado ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive/60" />
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium text-foreground max-w-[200px] truncate">{c.nombre}</td>
                        <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                          {c.ultimaVisitaFecha ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-foreground">
                          {c.ultimaVisitaValor ? fmtMoney(c.ultimaVisitaValor) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {c.diasSinComprar !== null ? (
                            <span className={cn(
                              "font-bold tabular-nums",
                              c.diasSinComprar > 14 ? "text-destructive" : c.diasSinComprar > 7 ? "text-amber-600" : "text-foreground"
                            )}>
                              {c.diasSinComprar}d
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Sub-components ─── */

function KpiCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", accent ? "text-destructive" : "text-primary")} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className={cn("text-sm font-bold tabular-nums", highlight ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-[9px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function ActivityList({ title, icon: Icon, items, emptyText }: {
  title: string; icon: any;
  items: { id: string; primary: string; secondary: string; badge?: string; value: string }[];
  emptyText: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-center py-6 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="divide-y divide-border max-h-[350px] overflow-y-auto">
          {items.map(item => (
            <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{item.primary}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.secondary}
                  {item.badge && (
                    <Badge variant={item.badge === 'confirmado' ? 'default' : 'secondary'} className="text-[9px] h-4 ml-1.5">{item.badge}</Badge>
                  )}
                </p>
              </div>
              <span className="text-[13px] font-bold text-foreground tabular-nums whitespace-nowrap">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupervisorMap({ markers }: { markers: { id: string; nombre: string; lat: number; lng: number; visitado: boolean; diasSinComprar: number | null }[] }) {
  const { apiKey } = useGoogleMapsKey();
  const [selected, setSelected] = useState<typeof markers[0] | null>(null);

  const center = useMemo(() => {
    if (markers.length === 0) return MAP_CENTER;
    const lats = markers.map(m => m.lat);
    const lngs = markers.map(m => m.lng);
    return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  }, [markers]);

  if (!apiKey) return <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">Cargando mapa...</div>;

  return (
    <GoogleMap mapContainerStyle={MAP_CONTAINER} center={center} zoom={12} options={{ disableDefaultUI: true, zoomControl: true }}>
      {markers.map(m => (
        <Marker
          key={m.id}
          position={{ lat: m.lat, lng: m.lng }}
          onClick={() => setSelected(m)}
          icon={{
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: m.visitado ? '#22c55e' : '#ef4444',
            fillOpacity: 0.9,
            strokeWeight: 1.5,
            strokeColor: '#fff',
            scale: 1.4,
            anchor: window.google ? new window.google.maps.Point(12, 22) : undefined,
          }}
        />
      ))}
      {selected && (
        <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
          <div className="text-xs p-1">
            <p className="font-bold">{selected.nombre}</p>
            <p>{selected.visitado ? '✅ Visitado' : '❌ Sin visitar'}</p>
            {selected.diasSinComprar !== null && <p>{selected.diasSinComprar} días sin comprar</p>}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
