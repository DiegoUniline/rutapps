import { useMemo, useState, useCallback, useRef } from 'react';
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
  ChevronDown,
  ChevronUp,
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
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, todayInTimezone } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { GoogleMapsProvider, useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';
import { useIsMobile } from '@/hooks/use-mobile';

const MAP_CENTER = { lat: 20.6597, lng: -103.3496 };

type DashboardSeller = {
  id: string;
  user_id: string;
  nombre: string;
  aliases: string[];
};

type MarkerPoint = {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  visitado: boolean;
  diasSinComprar: number | null;
  vendedorNombre: string;
  orden: number | null;
};

type SellerLocation = {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  hora: string;
};

function normalizePersonName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getThemeColor(variable: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return raw ? `hsl(${raw})` : fallback;
}

export default function SupervisorDashboardPage() {
  const { empresa } = useAuth();
  const { fmt: fmtMoney } = useCurrency();
  const isMobile = useIsMobile();
  const today = todayInTimezone(empresa?.zona_horaria);
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [visitFilter, setVisitFilter] = useState<'todos' | 'visitados' | 'pendientes'>('todos');
  const [soloHoy, setSoloHoy] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showSellers, setShowSellers] = useState(false);
  const isRangeMode = desde !== hasta || desde !== today;

  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  // Derive day label from the selected 'desde' date so filter works for any chosen date
  const diaHoyLabel = useMemo(() => {
    const d = new Date(`${desde}T12:00:00`);
    return DIAS_SEMANA[d.getDay()];
  }, [desde]);

  const { data: vendedores } = useQuery({
    queryKey: ['supervisor-usuarios', empresa?.id],
    enabled: !!empresa?.id,
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
  const allDashboardSellerIds = useMemo(() => Array.from(new Set((vendedores ?? []).flatMap((s) => s.aliases))), [vendedores]);

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

  const filteredVentas = useMemo(() => (ventasHoy ?? []).filter((v) => !selectedAliases || selectedAliases.includes(v.vendedor_id)), [ventasHoy, selectedAliases]);
  const filteredCobros = useMemo(() => (cobrosHoy ?? []).filter((c) => !selectedSeller || c.user_id === selectedSeller.user_id), [cobrosHoy, selectedSeller]);
  const filteredGastos = useMemo(() => (gastosHoy ?? []).filter((g) => !selectedAliases || selectedAliases.includes(g.vendedor_id)), [gastosHoy, selectedAliases]);
  const filteredEntregas = useMemo(() => (entregasHoy ?? []).filter((e) => { if (!selectedAliases) return true; return selectedAliases.includes(e.vendedor_ruta_id || e.vendedor_id); }), [entregasHoy, selectedAliases]);
  const filteredVisitas = useMemo(() => (visitasHoy ?? []).filter((v) => !selectedSeller || v.user_id === selectedSeller.user_id), [visitasHoy, selectedSeller]);
  const filteredDevoluciones = useMemo(() => (devolucionesHoy ?? []).filter((d: any) => !selectedAliases || selectedAliases.includes(d.vendedor_id)), [devolucionesHoy, selectedAliases]);

  const devolucionesStats = useMemo(() => {
    let totalUnidades = 0, totalCredito = 0;
    const porMotivo: Record<string, number> = {};
    filteredDevoluciones.forEach((d: any) => {
      (d.devolucion_lineas ?? []).forEach((l: any) => {
        const qty = Number(l.cantidad) || 0;
        totalUnidades += qty; totalCredito += Number(l.monto_credito) || 0;
        porMotivo[l.motivo || 'otro'] = (porMotivo[l.motivo || 'otro'] || 0) + qty;
      });
    });
    return { totalUnidades, totalCredito, porMotivo, count: filteredDevoluciones.length };
  }, [filteredDevoluciones]);

  const productosSummary = useMemo(() => {
    const summary: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};
    filteredVentas.forEach((v) => {
      (v.venta_lineas ?? []).forEach((l: any) => {
        if (!l.producto_id) return;
        const p = l.productos as any;
        if (!summary[l.producto_id]) summary[l.producto_id] = { nombre: p?.nombre ?? '—', codigo: p?.codigo ?? '', cantidad: 0, total: 0 };
        summary[l.producto_id].cantidad += l.cantidad ?? 0;
        summary[l.producto_id].total += l.total ?? 0;
      });
    });
    return Object.values(summary).sort((a, b) => b.total - a.total);
  }, [filteredVentas]);

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

  const mapMarkers = useMemo<MarkerPoint[]>(() => clienteActivity.filter((c) => c.gps_lat && c.gps_lng).map((c) => ({ id: c.id, nombre: c.nombre, lat: c.gps_lat, lng: c.gps_lng, visitado: c.visitado, diasSinComprar: c.diasSinComprar, vendedorNombre: c.vendedorNombre, orden: c.orden })), [clienteActivity]);

  // Compute last known location per seller from their most recent visit today
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
    const totalGastos = filteredGastos.reduce((s, g) => s + (g.monto ?? 0), 0);
    const clientesVisitados = clienteActivity.filter((c) => c.visitado).length;
    const clientesPorVisitar = Math.max(clienteActivity.length - clientesVisitados, 0);
    const productosVendidos = productosSummary.reduce((s, p) => s + p.cantidad, 0);
    const entregasHechas = filteredEntregas.filter((e) => e.status === 'hecho').length;
    const ticketPromedio = filteredVentas.length > 0 ? totalVentas / filteredVentas.length : 0;
    const sellersWithActivity = sellerRows.filter((s) => selectedVendedor ? s.id === selectedVendedor : s.ventas > 0 || s.cobros > 0 || s.visitas > 0 || s.cargaActiva).length;
    return { totalVentas, totalCobros, totalGastos, numVentas: filteredVentas.length, numCobros: filteredCobros.length, numVisitas: filteredVisitas.length, visitasConCompra: filteredVisitas.filter((v) => v.tipo === 'venta').length, clientesVisitados, clientesPorVisitar, productosVendidos, totalProductos: productosSummary.length, entregasHechas, entregasTotal: filteredEntregas.length, ticketPromedio, sellersWithActivity, sinGeo: Math.max(clienteActivity.length - mapMarkers.length, 0) };
  }, [filteredVentas, filteredCobros, filteredGastos, filteredVisitas, filteredEntregas, clienteActivity, mapMarkers.length, productosSummary, sellerRows, selectedVendedor]);

  const alertClients = useMemo(() => clienteActivity.filter((c) => !c.visitado || (c.diasSinComprar ?? 0) >= 7).slice(0, 8), [clienteActivity]);

  return (
    <div className="space-y-3 sm:space-y-4 pb-6 px-2 sm:px-0">
      {/* ═══ STICKY HEADER ═══ */}
      <section className="sticky top-0 z-20 -mx-2 sm:mx-0 rounded-none sm:rounded-2xl border-b sm:border border-border bg-card/95 backdrop-blur-md p-3 sm:p-4 shadow-sm">
        {/* Row 1: Title + live badge + filter toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {!isRangeMode && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />EN VIVO
              </span>
            )}
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">Centro de control</h1>
          </div>
          <div className="flex items-center gap-1.5">
            {selectedSeller && (
              <Badge variant="secondary" className="text-[10px] max-w-[120px] truncate">{selectedSeller.nombre}</Badge>
            )}
            <button onClick={() => setShowFilters(!showFilters)}
              className={cn("flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground")}>
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filtros</span>
            </button>
          </div>
        </div>

        {/* Row 2: Date + quick filters (always visible) */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
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

          <div className="hidden sm:flex items-center gap-1 ml-auto">
            {(['todos', 'visitados', 'pendientes'] as const).map((k) => (
              <button key={k} onClick={() => setVisitFilter(k)}
                className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors capitalize",
                  visitFilter === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                {k}
              </button>
            ))}
            <button onClick={() => setSoloHoy(!soloHoy)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors capitalize",
                soloHoy ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              📅 {diaHoyLabel.slice(0, 3)}
            </button>
          </div>
        </div>

        {/* Mobile visit filters */}
        <div className="flex sm:hidden flex-wrap items-center gap-1 mt-1.5">
          {(['todos', 'visitados', 'pendientes'] as const).map((k) => (
            <button key={k} onClick={() => setVisitFilter(k)}
              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors capitalize",
                visitFilter === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              {k}
            </button>
          ))}
          <button onClick={() => setSoloHoy(!soloHoy)}
            className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              soloHoy ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            📅 {diaHoyLabel.slice(0, 3)}
          </button>
        </div>

        {/* Expandable filters: Seller selector */}
        {showFilters && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Vendedor</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedVendedor(null)}
                className={cn("rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  !selectedVendedor ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                Todos
              </button>
              {sellerRows.map((s) => (
                <button key={s.id} onClick={() => setSelectedVendedor(selectedVendedor === s.id ? null : s.id)}
                  className={cn("rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                    selectedVendedor === s.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  {s.nombre}
                  {s.cargaActiva && <span className="ml-1 text-[8px]">🟢</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ═══ KPI GRID ═══ */}
      <section className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2 sm:gap-3">
        <KpiCard icon={ShoppingCart} label="Ventas" value={fmtMoney(dashboardStats.totalVentas)} sub={`${dashboardStats.numVentas} ops`} />
        <KpiCard icon={Banknote} label="Cobros" value={fmtMoney(dashboardStats.totalCobros)} sub={`${dashboardStats.numCobros}`} />
        <KpiCard icon={TrendingUp} label="Ticket" value={fmtMoney(dashboardStats.ticketPromedio)} sub="promedio" />
        <KpiCard icon={Package} label="Productos" value={String(dashboardStats.productosVendidos)} sub={`${dashboardStats.totalProductos} SKUs`} />
        <KpiCard icon={Eye} label="Visitas" value={String(dashboardStats.numVisitas)} sub={`${dashboardStats.visitasConCompra} compra`} />
        <KpiCard icon={MapPin} label="Pendientes" value={String(dashboardStats.clientesPorVisitar)} sub={`${dashboardStats.clientesVisitados} ok`} tone="warning" />
        <KpiCard icon={Truck} label="Entregas" value={`${dashboardStats.entregasHechas}/${dashboardStats.entregasTotal}`} sub="hechas" />
        <KpiCard icon={RotateCcw} label="Devol." value={`${devolucionesStats.totalUnidades}`} sub={`${devolucionesStats.count} reg`} tone="warning" />
        <KpiCard icon={Users} label="Activos" value={String(dashboardStats.sellersWithActivity)} sub={`de ${sellerRows.length}`} />
      </section>

      {/* ═══ TEAM PULSE - Horizontal scroll on mobile ═══ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />Pulso del equipo
          </h2>
          <span className="text-[10px] text-muted-foreground">{sellerRows.length} vendedores</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 snap-x snap-mandatory scrollbar-thin">
          {sellerRows.map((seller) => {
            const active = selectedVendedor === seller.id;
            return (
              <button key={seller.id} onClick={() => setSelectedVendedor(active ? null : seller.id)}
                className={cn("snap-start shrink-0 w-[200px] sm:w-[220px] rounded-xl border p-3 text-left transition-all",
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
      </section>

      {/* ═══ MAP + ALERTS ═══ */}
      <section className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Mapa operativo</CardTitle>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <LegendDot className="bg-primary" label="Visitado" />
                <LegendDot className="bg-destructive" label="Pendiente" />
                <span className="font-semibold">{dashboardStats.clientesVisitados}/{clienteActivity.length}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <GoogleMapsProvider>
              <SupervisorMap markers={mapMarkers} sellerLocations={sellerLocations} height={isMobile ? 300 : 480} />
            </GoogleMapsProvider>
            <div className="grid grid-cols-3 border-t border-border bg-muted/30">
              <MiniSummary label="Visitados" value={String(dashboardStats.clientesVisitados)} />
              <MiniSummary label="Pendientes" value={String(dashboardStats.clientesPorVisitar)} />
              <MiniSummary label="Sin GPS" value={String(dashboardStats.sinGeo)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {/* Clientes en riesgo compact */}
          {clienteActivity.filter(c => !c.visitado).length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-destructive" />Ingreso en riesgo
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-3">
                <ClientesEnRiesgoWidget
                  clientes={clienteActivity.filter(c => !c.visitado).map(c => ({
                    id: c.id, nombre: c.nombre, vendedor: c.vendedorNombre,
                    ultimaCompraFecha: c.ultimaVisitaFecha, ultimaCompraValor: c.ultimaVisitaValor,
                    diasSinComprar: c.diasSinComprar, visitadoHoy: false,
                  }))}
                  fmtMoney={fmtMoney} maxItems={6}
                />
              </CardContent>
            </Card>
          )}

          {/* Alerts */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />Alertas y foco
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 pb-3 space-y-1.5 max-h-[300px] overflow-auto">
              {alertClients.length === 0 ? (
                <EmptyBlock text="Sin alertas." />
              ) : (
                alertClients.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                    {c.visitado ? <Clock className="h-3.5 w-3.5 text-primary shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-foreground truncate">{c.nombre}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{c.vendedorNombre}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-bold text-foreground">{c.diasSinComprar !== null ? `${c.diasSinComprar}d` : '—'}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══ ACTIVITY LISTS ═══ */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ActivityList title="Ventas" icon={ShoppingCart}
          items={filteredVentas.slice(0, 10).map((v) => ({
            id: v.id, primary: v.clientes?.nombre || 'Público general',
            secondary: `${sellerNameMap.get(v.vendedor_id) ?? '—'} · ${v.tipo === 'pedido' ? 'Pedido' : 'Directa'}`,
            value: fmtMoney(v.total ?? 0),
          }))}
          emptyText="Sin ventas." />

        <ActivityList title="Cobros" icon={Banknote}
          items={filteredCobros.slice(0, 10).map((c) => ({
            id: c.id, primary: c.clientes?.nombre || '—',
            secondary: `${c.metodo_pago ?? '—'}`,
            value: fmtMoney(c.monto ?? 0),
          }))}
          emptyText="Sin cobros." />

        <ActivityList title="Devoluciones" icon={RotateCcw}
          items={filteredDevoluciones.slice(0, 10).map((dev: any) => {
            const lineas = dev.devolucion_lineas ?? [];
            const uds = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
            const motivos = [...new Set(lineas.map((l: any) => MOTIVO_LABELS[l.motivo] ?? l.motivo))].join(', ');
            return { id: dev.id, primary: dev.clientes?.nombre || '—', secondary: `${sellerNameMap.get(dev.vendedor_id) ?? '—'} · ${motivos}`, value: `${uds} uds` };
          })}
          emptyText="Sin devoluciones." />

        <ProductPanel products={productosSummary.slice(0, 10)} fmtMoney={fmtMoney} />
      </section>

      {/* ═══ CLIENT TABLE ═══ */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Clientes en ruta</CardTitle>
            <Badge variant="secondary" className="text-[10px]">{clienteActivity.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {clienteActivity.length === 0 ? (
            <div className="px-4 pb-4"><EmptyBlock text="No hay clientes asignados." /></div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-y border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Vendedor</th>
                      <th className="px-3 py-2 text-right">Última</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-right">Días</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clienteActivity.map((c) => (
                      <tr key={c.id} className={cn('transition-colors hover:bg-accent/30', !c.visitado && 'bg-destructive/5')}>
                        <td className="px-3 py-2"><StatusPill visitado={c.visitado} compact /></td>
                        <td className="px-3 py-2 text-[12px] font-medium text-foreground truncate max-w-[180px]">{c.nombre}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">{c.vendedorNombre}</td>
                        <td className="px-3 py-2 text-right text-[11px] tabular-nums text-muted-foreground">{c.ultimaVisitaFecha ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-[11px] tabular-nums text-foreground">{c.ultimaVisitaValor ? fmtMoney(c.ultimaVisitaValor) : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {c.diasSinComprar !== null ? (
                            <span className={cn("text-[11px] font-semibold tabular-nums",
                              c.diasSinComprar > 14 ? "text-destructive" : c.diasSinComprar > 7 ? "text-primary" : "text-muted-foreground")}>
                              {c.diasSinComprar}d
                            </span>
                          ) : <span className="text-muted-foreground text-[11px]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden max-h-[400px] overflow-auto divide-y divide-border">
                {clienteActivity.map((c) => (
                  <div key={c.id} className={cn("px-3 py-2.5 flex items-center gap-2", !c.visitado && "bg-destructive/5")}>
                    <div className={cn("w-2 h-2 rounded-full shrink-0", c.visitado ? "bg-primary" : "bg-destructive")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground truncate">{c.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{c.vendedorNombre}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {c.diasSinComprar !== null ? (
                        <p className={cn("text-[11px] font-bold",
                          c.diasSinComprar > 14 ? "text-destructive" : c.diasSinComprar > 7 ? "text-primary" : "text-muted-foreground")}>
                          {c.diasSinComprar}d
                        </p>
                      ) : <p className="text-[10px] text-muted-foreground">—</p>}
                      {c.ultimaVisitaValor > 0 && <p className="text-[9px] text-muted-foreground">{fmtMoney(c.ultimaVisitaValor)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone = 'default' }: {
  icon: any; label: string; value: string; sub: string; tone?: 'default' | 'warning';
}) {
  return (
    <div className={cn("rounded-xl border p-2.5 sm:p-3 bg-card",
      tone === 'warning' ? "border-destructive/20" : "border-border")}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={cn("w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center shrink-0",
          tone === 'warning' ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </div>
        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">{label}</span>
      </div>
      <p className="text-base sm:text-lg font-bold text-foreground leading-tight tabular-nums truncate">{value}</p>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
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

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 text-center">
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('h-2 w-2 rounded-full', className)} />
      <span className="text-[10px]">{label}</span>
    </span>
  );
}

function StatusPill({ visitado, compact }: { visitado: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        visitado ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
        {visitado ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {visitado ? 'OK' : 'Pend.'}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      visitado ? "border-primary/20 bg-primary/10 text-primary" : "border-destructive/20 bg-destructive/10 text-destructive")}>
      {visitado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {visitado ? 'Visitado' : 'Pendiente'}
    </span>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-[12px] text-muted-foreground text-center">{text}</div>;
}

function ActivityList({ title, icon: Icon, items, emptyText }: {
  title: string; icon: any;
  items: { id: string; primary: string; secondary: string; badge?: string; value: string }[];
  emptyText: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {items.length > 0 && <Badge variant="secondary" className="ml-auto text-[9px]">{items.length}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3">
        {items.length === 0 ? <EmptyBlock text={emptyText} /> : (
          <div className="space-y-1">
            {shown.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground truncate">{item.primary}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{item.secondary}</p>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-foreground shrink-0">{item.value}</span>
              </div>
            ))}
            {items.length > 5 && (
              <button onClick={() => setExpanded(!expanded)}
                className="w-full text-center text-[10px] text-primary font-medium py-1 hover:underline">
                {expanded ? 'Ver menos' : `Ver ${items.length - 5} más`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductPanel({ products, fmtMoney }: { products: { nombre: string; codigo: string; cantidad: number; total: number }[]; fmtMoney: (v: number) => string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Package className="h-3.5 w-3.5" />
          </div>
          <CardTitle className="text-sm font-semibold">Top productos</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3">
        {products.length === 0 ? <EmptyBlock text="Sin productos." /> : (
          <div className="space-y-1">
            {products.map((p, i) => (
              <div key={`${p.codigo}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                <span className="text-[10px] font-bold text-muted-foreground w-4 text-center shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground truncate">{p.nombre}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-semibold tabular-nums text-foreground">{p.cantidad}</p>
                  <p className="text-[8px] text-muted-foreground">{fmtMoney(p.total)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupervisorMap({ markers, sellerLocations = [], height = 480 }: { markers: MarkerPoint[]; sellerLocations?: SellerLocation[]; height?: number }) {
  const { isLoaded } = useGoogleMaps();
  const [selected, setSelected] = useState<MarkerPoint | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<SellerLocation | null>(null);

  const center = useMemo(() => {
    const allPoints = [...markers.map(m => ({ lat: m.lat, lng: m.lng })), ...sellerLocations.map(s => ({ lat: s.lat, lng: s.lng }))];
    if (allPoints.length === 0) return MAP_CENTER;
    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  }, [markers, sellerLocations]);

  // Green for visited, red for pending — matching mobile route style
  const VISITED_GREEN = '#22c55e';
  const PENDING_RED = '#ef4444';
  const SELLER_BLUE = '#3b82f6';

  const makeNumberedIcon = useCallback((orden: number | null, visitado: boolean) => {
    const color = visitado ? VISITED_GREEN : PENDING_RED;
    const label = orden != null ? String(orden) : '';
    const size = 28;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="#fff" stroke-width="2.5"/>
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
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${SELLER_BLUE}" stroke="#fff" stroke-width="3"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="16" font-weight="bold" font-family="Arial,sans-serif">${initial}</text>
    </svg>`;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };
  }, []);

  if (!isLoaded) return <div style={{ height }} className="flex items-center justify-center bg-muted/30 text-sm text-muted-foreground">Cargando mapa...</div>;
  if (markers.length === 0 && sellerLocations.length === 0) return <div style={{ height }} className="flex items-center justify-center bg-muted/30 text-sm text-muted-foreground">Sin clientes geolocalizados.</div>;

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: `${height}px` }}
      center={center}
      zoom={12}
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
        <Marker key={m.id} position={{ lat: m.lat, lng: m.lng }} onClick={() => { setSelected(m); setSelectedSeller(null); }}
          icon={makeNumberedIcon(m.orden, m.visitado)} />
      ))}
      {sellerLocations.map((s) => (
        <Marker key={`seller-${s.id}`} position={{ lat: s.lat, lng: s.lng }} onClick={() => { setSelectedSeller(s); setSelected(null); }}
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
      {selectedSeller && (
        <InfoWindow position={{ lat: selectedSeller.lat, lng: selectedSeller.lng }} onCloseClick={() => setSelectedSeller(null)}>
          <div className="space-y-1 p-1 text-xs">
            <p className="font-bold text-sm" style={{ color: SELLER_BLUE }}>📍 {selectedSeller.nombre}</p>
            <p style={{ color: '#6b7280' }}>Última visita: {selectedSeller.hora}</p>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
