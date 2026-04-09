import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ClientesEnRiesgoWidget } from '@/components/reportes/ClientesEnRiesgoWidget';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  MapPin,
  Package,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  XCircle,
  Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, todayInTimezone } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { GoogleMapsProvider, useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';

const MAP_CENTER = { lat: 20.6597, lng: -103.3496 };

const ROUTE_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#e11d48', '#0ea5e9', '#84cc16', '#d946ef', '#78716c',
];

type DashboardSeller = { id: string; user_id: string; nombre: string; aliases: string[] };
type MarkerPoint = { id: string; nombre: string; lat: number; lng: number; visitado: boolean; diasSinComprar: number | null; vendedorNombre: string; vendedorId: string; orden: number | null };
type SellerLocation = { id: string; nombre: string; lat: number; lng: number; hora: string };

function normalizePersonName(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function SupervisorDashboardPage() {
  const { empresa } = useAuth();
  const { fmt: fmtMoney } = useCurrency();
  const today = todayInTimezone(empresa?.zona_horaria);
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [visitFilter, setVisitFilter] = useState<'todos' | 'visitados' | 'pendientes'>('todos');
  const [soloHoy, setSoloHoy] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const isRangeMode = desde !== hasta || desde !== today;

  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const diaHoyLabel = useMemo(() => {
    const d = new Date(`${desde}T12:00:00`);
    return DIAS_SEMANA[d.getDay()];
  }, [desde]);

  // ═══════════════════════════════════════════════════════
  // DATA QUERIES (same as before)
  // ═══════════════════════════════════════════════════════

  const { data: vendedores } = useQuery({
    queryKey: ['supervisor-usuarios', empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const [profilesResult, vendedoresResult] = await Promise.all([
        supabase.from('profiles').select('id, user_id, nombre, estado').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre'),
        supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id),
      ]);
      const allProfiles = profilesResult.data ?? [];
      const aliasesByName = new Map<string, string[]>();
      (vendedoresResult.data ?? []).forEach((seller) => {
        const key = normalizePersonName(seller.nombre);
        if (!key) return;
        const current = aliasesByName.get(key) ?? [];
        current.push(seller.id);
        aliasesByName.set(key, current);
      });
      return allProfiles.map((profile) => {
        const key = normalizePersonName(profile.nombre);
        const aliases = Array.from(new Set([profile.id, ...(aliasesByName.get(key) ?? [])]));
        return { id: profile.id, user_id: profile.user_id, nombre: profile.nombre ?? 'Sin nombre', aliases } satisfies DashboardSeller;
      });
    },
  });

  const sellerIdMap = useMemo(() => {
    const map = new Map<string, string>();
    (vendedores ?? []).forEach((s) => s.aliases.forEach((a) => map.set(a, s.id)));
    return map;
  }, [vendedores]);

  const sellerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (vendedores ?? []).forEach((s) => { map.set(s.id, s.nombre); s.aliases.forEach((a) => map.set(a, s.nombre)); });
    return map;
  }, [vendedores]);

  const selectedSeller = useMemo(() => (vendedores ?? []).find((s) => s.id === selectedVendedor) ?? null, [selectedVendedor, vendedores]);
  const selectedAliases = selectedSeller?.aliases ?? null;

  const { data: ventasHoy } = useQuery({
    queryKey: ['supervisor-ventas-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('ventas')
        .select('id, vendedor_id, total, subtotal, status, tipo, condicion_pago, created_at, cliente_id, clientes(nombre), venta_lineas(producto_id, cantidad, total, productos(nombre, codigo))')
        .eq('empresa_id', empresa!.id).gte('fecha', desde).lte('fecha', hasta).neq('status', 'cancelado').order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: cobrosHoy } = useQuery({
    queryKey: ['supervisor-cobros-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('cobros')
        .select('id, user_id, monto, metodo_pago, created_at, cliente_id, clientes(nombre)')
        .eq('empresa_id', empresa!.id).gte('fecha', desde).lte('fecha', hasta).neq('status', 'cancelado').order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: gastosHoy } = useQuery({
    queryKey: ['supervisor-gastos-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('gastos')
        .select('id, vendedor_id, monto, concepto, created_at')
        .eq('empresa_id', empresa!.id).gte('fecha', desde).lte('fecha', hasta).order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: entregasHoy } = useQuery({
    queryKey: ['supervisor-entregas-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('entregas')
        .select('id, vendedor_id, vendedor_ruta_id, status, cliente_id, clientes(nombre), folio')
        .eq('empresa_id', empresa!.id).gte('fecha', desde).lte('fecha', hasta);
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: visitasHoy } = useQuery({
    queryKey: ['supervisor-visitas-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('visitas')
        .select('id, user_id, cliente_id, tipo, motivo, gps_lat, gps_lng, created_at, clientes(nombre, gps_lat, gps_lng)')
        .eq('empresa_id', empresa!.id).gte('fecha', `${desde}T00:00:00`).lte('fecha', `${hasta}T23:59:59`).order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const MOTIVO_LABELS: Record<string, string> = { no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro' };

  const { data: devolucionesHoy } = useQuery({
    queryKey: ['supervisor-devoluciones-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('devoluciones')
        .select('id, vendedor_id, tipo, clientes(nombre), created_at, devolucion_lineas(cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre))')
        .eq('empresa_id', empresa!.id).gte('fecha', desde).lte('fecha', hasta).order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: clientesAsignados } = useQuery({
    queryKey: ['supervisor-clientes-asignados', empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => fetchAllPages<any>((from, to) =>
      supabase.from('clientes').select('id, nombre, vendedor_id, gps_lat, gps_lng, dia_visita, orden')
        .eq('empresa_id', empresa!.id).eq('status', 'activo').range(from, to)),
  });

  const { data: ventasRecientes } = useQuery({
    queryKey: ['supervisor-ventas-recientes', empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const d = new Date(); d.setDate(d.getDate() - 90);
      return fetchAllPages<any>((from, to) =>
        supabase.from('ventas').select('id, cliente_id, fecha, total')
          .eq('empresa_id', empresa!.id).neq('status', 'cancelado').gte('fecha', d.toISOString().slice(0, 10))
          .order('fecha', { ascending: false }).range(from, to));
    },
  });

  const { data: cargasActivas } = useQuery({
    queryKey: ['supervisor-cargas-activas', empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('cargas').select('id, vendedor_id, status, fecha')
        .eq('empresa_id', empresa!.id).in('status', ['en_ruta', 'pendiente'] as any);
      return (data ?? []) as any[];
    },
    refetchInterval: 60000,
  });

  // ═══════════════════════════════════════════════════════
  // COMPUTED DATA
  // ═══════════════════════════════════════════════════════

  const filteredVentas = useMemo(() => (ventasHoy ?? []).filter((v) => !selectedAliases || selectedAliases.includes(v.vendedor_id)), [ventasHoy, selectedAliases]);
  const filteredCobros = useMemo(() => (cobrosHoy ?? []).filter((c) => !selectedSeller || c.user_id === selectedSeller.user_id), [cobrosHoy, selectedSeller]);
  const filteredGastos = useMemo(() => (gastosHoy ?? []).filter((g) => !selectedAliases || selectedAliases.includes(g.vendedor_id)), [gastosHoy, selectedAliases]);
  const filteredEntregas = useMemo(() => (entregasHoy ?? []).filter((e) => { if (!selectedAliases) return true; return selectedAliases.includes(e.vendedor_ruta_id || e.vendedor_id); }), [entregasHoy, selectedAliases]);
  const filteredVisitas = useMemo(() => (visitasHoy ?? []).filter((v) => !selectedSeller || v.user_id === selectedSeller.user_id), [visitasHoy, selectedSeller]);
  const filteredDevoluciones = useMemo(() => (devolucionesHoy ?? []).filter((d: any) => !selectedAliases || selectedAliases.includes(d.vendedor_id)), [devolucionesHoy, selectedAliases]);

  const devolucionesStats = useMemo(() => {
    let totalUnidades = 0, totalCredito = 0;
    filteredDevoluciones.forEach((d: any) => {
      (d.devolucion_lineas ?? []).forEach((l: any) => {
        totalUnidades += Number(l.cantidad) || 0;
        totalCredito += Number(l.monto_credito) || 0;
      });
    });
    return { totalUnidades, totalCredito, count: filteredDevoluciones.length };
  }, [filteredDevoluciones]);

  const vendedorStats = useMemo(() => {
    const stats: Record<string, { ventas: number; totalVentas: number; cobros: number; totalCobros: number; gastos: number; totalGastos: number; cargaActiva: boolean; entregas: number; entregasHecho: number; visitas: number }> = {};
    (vendedores ?? []).forEach((s) => { stats[s.id] = { ventas: 0, totalVentas: 0, cobros: 0, totalCobros: 0, gastos: 0, totalGastos: 0, cargaActiva: false, entregas: 0, entregasHecho: 0, visitas: 0 }; });
    (ventasHoy ?? []).forEach((v) => { const sid = sellerIdMap.get(v.vendedor_id); if (sid && stats[sid]) { stats[sid].ventas++; stats[sid].totalVentas += v.total ?? 0; } });
    (cobrosHoy ?? []).forEach((c) => { const s = (vendedores ?? []).find((i) => i.user_id === c.user_id); if (s && stats[s.id]) { stats[s.id].cobros++; stats[s.id].totalCobros += c.monto ?? 0; } });
    (gastosHoy ?? []).forEach((g) => { const sid = sellerIdMap.get(g.vendedor_id); if (sid && stats[sid]) { stats[sid].gastos++; stats[sid].totalGastos += g.monto ?? 0; } });
    (cargasActivas ?? []).forEach((c) => { const sid = sellerIdMap.get(c.vendedor_id); if (sid && stats[sid]) stats[sid].cargaActiva = true; });
    (entregasHoy ?? []).forEach((e) => { const sid = sellerIdMap.get(e.vendedor_ruta_id || e.vendedor_id); if (sid && stats[sid]) { stats[sid].entregas++; if (e.status === 'hecho') stats[sid].entregasHecho++; } });
    (visitasHoy ?? []).forEach((v) => { const s = (vendedores ?? []).find((i) => i.user_id === v.user_id); if (s && stats[s.id]) stats[s.id].visitas++; });
    return stats;
  }, [vendedores, ventasHoy, cobrosHoy, gastosHoy, cargasActivas, entregasHoy, visitasHoy, sellerIdMap]);

  const sellerRows = useMemo(() => {
    return (vendedores ?? []).map((s) => ({ ...s, ...(vendedorStats[s.id] ?? { ventas: 0, totalVentas: 0, cobros: 0, totalCobros: 0, gastos: 0, totalGastos: 0, cargaActiva: false, entregas: 0, entregasHecho: 0, visitas: 0 }) }))
      .sort((a, b) => b.totalVentas - a.totalVentas || b.visitas - a.visitas || a.nombre.localeCompare(b.nombre));
  }, [vendedores, vendedorStats]);

  const clienteActivity = useMemo(() => {
    const visitedIds = new Set([...filteredVisitas.map((v) => v.cliente_id).filter(Boolean), ...filteredVentas.map((v) => v.cliente_id).filter(Boolean)]);
    const lastSaleByClient: Record<string, { ultima: string; total: number }> = {};
    (ventasRecientes ?? []).forEach((v) => { if (!v.cliente_id) return; if (!lastSaleByClient[v.cliente_id] || v.fecha > lastSaleByClient[v.cliente_id].ultima) lastSaleByClient[v.cliente_id] = { ultima: v.fecha, total: v.total ?? 0 }; });
    const todayDate = new Date(`${today}T12:00:00`);
    return (clientesAsignados ?? [])
      .map((c) => {
        const sid = sellerIdMap.get(c.vendedor_id) ?? c.vendedor_id;
        const ls = lastSaleByClient[c.id];
        const dias = ls ? Math.floor((todayDate.getTime() - new Date(`${ls.ultima}T12:00:00`).getTime()) / 86400000) : null;
        const dv: string[] = (c.dia_visita ?? []).map((d: string) => d.toLowerCase());
        return { id: c.id, nombre: c.nombre, vendedor_id: sid, vendedorNombre: sellerNameMap.get(sid) ?? 'Sin asignar', visitado: visitedIds.has(c.id), visitaHoy: dv.some((d) => d === diaHoyLabel), gps_lat: c.gps_lat, gps_lng: c.gps_lng, ultimaVisitaFecha: ls?.ultima ?? null, ultimaVisitaValor: ls?.total ?? 0, diasSinComprar: dias, orden: c.orden ?? null };
      })
      .filter((c) => {
        if (selectedAliases && !selectedAliases.includes(c.vendedor_id)) return false;
        if (soloHoy && !c.visitaHoy) return false;
        if (visitFilter === 'visitados' && !c.visitado) return false;
        if (visitFilter === 'pendientes' && c.visitado) return false;
        return true;
      })
      .sort((a, b) => { if (a.visitado !== b.visitado) return a.visitado ? 1 : -1; return (b.diasSinComprar ?? 999) - (a.diasSinComprar ?? 999); });
  }, [filteredVisitas, filteredVentas, ventasRecientes, clientesAsignados, sellerIdMap, sellerNameMap, today, selectedAliases, soloHoy, visitFilter, diaHoyLabel]);

  const mapMarkers = useMemo<MarkerPoint[]>(() => clienteActivity.filter((c) => c.gps_lat && c.gps_lng).map((c) => ({ id: c.id, nombre: c.nombre, lat: c.gps_lat, lng: c.gps_lng, visitado: c.visitado, diasSinComprar: c.diasSinComprar, vendedorNombre: c.vendedorNombre, vendedorId: c.vendedor_id, orden: c.orden })), [clienteActivity]);

  const sellerLocations = useMemo<SellerLocation[]>(() => {
    const latest = new Map<string, { lat: number; lng: number; hora: string; nombre: string }>();
    (visitasHoy ?? []).forEach((v: any) => {
      if (!v.gps_lat || !v.gps_lng || !v.user_id) return;
      const sellerId = (vendedores ?? []).find((s) => s.user_id === v.user_id)?.id;
      if (!sellerId) return;
      if (selectedAliases && !selectedAliases.includes(sellerId)) return;
      const existing = latest.get(sellerId);
      if (!existing || v.created_at > existing.hora) {
        const nombre = sellerNameMap.get(sellerId) ?? 'Vendedor';
        const hora = new Date(v.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        latest.set(sellerId, { lat: v.gps_lat, lng: v.gps_lng, hora, nombre });
      }
    });
    return Array.from(latest.entries()).map(([id, data]) => ({ id, ...data }));
  }, [visitasHoy, vendedores, selectedAliases, sellerNameMap]);

  const dashboardStats = useMemo(() => {
    const totalVentas = filteredVentas.reduce((s, v) => s + (v.total ?? 0), 0);
    const totalCobros = filteredCobros.reduce((s, c) => s + (c.monto ?? 0), 0);
    const clientesVisitados = clienteActivity.filter((c) => c.visitado).length;
    const clientesPorVisitar = Math.max(clienteActivity.length - clientesVisitados, 0);
    const entregasHechas = filteredEntregas.filter((e) => e.status === 'hecho').length;
    const ticketPromedio = filteredVentas.length > 0 ? totalVentas / filteredVentas.length : 0;
    const efectividad = clienteActivity.length > 0 ? Math.round((clientesVisitados / clienteActivity.length) * 100) : 0;
    return { totalVentas, totalCobros, numVentas: filteredVentas.length, numCobros: filteredCobros.length, clientesVisitados, clientesPorVisitar, entregasHechas, entregasTotal: filteredEntregas.length, ticketPromedio, efectividad };
  }, [filteredVentas, filteredCobros, filteredEntregas, clienteActivity]);

  const handleSelectClient = useCallback((id: string) => {
    setSelectedClientId(id);
  }, []);

  // ═══════════════════════════════════════════════════════
  // RENDER — 3 ZONES
  // ═══════════════════════════════════════════════════════

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col overflow-hidden">
      {/* ═══ ZONE 1 — HEADER + FILTERS ═══ */}
      <div className="bg-card border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Centro de control</h1>
          </div>
          {!isRangeMode && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />EN VIVO
            </span>
          )}
          <Badge variant="secondary" className="text-[11px]">{diaHoyLabel.charAt(0).toUpperCase() + diaHoyLabel.slice(1)}</Badge>

          {/* Dates */}
          <div className="flex items-center gap-1.5 ml-auto">
            <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-accent/60 rounded-lg px-2 py-1 text-[12px] text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/40 w-[120px]" />
            <span className="text-[10px] text-muted-foreground">—</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="bg-accent/60 rounded-lg px-2 py-1 text-[12px] text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/40 w-[120px]" />
            {isRangeMode && (
              <button onClick={() => { setDesde(today); setHasta(today); }}
                className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">Hoy</button>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {/* Vendedor pills */}
          <button onClick={() => setSelectedVendedor(null)}
            className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              !selectedVendedor ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            Todos
          </button>
          {sellerRows.map((s) => (
            <button key={s.id} onClick={() => setSelectedVendedor(selectedVendedor === s.id ? null : s.id)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                selectedVendedor === s.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              {s.nombre}
              {s.cargaActiva && <span className="ml-1 text-[8px]">🟢</span>}
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-1" />

          {/* Visit filters */}
          {(['todos', 'visitados', 'pendientes'] as const).map((k) => (
            <button key={k} onClick={() => setVisitFilter(k)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors capitalize",
                visitFilter === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              {k}
            </button>
          ))}
          <button onClick={() => setSoloHoy(!soloHoy)}
            className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              soloHoy ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            📅 {diaHoyLabel.slice(0, 3)}
          </button>
        </div>
      </div>

      {/* ═══ ZONE 2 — KPIs ═══ */}
      <div className="bg-card border-b border-border px-4 py-2.5 shrink-0">
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
          <KpiChip icon={ShoppingCart} label="Ventas" value={fmtMoney(dashboardStats.totalVentas)} sub={`${dashboardStats.numVentas} ops`} />
          <KpiChip icon={Banknote} label="Cobros" value={fmtMoney(dashboardStats.totalCobros)} sub={`${dashboardStats.numCobros}`} />
          <KpiChip icon={TrendingUp} label="Ticket" value={fmtMoney(dashboardStats.ticketPromedio)} sub="promedio" />
          <KpiChip icon={CheckCircle2} label="Visitados" value={`${dashboardStats.clientesVisitados}/${dashboardStats.clientesVisitados + dashboardStats.clientesPorVisitar}`} sub={`${dashboardStats.efectividad}%`} color="text-emerald-600" />
          <KpiChip icon={Clock} label="Pendientes" value={String(dashboardStats.clientesPorVisitar)} color="text-destructive" />
          <KpiChip icon={Truck} label="Entregas" value={`${dashboardStats.entregasHechas}/${dashboardStats.entregasTotal}`} sub="hechas" />
          <KpiChip icon={Activity} label="Efectividad" value={`${dashboardStats.efectividad}%`} color={dashboardStats.efectividad >= 80 ? 'text-emerald-600' : 'text-destructive'} />
          <KpiChip icon={RotateCcw} label="Devol." value={`${devolucionesStats.totalUnidades}`} sub={`${devolucionesStats.count} reg`} color="text-destructive" />
        </div>
      </div>

      {/* ═══ ZONE 3 — MAP + TABS ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Map (60%) */}
        <div className="flex-[3] flex flex-col min-w-0">
          <GoogleMapsProvider>
            <SupervisorMap
              markers={mapMarkers}
              sellerLocations={sellerLocations}
              selectedClientId={selectedClientId}
              onSelectClient={handleSelectClient}
            />
          </GoogleMapsProvider>
          {/* Route color legend */}
          {(() => {
            const uniqueSellers = [...new Set(mapMarkers.map(m => m.vendedorId))];
            const sellerNames = new Map(mapMarkers.map(m => [m.vendedorId, m.vendedorNombre]));
            if (uniqueSellers.length <= 1) return null;
            return (
              <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-1.5 border-t border-border bg-muted/20 shrink-0">
                {uniqueSellers.map((sid, i) => (
                  <span key={sid} className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground">{sellerNames.get(sid)}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0 border-2 border-[#22c55e] bg-muted" />
                  <span className="text-[10px] text-muted-foreground">Visitado</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0 border-2 border-[#ef4444] bg-muted" />
                  <span className="text-[10px] text-muted-foreground">Pendiente</span>
                </span>
              </div>
            );
          })()}
        </div>

        {/* Right: Tabs (40%) */}
        <div className="flex-[2] border-l border-border bg-card flex flex-col min-w-0">
          <Tabs defaultValue="equipo" className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-border bg-card h-10 shrink-0 px-1">
              <TabsTrigger value="equipo" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background">
                <Users className="h-3.5 w-3.5" /> Equipo
              </TabsTrigger>
              <TabsTrigger value="clientes" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background">
                <MapPin className="h-3.5 w-3.5" /> Clientes
                <Badge variant="secondary" className="text-[8px] ml-0.5 px-1">{clienteActivity.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="actividad" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background">
                <ShoppingCart className="h-3.5 w-3.5" /> Actividad
              </TabsTrigger>
              <TabsTrigger value="riesgo" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background">
                <AlertCircle className="h-3.5 w-3.5" /> Riesgo
              </TabsTrigger>
            </TabsList>

            {/* Equipo Tab */}
            <TabsContent value="equipo" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-2">
                  {sellerRows.map((seller) => {
                    const active = selectedVendedor === seller.id;
                    return (
                      <button key={seller.id} onClick={() => setSelectedVendedor(active ? null : seller.id)}
                        className={cn("w-full rounded-xl border p-3 text-left transition-all",
                          active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 bg-card")}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[12px] font-semibold text-foreground truncate">{seller.nombre}</p>
                          {seller.cargaActiva && <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">EN RUTA</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <MiniStat label="Ventas" value={String(seller.ventas)} sub={fmtMoney(seller.totalVentas)} />
                          <MiniStat label="Cobros" value={String(seller.cobros)} sub={fmtMoney(seller.totalCobros)} />
                          <MiniStat label="Visitas" value={String(seller.visitas)} />
                          <MiniStat label="Entregas" value={`${seller.entregasHecho}/${seller.entregas}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Clientes Tab */}
            <TabsContent value="clientes" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-[1]">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground">Estado</th>
                      <th className="text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground">Cliente</th>
                      <th className="text-right px-2 py-2 text-[10px] font-semibold text-muted-foreground">Días</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clienteActivity.map((c) => (
                      <tr key={c.id}
                        className={cn("border-t border-border/30 hover:bg-accent/30 cursor-pointer transition-colors",
                          selectedClientId === c.id && "bg-primary/5",
                          !c.visitado && "bg-destructive/5")}
                        onClick={() => handleSelectClient(c.id)}>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            c.visitado ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                            {c.visitado ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                            {c.visitado ? 'OK' : 'Pend.'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <p className="text-[11px] font-medium text-foreground truncate max-w-[140px]">{c.nombre}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{c.vendedorNombre}</p>
                        </td>
                        <td className="text-right px-2 py-2">
                          {c.diasSinComprar !== null ? (
                            <span className={cn("text-[11px] font-semibold tabular-nums",
                              c.diasSinComprar > 14 ? "text-destructive" : c.diasSinComprar > 7 ? "text-primary" : "text-muted-foreground")}>
                              {c.diasSinComprar}d
                            </span>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </td>
                        <td className="text-right px-3 py-2 text-[11px] tabular-nums text-foreground">
                          {c.ultimaVisitaValor ? fmtMoney(c.ultimaVisitaValor) : '—'}
                        </td>
                      </tr>
                    ))}
                    {clienteActivity.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-xs">Sin clientes en ruta</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            {/* Actividad Tab */}
            <TabsContent value="actividad" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {/* Ventas */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5 text-primary" /> Ventas ({filteredVentas.length})
                    </h3>
                    {filteredVentas.length === 0 ? <EmptyBlock text="Sin ventas." /> : (
                      <div className="space-y-1">
                        {filteredVentas.slice(0, 10).map((v) => (
                          <div key={v.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-foreground truncate">{v.clientes?.nombre || 'Público general'}</p>
                              <p className="text-[9px] text-muted-foreground truncate">{sellerNameMap.get(v.vendedor_id) ?? '—'} · {v.tipo === 'pedido' ? 'Pedido' : 'Directa'}</p>
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-foreground shrink-0">{fmtMoney(v.total ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cobros */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5 text-primary" /> Cobros ({filteredCobros.length})
                    </h3>
                    {filteredCobros.length === 0 ? <EmptyBlock text="Sin cobros." /> : (
                      <div className="space-y-1">
                        {filteredCobros.slice(0, 10).map((c) => (
                          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-foreground truncate">{c.clientes?.nombre || '—'}</p>
                              <p className="text-[9px] text-muted-foreground">{c.metodo_pago ?? '—'}</p>
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-foreground shrink-0">{fmtMoney(c.monto ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Devoluciones */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-destructive" /> Devoluciones ({filteredDevoluciones.length})
                    </h3>
                    {filteredDevoluciones.length === 0 ? <EmptyBlock text="Sin devoluciones." /> : (
                      <div className="space-y-1">
                        {filteredDevoluciones.slice(0, 10).map((dev: any) => {
                          const lineas = dev.devolucion_lineas ?? [];
                          const uds = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
                          const motivos = [...new Set(lineas.map((l: any) => MOTIVO_LABELS[l.motivo] ?? l.motivo))].join(', ');
                          return (
                            <div key={dev.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium text-foreground truncate">{dev.clientes?.nombre || '—'}</p>
                                <p className="text-[9px] text-muted-foreground truncate">{sellerNameMap.get(dev.vendedor_id) ?? '—'} · {motivos}</p>
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums text-destructive shrink-0">{uds} uds</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Riesgo Tab */}
            <TabsContent value="riesgo" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {/* Ingreso en riesgo */}
                  {clienteActivity.filter(c => !c.visitado).length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" /> Ingreso en riesgo
                      </h3>
                      <ClientesEnRiesgoWidget
                        clientes={clienteActivity.filter(c => !c.visitado).map(c => ({
                          id: c.id, nombre: c.nombre, vendedor: c.vendedorNombre,
                          ultimaCompraFecha: c.ultimaVisitaFecha, ultimaCompraValor: c.ultimaVisitaValor,
                          diasSinComprar: c.diasSinComprar, visitadoHoy: false,
                        }))}
                        fmtMoney={fmtMoney} maxItems={10}
                      />
                    </div>
                  )}

                  {/* Alertas */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Alertas y foco
                    </h3>
                    {clienteActivity.filter((c) => !c.visitado || (c.diasSinComprar ?? 0) >= 7).length === 0 ? (
                      <EmptyBlock text="Sin alertas." />
                    ) : (
                      <div className="space-y-1">
                        {clienteActivity.filter((c) => !c.visitado || (c.diasSinComprar ?? 0) >= 7).slice(0, 12).map((c) => (
                          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2 cursor-pointer hover:bg-accent/30"
                            onClick={() => handleSelectClient(c.id)}>
                            {c.visitado ? <Clock className="h-3.5 w-3.5 text-primary shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-foreground truncate">{c.nombre}</p>
                              <p className="text-[9px] text-muted-foreground truncate">{c.vendedorNombre}</p>
                            </div>
                            <p className="text-[11px] font-bold text-foreground shrink-0">{c.diasSinComprar !== null ? `${c.diasSinComprar}d` : '—'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

function KpiChip({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-1.5">
      <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className={cn("text-sm font-bold tabular-nums leading-tight", color ?? "text-foreground")}>{value}</p>
          {sub && <span className="text-[9px] text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
      <p className="text-[11px] font-bold tabular-nums text-foreground leading-tight">{value}</p>
      {sub && <p className="text-[8px] text-muted-foreground truncate">{sub}</p>}
      <p className="text-[8px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-[12px] text-muted-foreground text-center">{text}</div>;
}

function SupervisorMap({ markers, sellerLocations = [], selectedClientId, onSelectClient }: {
  markers: MarkerPoint[];
  sellerLocations?: SellerLocation[];
  selectedClientId?: string | null;
  onSelectClient?: (id: string) => void;
}) {
  const { isLoaded } = useGoogleMaps();
  const [selected, setSelected] = useState<MarkerPoint | null>(null);
  const [selectedSellerLoc, setSelectedSellerLoc] = useState<SellerLocation | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const center = useMemo(() => {
    const allPoints = [...markers.map(m => ({ lat: m.lat, lng: m.lng })), ...sellerLocations.map(s => ({ lat: s.lat, lng: s.lng }))];
    if (allPoints.length === 0) return MAP_CENTER;
    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  }, [markers, sellerLocations]);

  const sellerColorMap = useMemo(() => {
    const uniqueSellers = [...new Set(markers.map((m) => m.vendedorId))];
    const map = new Map<string, string>();
    uniqueSellers.forEach((sid, i) => map.set(sid, ROUTE_COLORS[i % ROUTE_COLORS.length]));
    return map;
  }, [markers]);

  const makeNumberedIcon = useCallback((orden: number | null, visitado: boolean, color: string) => {
    const label = orden != null ? String(orden) : '';
    const size = 30;
    const borderColor = visitado ? '#22c55e' : '#ef4444';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="${borderColor}" stroke-width="3.5"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="bold" font-family="Arial,sans-serif">${label}</text>
    </svg>`;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };
  }, []);

  const makeSellerIcon = useCallback((nombre: string) => {
    const size = 36;
    const initial = (nombre || '?')[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#3b82f6" stroke="#fff" stroke-width="3"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="16" font-weight="bold" font-family="Arial,sans-serif">${initial}</text>
    </svg>`;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };
  }, []);

  // Fit bounds on load
  const fitBounds = useCallback(() => {
    if (mapRef.current && markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }));
      sellerLocations.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [markers, sellerLocations]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    fitBounds();
  }, [fitBounds]);

  // Center on selected client from list
  useEffect(() => {
    if (!selectedClientId || !mapRef.current) return;
    const marker = markers.find(m => m.id === selectedClientId);
    if (marker) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
      mapRef.current.setZoom(16);
      setSelected(marker);
    }
  }, [selectedClientId, markers]);

  // Re-fit when markers change
  useEffect(() => {
    fitBounds();
  }, [fitBounds]);

  if (!isLoaded) return <div className="flex-1 flex items-center justify-center bg-muted/30 text-sm text-muted-foreground">Cargando mapa...</div>;
  if (markers.length === 0 && sellerLocations.length === 0) return <div className="flex-1 flex items-center justify-center bg-muted/30 text-sm text-muted-foreground">Sin clientes geolocalizados.</div>;

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      center={center}
      zoom={12}
      onLoad={onMapLoad}
      options={{
        disableDefaultUI: true, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        ],
      }}
    >
      {markers.map((m) => (
        <Marker key={m.id} position={{ lat: m.lat, lng: m.lng }}
          onClick={() => { setSelected(m); setSelectedSellerLoc(null); onSelectClient?.(m.id); }}
          icon={makeNumberedIcon(m.orden, m.visitado, sellerColorMap.get(m.vendedorId) ?? '#ef4444')} />
      ))}
      {sellerLocations.map((s) => (
        <Marker key={`seller-${s.id}`} position={{ lat: s.lat, lng: s.lng }}
          onClick={() => { setSelectedSellerLoc(s); setSelected(null); }}
          icon={makeSellerIcon(s.nombre)} zIndex={1000} />
      ))}
      {selected && (
        <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
          <div className="space-y-1 p-1 text-xs">
            {selected.orden != null && <p className="font-bold text-sm">#{selected.orden}</p>}
            <p className="font-semibold">{selected.nombre}</p>
            <p style={{ color: '#6b7280' }}>{selected.vendedorNombre}</p>
            <p>{selected.visitado ? '✅ Visitado' : '⏳ Pendiente'}</p>
            {selected.diasSinComprar !== null && <p>{selected.diasSinComprar} días sin comprar</p>}
          </div>
        </InfoWindow>
      )}
      {selectedSellerLoc && (
        <InfoWindow position={{ lat: selectedSellerLoc.lat, lng: selectedSellerLoc.lng }} onCloseClick={() => setSelectedSellerLoc(null)}>
          <div className="space-y-1 p-1 text-xs">
            <p className="font-bold text-sm" style={{ color: '#3b82f6' }}>📍 {selectedSellerLoc.nombre}</p>
            <p style={{ color: '#6b7280' }}>Última visita: {selectedSellerLoc.hora}</p>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
