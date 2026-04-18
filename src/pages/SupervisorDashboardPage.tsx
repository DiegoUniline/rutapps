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
  MapPin,
  Package,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  XCircle,
  Activity,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { cn, todayInTimezone } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { GoogleMapsProvider, useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';
import { MultiRouteOverlay, type RouteResultEntry } from '@/components/maps/MultiRoutePanel';
import LiveVendedoresLayer from '@/components/LiveVendedoresLayer';
import VendedorRecorridoLayer from '@/components/VendedorRecorridoLayer';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';

const MAP_CENTER = { lat: 20.6597, lng: -103.3496 };

const ROUTE_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#e11d48', '#0ea5e9', '#84cc16', '#d946ef', '#78716c',
];

type DashboardSeller = { id: string; user_id: string; nombre: string; aliases: string[] };
type MarkerPoint = { id: string; nombre: string; lat: number; lng: number; visitado: boolean; diasSinComprar: number | null; vendedorNombre: string; vendedorId: string; orden: number | null; outOfRange: boolean; outOfRangeMeters: number | null };
type SellerLocation = { id: string; nombre: string; lat: number; lng: number; hora: string };

/** Distancia máxima (m) para considerar que una venta/visita se hizo "en el cliente" */
const VISIT_RADIUS_METERS = 100;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normalizePersonName(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getWeekRange(todayStr: string) {
  const d = new Date(`${todayStr}T12:00:00`);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    desde: monday.toISOString().slice(0, 10),
    hasta: sunday.toISOString().slice(0, 10),
    days: Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      return { date: dd.toISOString().slice(0, 10), label: DIAS_CORTOS[dd.getDay()] };
    }),
  };
}

export default function SupervisorDashboardPage() {
  const { empresa } = useAuth();
  const { fmt: fmtMoney, symbol: cs } = useCurrency();
  const today = todayInTimezone(empresa?.zona_horaria);
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [visitFilter, setVisitFilter] = useState<'todos' | 'visitados' | 'pendientes'>('todos');
  const [soloHoy, setSoloHoy] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  // Recorrido histórico de un vendedor (línea sobre el mapa)
  const [recorridoUserId, setRecorridoUserId] = useState<string | null>(null);
  const [recorridoFecha, setRecorridoFecha] = useState<string>(today);
  const isRangeMode = desde !== hasta || desde !== today;

  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  // Normaliza día: minúsculas + sin acentos (clientes pueden tener "Viernes", "miércoles", "Miercoles", etc.)
  const normDia = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const diaHoyLabel = useMemo(() => {
    const d = new Date(`${desde}T12:00:00`);
    return normDia(DIAS_SEMANA[d.getDay()]);
  }, [desde]);

  const week = useMemo(() => getWeekRange(today), [today]);

  // ═══════════════════════════════════════════════════════
  // DATA QUERIES
  // ═══════════════════════════════════════════════════════

  const { data: vendedores } = useQuery({
    queryKey: ['supervisor-usuarios', empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data: allProfiles } = await supabase.from('profiles').select('id, user_id, nombre, estado').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return (allProfiles ?? []).map((profile) => {
        return { id: profile.id, user_id: profile.user_id, nombre: profile.nombre ?? 'Sin nombre', aliases: [profile.id] } satisfies DashboardSeller;
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
        .eq('empresa_id', empresa!.id).gte('fecha', `${desde}T00:00:00-12:00`).lte('fecha', `${hasta}T23:59:59+12:00`).order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const MOTIVO_LABELS: Record<string, string> = { no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro' };

  const { data: devolucionesHoy } = useQuery({
    queryKey: ['supervisor-devoluciones-hoy', desde, hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('devoluciones')
        .select('id, vendedor_id, tipo, cliente_id, clientes(nombre), created_at, devolucion_lineas(cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre))')
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

  // Rutas guardadas (cliente_orden_ruta) para visualizar multirruta tal como el Mapa de Clientes
  const { data: savedRoutes } = useQuery({
    queryKey: ['supervisor-saved-routes', empresa?.id, diaHoyLabel, selectedSeller?.id ?? null, soloHoy],
    enabled: !!empresa?.id && soloHoy,
    queryFn: async () => {
      let q = supabase
        .from('cliente_orden_ruta' as any)
        .select('cliente_id, orden, vendedor_id, origin_lat, origin_lng, origin_label, dia')
        .eq('empresa_id', empresa!.id)
        .order('vendedor_id', { ascending: true, nullsFirst: false })
        .order('orden', { ascending: true });
      if (selectedSeller?.id) q = q.eq('vendedor_id', selectedSeller.id);
      const { data } = await q;
      return ((data ?? []) as unknown) as {
        cliente_id: string; orden: number; vendedor_id: string | null;
        origin_lat: number | null; origin_lng: number | null; origin_label: string | null;
        dia: string | null;
      }[];
    },
  });

  // Build multi-route entries from saved order, restricted to today's clients with GPS
  const multiRouteEntries = useMemo<RouteResultEntry[]>(() => {
    if (!savedRoutes || savedRoutes.length === 0) return [];
    // Match the day used by the supervisor view (soloHoy = day-of-week)
    // Saved routes can have dia=null (global) or a specific day. Prefer rows that match today, otherwise globals.
    const todayCap = diaHoyLabel.charAt(0).toUpperCase() + diaHoyLabel.slice(1);
    const filtered = savedRoutes.filter(r => !r.dia || r.dia === todayCap || r.dia.toLowerCase() === diaHoyLabel);
    if (filtered.length === 0) return [];
    const groups = new Map<string, { rows: typeof filtered; origin: { lat: number; lng: number; label: string } | null }>();
    for (const row of filtered) {
      const key = row.vendedor_id ?? '__sin_vendedor__';
      if (!groups.has(key)) {
        groups.set(key, {
          rows: [],
          origin: row.origin_lat != null && row.origin_lng != null
            ? { lat: Number(row.origin_lat), lng: Number(row.origin_lng), label: row.origin_label ?? 'Origen' }
            : null,
        });
      }
      const g = groups.get(key)!;
      if (!g.origin && row.origin_lat != null && row.origin_lng != null) {
        g.origin = { lat: Number(row.origin_lat), lng: Number(row.origin_lng), label: row.origin_label ?? 'Origen' };
      }
      g.rows.push(row);
    }
    if (groups.size > 1 && groups.has('__sin_vendedor__')) groups.delete('__sin_vendedor__');
    return Array.from(groups.entries()).map(([vid, g]) => {
      const ordered = g.rows.sort((a, b) => a.orden - b.orden).map(r => r.cliente_id);
      const vendedor = (vendedores ?? []).find(v => v.id === vid);
      return {
        vendedor_id: vid,
        vendedor_nombre: vendedor?.nombre ?? (vid === '__sin_vendedor__' ? 'Sin vendedor' : 'Vendedor'),
        origin: g.origin ?? { lat: 0, lng: 0, label: 'Origen' },
        optimized_order: ordered,
        polyline: null, // straight-line fallback in MultiRouteOverlay
        distance_meters: 0,
        duration: '0s',
        original_distance_meters: 0,
      };
    });
  }, [savedRoutes, vendedores, diaHoyLabel]);

  // Weekly data for charts
  const { data: ventasSemana } = useQuery({
    queryKey: ['supervisor-ventas-semana', week.desde, week.hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages<any>((from, to) =>
        supabase.from('ventas').select('id, vendedor_id, total, fecha')
          .eq('empresa_id', empresa!.id).gte('fecha', week.desde).lte('fecha', week.hasta).neq('status', 'cancelado').range(from, to));
    },
  });

  const { data: cobrosSemana } = useQuery({
    queryKey: ['supervisor-cobros-semana', week.desde, week.hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages<any>((from, to) =>
        supabase.from('cobros').select('id, monto, fecha, user_id')
          .eq('empresa_id', empresa!.id).gte('fecha', week.desde).lte('fecha', week.hasta).neq('status', 'cancelado').range(from, to));
    },
  });

  const { data: visitasSemana } = useQuery({
    queryKey: ['supervisor-visitas-semana', week.desde, week.hasta, empresa?.id], enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages<any>((from, to) =>
        supabase.from('visitas').select('id, user_id, fecha')
          .eq('empresa_id', empresa!.id).gte('fecha', `${week.desde}T00:00:00`).lte('fecha', `${week.hasta}T23:59:59`).range(from, to));
    },
  });

  // Cartera vencida (all unpaid credit sales)
  const { data: carteraData } = useQuery({
    queryKey: ['supervisor-cartera', empresa?.id], enabled: !!empresa?.id,
    staleTime: 3 * 60 * 1000,
    queryFn: async () => fetchAllPages<any>((from, to) =>
      supabase.from('ventas').select('id, fecha, total, saldo_pendiente, cliente_id, clientes(nombre), vendedor_id')
        .eq('empresa_id', empresa!.id).eq('condicion_pago', 'credito').gt('saldo_pendiente', 0)
        .neq('status', 'cancelado' as any).range(from, to)),
  });

  // Yesterday data for comparisons
  const yesterday = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const lastWeekSameDay = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const { data: ventasAyer } = useQuery({
    queryKey: ['supervisor-ventas-ayer', yesterday, empresa?.id], enabled: !!empresa?.id && desde === today,
    queryFn: async () => {
      const { data } = await supabase.from('ventas').select('id, total')
        .eq('empresa_id', empresa!.id).eq('fecha', yesterday).neq('status', 'cancelado');
      return data ?? [];
    },
  });

  const { data: ventasSemPasada } = useQuery({
    queryKey: ['supervisor-ventas-sem-pasada', lastWeekSameDay, empresa?.id], enabled: !!empresa?.id && desde === today,
    queryFn: async () => {
      const { data } = await supabase.from('ventas').select('id, total')
        .eq('empresa_id', empresa!.id).eq('fecha', lastWeekSameDay).neq('status', 'cancelado');
      return data ?? [];
    },
  });

  // Top productos del día
  const topProductosHoy = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo: string; qty: number; total: number }>();
    (ventasHoy ?? []).forEach((v: any) => {
      (v.venta_lineas ?? []).forEach((l: any) => {
        const pid = l.producto_id;
        const existing = map.get(pid) ?? { nombre: l.productos?.nombre ?? 'N/A', codigo: l.productos?.codigo ?? '', qty: 0, total: 0 };
        existing.qty += Number(l.cantidad) || 0;
        existing.total += Number(l.total) || 0;
        map.set(pid, existing);
      });
    });
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  }, [ventasHoy]);

  // Cartera aging buckets
  const carteraAging = useMemo(() => {
    const buckets = { '1-7': 0, '8-15': 0, '16-30': 0, '30+': 0, total: 0 };
    const todayMs = new Date(`${today}T12:00:00`).getTime();
    (carteraData ?? []).forEach((v: any) => {
      const dias = Math.floor((todayMs - new Date(`${v.fecha}T12:00:00`).getTime()) / 86400000);
      const saldo = Number(v.saldo_pendiente) || 0;
      buckets.total += saldo;
      if (dias <= 7) buckets['1-7'] += saldo;
      else if (dias <= 15) buckets['8-15'] += saldo;
      else if (dias <= 30) buckets['16-30'] += saldo;
      else buckets['30+'] += saldo;
    });
    return buckets;
  }, [carteraData, today]);




  const filteredVentas = useMemo(() => (ventasHoy ?? []).filter((v) => !selectedAliases || selectedAliases.includes(v.vendedor_id)), [ventasHoy, selectedAliases]);
  const filteredCobros = useMemo(() => (cobrosHoy ?? []).filter((c) => !selectedSeller || c.user_id === selectedSeller.user_id), [cobrosHoy, selectedSeller]);
  const filteredGastos = useMemo(() => (gastosHoy ?? []).filter((g) => !selectedAliases || selectedAliases.includes(g.vendedor_id)), [gastosHoy, selectedAliases]);
  const filteredEntregas = useMemo(() => (entregasHoy ?? []).filter((e) => { if (!selectedAliases) return true; return selectedAliases.includes(e.vendedor_ruta_id || e.vendedor_id); }), [entregasHoy, selectedAliases]);
  const filteredVisitas = useMemo(() => (visitasHoy ?? []).filter((v) => !selectedSeller || v.user_id === selectedSeller.user_id), [visitasHoy, selectedSeller]);
  const filteredDevoluciones = useMemo(() => (devolucionesHoy ?? []).filter((d: any) => !selectedAliases || selectedAliases.includes(d.vendedor_id)), [devolucionesHoy, selectedAliases]);

  const devolucionesStats = useMemo(() => {
    let totalUnidades = 0;
    filteredDevoluciones.forEach((d: any) => {
      (d.devolucion_lineas ?? []).forEach((l: any) => { totalUnidades += Number(l.cantidad) || 0; });
    });
    return { totalUnidades, count: filteredDevoluciones.length };
  }, [filteredDevoluciones]);

  const vendedorStats = useMemo(() => {
    const stats: Record<string, { ventas: number; totalVentas: number; cobros: number; totalCobros: number; gastos: number; totalGastos: number; cargaActiva: boolean; entregas: number; entregasHecho: number; visitas: number; ultimaVisita: string | null; clientesAsignados: number; clientesVisitados: number }> = {};
    (vendedores ?? []).forEach((s) => { stats[s.id] = { ventas: 0, totalVentas: 0, cobros: 0, totalCobros: 0, gastos: 0, totalGastos: 0, cargaActiva: false, entregas: 0, entregasHecho: 0, visitas: 0, ultimaVisita: null, clientesAsignados: 0, clientesVisitados: 0 }; });
    (ventasHoy ?? []).forEach((v) => { const sid = sellerIdMap.get(v.vendedor_id); if (sid && stats[sid]) { stats[sid].ventas++; stats[sid].totalVentas += v.total ?? 0; } });
    (cobrosHoy ?? []).forEach((c) => { const s = (vendedores ?? []).find((i) => i.user_id === c.user_id); if (s && stats[s.id]) { stats[s.id].cobros++; stats[s.id].totalCobros += c.monto ?? 0; } });
    (gastosHoy ?? []).forEach((g) => { const sid = sellerIdMap.get(g.vendedor_id); if (sid && stats[sid]) { stats[sid].gastos++; stats[sid].totalGastos += g.monto ?? 0; } });
    (cargasActivas ?? []).forEach((c) => { const sid = sellerIdMap.get(c.vendedor_id); if (sid && stats[sid]) stats[sid].cargaActiva = true; });
    (entregasHoy ?? []).forEach((e) => { const sid = sellerIdMap.get(e.vendedor_ruta_id || e.vendedor_id); if (sid && stats[sid]) { stats[sid].entregas++; if (e.status === 'hecho') stats[sid].entregasHecho++; } });
    (visitasHoy ?? []).forEach((v) => {
      const s = (vendedores ?? []).find((i) => i.user_id === v.user_id);
      if (s && stats[s.id]) {
        stats[s.id].visitas++;
        if (!stats[s.id].ultimaVisita || v.created_at > stats[s.id].ultimaVisita!) stats[s.id].ultimaVisita = v.created_at;
      }
    });
    return stats;
  }, [vendedores, ventasHoy, cobrosHoy, gastosHoy, cargasActivas, entregasHoy, visitasHoy, sellerIdMap]);

  // Count clients assigned + visited per seller
  const sellerClientStats = useMemo(() => {
    const visitedIds = new Set([
      ...(filteredVisitas ?? []).map((v) => v.cliente_id).filter(Boolean),
      ...(filteredVentas ?? []).map((v) => v.cliente_id).filter(Boolean),
    ]);
    const assignedPerSeller: Record<string, { total: number; visited: number }> = {};
    (clientesAsignados ?? []).forEach((c) => {
      const sid = sellerIdMap.get(c.vendedor_id) ?? c.vendedor_id;
      if (!assignedPerSeller[sid]) assignedPerSeller[sid] = { total: 0, visited: 0 };
      // check if client is scheduled for today
      const dv: string[] = (c.dia_visita ?? []).map((d: string) => normDia(d));
      if (soloHoy && !dv.some((d) => d === diaHoyLabel)) return;
      assignedPerSeller[sid].total++;
      if (visitedIds.has(c.id)) assignedPerSeller[sid].visited++;
    });
    return assignedPerSeller;
  }, [clientesAsignados, filteredVisitas, filteredVentas, sellerIdMap, soloHoy, diaHoyLabel]);

  const sellerRows = useMemo(() => {
    return (vendedores ?? []).map((s) => ({
      ...s,
      ...(vendedorStats[s.id] ?? { ventas: 0, totalVentas: 0, cobros: 0, totalCobros: 0, gastos: 0, totalGastos: 0, cargaActiva: false, entregas: 0, entregasHecho: 0, visitas: 0, ultimaVisita: null }),
      clientesAsignados: sellerClientStats[s.id]?.total ?? 0,
      clientesVisitados: sellerClientStats[s.id]?.visited ?? 0,
    }))
      .sort((a, b) => b.totalVentas - a.totalVentas || b.visitas - a.visitas || a.nombre.localeCompare(b.nombre));
  }, [vendedores, vendedorStats, sellerClientStats]);

  const clienteActivity = useMemo(() => {
    // Use ALL ventas/visitas (not filtered by vendedor) to determine visit status
    const visitedIds = new Set([...(visitasHoy ?? []).map((v: any) => v.cliente_id).filter(Boolean), ...(ventasHoy ?? []).map((v: any) => v.cliente_id).filter(Boolean)]);
    const lastSaleByClient: Record<string, { ultima: string; total: number }> = {};
    (ventasRecientes ?? []).forEach((v) => { if (!v.cliente_id) return; if (!lastSaleByClient[v.cliente_id] || v.fecha > lastSaleByClient[v.cliente_id].ultima) lastSaleByClient[v.cliente_id] = { ultima: v.fecha, total: v.total ?? 0 }; });
    const todayDate = new Date(`${today}T12:00:00`);
    return (clientesAsignados ?? [])
      .map((c) => {
        const sid = sellerIdMap.get(c.vendedor_id) ?? c.vendedor_id;
        const ls = lastSaleByClient[c.id];
        const dias = ls ? Math.floor((todayDate.getTime() - new Date(`${ls.ultima}T12:00:00`).getTime()) / 86400000) : null;
        const dv: string[] = (c.dia_visita ?? []).map((d: string) => normDia(d));
        return { id: c.id, nombre: c.nombre, vendedor_id: sid, vendedorNombre: sellerNameMap.get(sid) ?? 'Sin asignar', visitado: visitedIds.has(c.id), visitaHoy: dv.some((d) => d === diaHoyLabel), gps_lat: c.gps_lat, gps_lng: c.gps_lng, ultimaVisitaFecha: ls?.ultima ?? null, ultimaVisitaValor: ls?.total ?? 0, diasSinComprar: dias, orden: c.orden ?? null };
      })
      .filter((c) => {
        if (selectedAliases && !selectedAliases.includes(c.vendedor_id)) return false;
        // Mostrar siempre clientes visitados hoy aunque hoy no sea su día programado
        if (soloHoy && !c.visitaHoy && !c.visitado) return false;
        if (visitFilter === 'visitados' && !c.visitado) return false;
        if (visitFilter === 'pendientes' && c.visitado) return false;
        return true;
      })
      .sort((a, b) => { if (a.visitado !== b.visitado) return a.visitado ? 1 : -1; return (b.diasSinComprar ?? 999) - (a.diasSinComprar ?? 999); });
  }, [visitasHoy, ventasHoy, ventasRecientes, clientesAsignados, sellerIdMap, sellerNameMap, today, selectedAliases, soloHoy, visitFilter, diaHoyLabel]);

  // Comparisons vs yesterday / last week
  const comparisons = useMemo(() => {
    if (desde !== today) return null;
    const totalHoy = filteredVentas.reduce((s, v) => s + (v.total ?? 0), 0);
    const totalAyer = (ventasAyer ?? []).reduce((s: number, v: any) => s + (v.total ?? 0), 0);
    const totalSemPas = (ventasSemPasada ?? []).reduce((s: number, v: any) => s + (v.total ?? 0), 0);
    const diffAyer = totalAyer > 0 ? Math.round(((totalHoy - totalAyer) / totalAyer) * 100) : null;
    const diffSem = totalSemPas > 0 ? Math.round(((totalHoy - totalSemPas) / totalSemPas) * 100) : null;
    return { totalAyer, totalSemPas, diffAyer, diffSem };
  }, [desde, today, filteredVentas, ventasAyer, ventasSemPasada]);

  // Smart alerts
  const smartAlerts = useMemo(() => {
    const alerts: { type: 'warning' | 'danger' | 'info'; icon: string; text: string }[] = [];
    const now = Date.now();
    (vendedores ?? []).forEach(s => {
      const stats = vendedorStats[s.id];
      if (!stats?.cargaActiva) return;
      if (stats.ultimaVisita) {
        const hoursSince = (now - new Date(stats.ultimaVisita).getTime()) / 3600000;
        if (hoursSince >= 2) alerts.push({ type: 'warning', icon: '⏰', text: `${s.nombre} lleva ${Math.floor(hoursSince)}h sin actividad estando en ruta` });
      } else {
        alerts.push({ type: 'warning', icon: '⏰', text: `${s.nombre} está en ruta pero sin visitas registradas` });
      }
    });
    const totalVentasHoy = filteredVentas.reduce((s, v) => s + (v.total ?? 0), 0);
    const totalGastosHoy = filteredGastos.reduce((s, g) => s + (g.monto ?? 0), 0);
    if (totalVentasHoy > 0 && totalGastosHoy > 0) {
      const pctGastos = Math.round((totalGastosHoy / totalVentasHoy) * 100);
      if (pctGastos > 20) alerts.push({ type: 'danger', icon: '💸', text: `Gastos representan ${pctGastos}% de ventas (${fmtMoney(totalGastosHoy)} / ${fmtMoney(totalVentasHoy)})` });
    }
    clienteActivity.filter(c => !c.visitado && c.ultimaVisitaValor > 0 && (c.diasSinComprar ?? 0) >= 14)
      .sort((a, b) => b.ultimaVisitaValor - a.ultimaVisitaValor).slice(0, 3)
      .forEach(c => alerts.push({ type: 'danger', icon: '🔴', text: `${c.nombre} (${fmtMoney(c.ultimaVisitaValor)}) — ${c.diasSinComprar}d sin comprar` }));
    return alerts;
  }, [vendedores, vendedorStats, filteredVentas, filteredGastos, clienteActivity, fmtMoney]);
  /**
   * Mapa cliente_id → distancia mínima (m) entre la venta/visita y el GPS del cliente.
   * Si la venta o visita NO tiene GPS, el cliente queda como "no auditable" (null).
   * Si el mejor registro está más lejos que VISIT_RADIUS_METERS → se considera "fuera de rango".
   */
  const outOfRangeByClient = useMemo(() => {
    const map = new Map<string, { meters: number | null; withinRange: boolean; hasAny: boolean }>();
    const updateClient = (clienteId: string | undefined | null, gpsClient: { lat: number; lng: number } | null, gpsEvent: { lat: number; lng: number } | null) => {
      if (!clienteId || !gpsClient) return;
      const prev = map.get(clienteId) ?? { meters: null, withinRange: false, hasAny: false };
      prev.hasAny = true;
      if (gpsEvent) {
        const d = haversineMeters(gpsClient, gpsEvent);
        if (prev.meters == null || d < prev.meters) prev.meters = Math.round(d);
        if (d <= VISIT_RADIUS_METERS) prev.withinRange = true;
      }
      map.set(clienteId, prev);
    };
    (visitasHoy ?? []).forEach((v: any) => {
      const gpsClient = v.clientes?.gps_lat && v.clientes?.gps_lng ? { lat: Number(v.clientes.gps_lat), lng: Number(v.clientes.gps_lng) } : null;
      const gpsEvent = v.gps_lat && v.gps_lng ? { lat: Number(v.gps_lat), lng: Number(v.gps_lng) } : null;
      updateClient(v.cliente_id, gpsClient, gpsEvent);
    });
    return map;
  }, [visitasHoy]);

  const mapMarkers = useMemo<MarkerPoint[]>(() => clienteActivity.filter((c) => c.gps_lat && c.gps_lng).map((c) => {
    const oor = outOfRangeByClient.get(c.id);
    // Solo marcamos "fuera de rango" si fue visitado, hubo eventos con GPS, ninguno cayó dentro del radio,
    // y al menos uno fue medible. Si nunca tuvo GPS, no mostramos alerta para no generar ruido.
    const measuredOutOfRange = !!(c.visitado && oor?.hasAny && oor.meters != null && !oor.withinRange);
    return {
      id: c.id, nombre: c.nombre, lat: c.gps_lat, lng: c.gps_lng,
      visitado: c.visitado, diasSinComprar: c.diasSinComprar,
      vendedorNombre: c.vendedorNombre, vendedorId: c.vendedor_id, orden: c.orden,
      outOfRange: measuredOutOfRange, outOfRangeMeters: measuredOutOfRange ? oor!.meters : null,
    };
  }), [clienteActivity, outOfRangeByClient]);


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

  // Weekly chart data — per seller breakdown
  const weeklyPerSeller = useMemo(() => {
    const sellers = vendedores ?? [];
    const result: Record<string, { nombre: string; ventas: number; numVentas: number; cobros: number; visitas: number; perDay: Record<string, { ventas: number; numVentas: number; cobros: number; visitas: number }> }> = {};
    sellers.forEach(s => {
      result[s.id] = { nombre: s.nombre, ventas: 0, numVentas: 0, cobros: 0, visitas: 0, perDay: {} };
      week.days.forEach(({ date }) => { result[s.id].perDay[date] = { ventas: 0, numVentas: 0, cobros: 0, visitas: 0 }; });
    });
    (ventasSemana ?? []).forEach((v: any) => {
      const sid = sellerIdMap.get(v.vendedor_id);
      if (sid && result[sid]) {
        result[sid].ventas += v.total ?? 0;
        result[sid].numVentas++;
        if (result[sid].perDay[v.fecha]) { result[sid].perDay[v.fecha].ventas += v.total ?? 0; result[sid].perDay[v.fecha].numVentas++; }
      }
    });
    (cobrosSemana ?? []).forEach((c: any) => {
      const s = sellers.find(i => i.user_id === c.user_id);
      if (s && result[s.id]) {
        result[s.id].cobros += c.monto ?? 0;
        if (result[s.id].perDay[c.fecha]) result[s.id].perDay[c.fecha].cobros += c.monto ?? 0;
      }
    });
    (visitasSemana ?? []).forEach((v: any) => {
      const s = sellers.find(i => i.user_id === v.user_id);
      const vDate = typeof v.fecha === 'string' ? v.fecha.slice(0, 10) : '';
      if (s && result[s.id]) {
        result[s.id].visitas++;
        if (result[s.id].perDay[vDate]) result[s.id].perDay[vDate].visitas++;
      }
    });
    return result;
  }, [vendedores, ventasSemana, cobrosSemana, visitasSemana, week.days, sellerIdMap]);

  const weeklyChartData = useMemo(() => {
    return week.days.map(({ date, label }) => {
      const isToday = date === today;
      const entry: any = { dia: label + (isToday ? ' ★' : ''), ventas: 0, numVentas: 0, cobros: 0, visitas: 0 };
      Object.values(weeklyPerSeller).forEach(s => {
        const d = s.perDay[date];
        if (d) { entry.ventas += d.ventas; entry.numVentas += d.numVentas; entry.cobros += d.cobros; entry.visitas += d.visitas; }
      });
      // Add per-seller ventas for stacked chart
      Object.entries(weeklyPerSeller).forEach(([sid, s]) => {
        entry[`v_${sid}`] = s.perDay[date]?.ventas ?? 0;
      });
      return entry;
    });
  }, [week.days, weeklyPerSeller, today]);

  const weeklyTotals = useMemo(() => ({
    ventas: weeklyChartData.reduce((s, d) => s + d.ventas, 0),
    numVentas: weeklyChartData.reduce((s, d) => s + d.numVentas, 0),
    cobros: weeklyChartData.reduce((s, d) => s + d.cobros, 0),
    visitas: weeklyChartData.reduce((s, d) => s + d.visitas, 0),
  }), [weeklyChartData]);

  const weeklyAccumData = useMemo(() => {
    let accumVentas = 0, accumCobros = 0;
    return weeklyChartData.map((d) => {
      accumVentas += d.ventas;
      accumCobros += d.cobros;
      return { ...d, accumVentas, accumCobros };
    });
  }, [weeklyChartData]);

  const weeklySellerRanking = useMemo(() =>
    Object.entries(weeklyPerSeller)
      .map(([id, s]) => ({ id, ...s, ticket: s.numVentas > 0 ? s.ventas / s.numVentas : 0 }))
      .filter(s => s.ventas > 0 || s.visitas > 0)
      .sort((a, b) => b.ventas - a.ventas),
    [weeklyPerSeller]);

  const [detailClientId, setDetailClientId] = useState<string | null>(null);

  const handleSelectClient = useCallback((id: string) => {
    setSelectedClientId(id);
    setDetailClientId(id);
  }, []);

  // Data for client detail sheet
  const clientDetail = useMemo(() => {
    if (!detailClientId) return null;
    const cliente = clienteActivity.find(c => c.id === detailClientId);
    if (!cliente) return null;
    const ventas = (ventasHoy ?? []).filter((v: any) => v.cliente_id === detailClientId);
    const cobros = (cobrosHoy ?? []).filter((c: any) => c.cliente_id === detailClientId);
    const devoluciones = (devolucionesHoy ?? []).filter((d: any) => d.cliente_id === detailClientId);
    const totalVentas = ventas.reduce((s: number, v: any) => s + (v.total ?? 0), 0);
    const totalCobros = cobros.reduce((s: number, c: any) => s + (c.monto ?? 0), 0);
    return { cliente, ventas, cobros, devoluciones, totalVentas, totalCobros };
  }, [detailClientId, clienteActivity, ventasHoy, cobrosHoy, devolucionesHoy]);

  // ═══════════════════════════════════════════════════════
  // RENDER — 3 ZONES
  // ═══════════════════════════════════════════════════════

  return (
    <div className="lg:h-[calc(100vh-theme(spacing.9))] flex flex-col lg:overflow-hidden min-h-screen">
      {/* ═══ ZONE 1 — HEADER + FILTERS ═══ */}
      <div className="bg-card border-b border-border px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-[15px] sm:text-lg font-bold text-foreground">Centro de control</h1>
          </div>
          {!isRangeMode && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />EN VIVO
            </span>
          )}
          <Badge variant="secondary" className="text-[11px]">{diaHoyLabel.charAt(0).toUpperCase() + diaHoyLabel.slice(1)}</Badge>
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto">
            <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-accent/60 rounded-lg px-2 py-1 text-[12px] text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/40 flex-1 sm:flex-initial sm:w-[120px] min-w-0" />
            <span className="text-[10px] text-muted-foreground">—</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="bg-accent/60 rounded-lg px-2 py-1 text-[12px] text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/40 flex-1 sm:flex-initial sm:w-[120px] min-w-0" />
            {isRangeMode && (
              <button onClick={() => { setDesde(today); setHasta(today); }}
                className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0">Hoy</button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 -mx-1 px-1 overflow-x-auto sm:overflow-visible scrollbar-none">
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

      {/* ═══ ZONE 2 — KPIs + comparisons + cartera + alerts ═══ */}
      <div className="bg-card border-b border-border px-3 sm:px-4 py-2 sm:py-2.5 shrink-0 space-y-2">
        {/* KPIs row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-2.5">
          <KpiCard icon={ShoppingCart} label="Ventas" value={fmtMoney(dashboardStats.totalVentas)} sub={`${dashboardStats.numVentas} ops`} />
          <KpiCard icon={Banknote} label="Cobros" value={fmtMoney(dashboardStats.totalCobros)} sub={`${dashboardStats.numCobros} cobros`} />
          <KpiCard icon={TrendingUp} label="Ticket prom." value={fmtMoney(dashboardStats.ticketPromedio)} sub="por venta" />
          <KpiCard icon={CheckCircle2} label="Visitados" value={`${dashboardStats.clientesVisitados}/${dashboardStats.clientesVisitados + dashboardStats.clientesPorVisitar}`} sub={`${dashboardStats.efectividad}% cobertura`} color="text-emerald-600" />
          <KpiCard icon={Clock} label="Pendientes" value={String(dashboardStats.clientesPorVisitar)} sub="sin visitar" color="text-destructive" />
          <KpiCard icon={Truck} label="Entregas" value={`${dashboardStats.entregasHechas}/${dashboardStats.entregasTotal}`} sub="completadas" />
          <KpiCard icon={Activity} label="Efectividad" value={`${dashboardStats.efectividad}%`} sub="del día" color={dashboardStats.efectividad >= 80 ? 'text-emerald-600' : 'text-destructive'} />
          <KpiCard icon={RotateCcw} label="Devol." value={`${devolucionesStats.totalUnidades}`} sub={`${devolucionesStats.count} registros`} color="text-destructive" />
        </div>

        {/* Row 2: Comparisons + Cartera + Alerts */}
        <div className="flex flex-wrap gap-2.5 items-stretch">
          {/* Comparisons */}
          {comparisons && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
              <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">vs</span>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">Ayer</p>
                {comparisons.diffAyer !== null ? (
                  <p className={cn("text-[11px] font-bold tabular-nums", comparisons.diffAyer >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {comparisons.diffAyer >= 0 ? '↑' : '↓'}{Math.abs(comparisons.diffAyer)}%
                  </p>
                ) : <p className="text-[10px] text-muted-foreground">—</p>}
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">Sem. pas.</p>
                {comparisons.diffSem !== null ? (
                  <p className={cn("text-[11px] font-bold tabular-nums", comparisons.diffSem >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {comparisons.diffSem >= 0 ? '↑' : '↓'}{Math.abs(comparisons.diffSem)}%
                  </p>
                ) : <p className="text-[10px] text-muted-foreground">—</p>}
              </div>
            </div>
          )}

          {/* Cartera vencida mini */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
            <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Cartera</span>
            <span className="text-[12px] font-bold tabular-nums text-foreground">{fmtMoney(carteraAging.total)}</span>
            <div className="flex gap-1.5">
              {[['1-7', 'text-emerald-600'], ['8-15', 'text-primary'], ['16-30', 'text-amber-500'], ['30+', 'text-destructive']] .map(([k, color]) => (
                <div key={k} className="text-center">
                  <p className="text-[8px] text-muted-foreground">{k}d</p>
                  <p className={cn("text-[10px] font-semibold tabular-nums", color as string)}>{fmtMoney(carteraAging[k as keyof typeof carteraAging] as number)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Smart alerts inline */}
          {smartAlerts.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 overflow-x-auto max-w-[500px]">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <div className="flex gap-2 overflow-x-auto">
                {smartAlerts.slice(0, 3).map((a, i) => (
                  <span key={i} className="text-[10px] text-foreground whitespace-nowrap">{a.icon} {a.text}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ZONE 3 — MAP + TABS ═══ */}
      <div className="lg:flex-1 flex flex-col lg:flex-row lg:overflow-hidden lg:min-h-0">
        {/* Top (mobile) / Left (desktop): Map */}
        <div className="lg:flex-[3] flex flex-col min-w-0 h-[50vh] lg:h-auto shrink-0 lg:shrink">
          <div className="relative flex-1 min-h-0">
            <GoogleMapsProvider>
              <SupervisorMap
                markers={mapMarkers}
                sellerLocations={sellerLocations}
                selectedClientId={selectedClientId}
                onSelectClient={handleSelectClient}
                recorridoUserId={recorridoUserId}
                recorridoFecha={recorridoFecha}
                multiRoutes={multiRouteEntries}
              />
            </GoogleMapsProvider>
            {/* Selector flotante: ver recorrido de un vendedor en una fecha */}
            <div className="absolute top-2 left-2 right-2 sm:right-auto z-10 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground shrink-0">Recorrido:</span>
                <select
                  value={recorridoUserId ?? ''}
                  onChange={(e) => setRecorridoUserId(e.target.value || null)}
                  className="bg-background border border-border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary flex-1 sm:flex-initial min-w-0"
                >
                  <option value="">— Seleccionar vendedor —</option>
                  {(vendedores ?? []).map((v) => (
                    <option key={v.user_id} value={v.user_id}>{v.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={recorridoFecha}
                  onChange={(e) => setRecorridoFecha(e.target.value)}
                  max={today}
                  className="bg-background border border-border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary flex-1 sm:flex-initial min-w-0"
                />
                {recorridoUserId && (
                  <button
                    onClick={() => setRecorridoUserId(null)}
                    className="text-muted-foreground hover:text-foreground px-1 shrink-0"
                    title="Quitar recorrido"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 border-t border-border bg-muted/20 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="16" viewBox="0 0 28 40"><path d="M14 38 C14 38 2 24 2 14 C2 7.4 7.4 2 14 2 C20.6 2 26 7.4 26 14 C26 24 14 38 14 38 Z" fill="#22c55e" stroke="#fff" strokeWidth="1.5"/><polyline points="9,20 13,24 20,15" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="text-[10px] text-muted-foreground">Visitado</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="16" viewBox="0 0 28 40"><path d="M14 38 C14 38 2 24 2 14 C2 7.4 7.4 2 14 2 C20.6 2 26 7.4 26 14 C26 24 14 38 14 38 Z" fill="#ef4444" stroke="#fff" strokeWidth="1.5"/><line x1="10" y1="15" x2="18" y2="23" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><line x1="18" y1="15" x2="10" y2="23" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
              <span className="text-[10px] text-muted-foreground">Pendiente</span>
            </span>
            {recorridoUserId && (
              <span className="inline-flex items-center gap-1.5 ml-auto">
                <span className="inline-block w-3 h-1 rounded" style={{ backgroundColor: '#3b82f6' }} />
                <span className="text-[10px] text-muted-foreground hidden sm:inline">Recorrido del día · A=inicio · B=fin · # paradas (≥5min)</span>
                <span className="text-[10px] text-muted-foreground sm:hidden">Recorrido · A→B</span>
              </span>
            )}
          </div>
        </div>

        {/* Bottom (mobile) / Right (desktop): Tabs */}
        <div className="lg:flex-[2] lg:border-l border-t lg:border-t-0 border-border bg-card flex flex-col min-w-0 lg:min-h-0 min-h-[60vh]">
          <Tabs defaultValue="equipo" className="flex flex-col lg:h-full">
            <TabsList className="w-full rounded-none border-b border-border bg-card h-10 shrink-0 px-1">
              <TabsTrigger value="equipo" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background px-1 sm:px-2">
                <Users className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Equipo</span>
              </TabsTrigger>
              <TabsTrigger value="clientes" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background px-1 sm:px-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Clientes</span>
                <Badge variant="secondary" className="text-[8px] ml-0.5 px-1">{clienteActivity.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="graficos" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background px-1 sm:px-2">
                <BarChart3 className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Semana</span>
              </TabsTrigger>
              <TabsTrigger value="actividad" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background px-1 sm:px-2">
                <ShoppingCart className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Actividad</span>
              </TabsTrigger>
              <TabsTrigger value="riesgo" className="flex-1 text-[11px] gap-1 data-[state=active]:bg-background px-1 sm:px-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Riesgo</span>
              </TabsTrigger>
            </TabsList>

            {/* Equipo Tab — with last visit & coverage */}
            <TabsContent value="equipo" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-2">
                  {sellerRows.map((seller) => {
                    const active = selectedVendedor === seller.id;
                    const ultimaHora = seller.ultimaVisita ? new Date(seller.ultimaVisita).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : null;
                    const cobertura = seller.clientesAsignados > 0 ? Math.round((seller.clientesVisitados / seller.clientesAsignados) * 100) : 0;
                    return (
                      <button key={seller.id} onClick={() => setSelectedVendedor(active ? null : seller.id)}
                        className={cn("w-full rounded-xl border p-3 text-left transition-all",
                          active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 bg-card")}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[12px] font-semibold text-foreground truncate">{seller.nombre}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {seller.cargaActiva && <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">EN RUTA</span>}
                            {ultimaHora && (
                              <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                                🕐 {ultimaHora}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Coverage bar */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[9px] text-muted-foreground">Cobertura {seller.clientesVisitados}/{seller.clientesAsignados}</span>
                            <span className={cn("text-[10px] font-bold", cobertura >= 80 ? "text-emerald-600" : cobertura >= 50 ? "text-primary" : "text-destructive")}>{cobertura}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all", cobertura >= 80 ? "bg-emerald-500" : cobertura >= 50 ? "bg-primary" : "bg-destructive")}
                              style={{ width: `${Math.min(cobertura, 100)}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <MiniStat label="Ventas" value={String(seller.ventas)} sub={fmtMoney(seller.totalVentas)} />
                          <MiniStat label="Cobros" value={String(seller.cobros)} sub={fmtMoney(seller.totalCobros)} />
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
                      <th className="text-right px-2 py-2 text-[10px] font-semibold text-muted-foreground">Últ. visita</th>
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
                          <p className="text-[11px] font-medium text-foreground truncate max-w-[120px]">{c.nombre}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{c.vendedorNombre}</p>
                        </td>
                        <td className="text-right px-2 py-2 text-[10px] tabular-nums text-muted-foreground">
                          {c.ultimaVisitaFecha ?? '—'}
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
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-xs">Sin clientes en ruta</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="graficos" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-4">
                  {/* Weekly summary */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
                      <p className="text-sm font-bold tabular-nums text-foreground">{fmtMoney(weeklyTotals.ventas)}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Ventas sem.</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
                      <p className="text-sm font-bold tabular-nums text-foreground">{weeklyTotals.numVentas}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Operaciones</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
                      <p className="text-sm font-bold tabular-nums text-foreground">{fmtMoney(weeklyTotals.cobros)}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Cobros sem.</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
                      <p className="text-sm font-bold tabular-nums text-foreground">{weeklyTotals.visitas}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Visitas sem.</p>
                    </div>
                  </div>

                  {/* Ranking por vendedor */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> Ranking semanal por vendedor
                    </h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">#</th>
                          <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">Vendedor</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">Ventas $</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">Ops</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">Ticket</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">Cobros</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-semibold text-muted-foreground">Visitas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklySellerRanking.map((s, i) => (
                          <tr key={s.id} className={cn("border-b border-border/30 hover:bg-accent/30 transition-colors",
                            selectedVendedor === s.id && "bg-primary/5")}
                            onClick={() => setSelectedVendedor(selectedVendedor === s.id ? null : s.id)}
                            style={{ cursor: 'pointer' }}>
                            <td className="px-2 py-1.5">
                              <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold",
                                i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground")}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-[11px] font-medium text-foreground truncate max-w-[100px]">{s.nombre}</td>
                            <td className="text-right px-2 py-1.5 text-[11px] font-semibold tabular-nums text-foreground">{fmtMoney(s.ventas)}</td>
                            <td className="text-right px-2 py-1.5 text-[10px] tabular-nums text-muted-foreground">{s.numVentas}</td>
                            <td className="text-right px-2 py-1.5 text-[10px] tabular-nums text-muted-foreground">{fmtMoney(s.ticket)}</td>
                            <td className="text-right px-2 py-1.5 text-[10px] tabular-nums text-foreground">{fmtMoney(s.cobros)}</td>
                            <td className="text-right px-2 py-1.5 text-[10px] tabular-nums text-muted-foreground">{s.visitas}</td>
                          </tr>
                        ))}
                        {weeklySellerRanking.length === 0 && (
                          <tr><td colSpan={7} className="text-center py-4 text-muted-foreground text-[11px]">Sin datos esta semana</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Ventas diarias por vendedor (stacked) */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ventas diarias por vendedor</h3>
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyChartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${cs}${(v / 1000).toFixed(0)}k`} width={40} />
                          <Tooltip formatter={(v: number, name: string) => {
                            const sellerId = name.replace('v_', '');
                            const sellerName = sellerNameMap.get(sellerId) ?? name;
                            return [`${cs}${v.toLocaleString('es-MX')}`, sellerName];
                          }} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          {weeklySellerRanking.map((s, i) => (
                            <Bar key={s.id} dataKey={`v_${s.id}`} stackId="ventas" fill={ROUTE_COLORS[i % ROUTE_COLORS.length]} radius={i === weeklySellerRanking.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                          ))}
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} formatter={(value) => {
                            const sellerId = value.replace('v_', '');
                            return sellerNameMap.get(sellerId) ?? value;
                          }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Acumulado semanal line chart */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acumulado semanal</h3>
                    <div className="h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weeklyAccumData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${cs}${(v / 1000).toFixed(0)}k`} width={40} />
                          <Tooltip formatter={(v: number, name: string) => [`${cs}${v.toLocaleString('es-MX')}`, name === 'accumVentas' ? 'Ventas' : 'Cobros']} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Line type="monotone" dataKey="accumVentas" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Ventas" />
                          <Line type="monotone" dataKey="accumCobros" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Cobros" />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Visitas por día */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visitas vs Ventas por día</h3>
                    <div className="h-[120px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyChartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 9 }} width={25} />
                          <Tooltip labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Bar dataKey="visitas" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Visitas" />
                          <Bar dataKey="numVentas" fill="#22c55e" radius={[4, 4, 0, 0]} name="Con venta" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Actividad Tab */}
            <TabsContent value="actividad" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
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
                  {/* Smart Alerts */}
                  {smartAlerts.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" /> Alertas inteligentes
                      </h3>
                      <div className="space-y-1">
                        {smartAlerts.map((a, i) => (
                          <div key={i} className={cn("flex items-center gap-2 rounded-lg border p-2",
                            a.type === 'danger' ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5")}>
                            <span className="text-sm shrink-0">{a.icon}</span>
                            <p className="text-[11px] text-foreground">{a.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Productos */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-primary" /> Top productos del día
                    </h3>
                    {topProductosHoy.length === 0 ? <EmptyBlock text="Sin productos vendidos." /> : (
                      <div className="space-y-1">
                        {topProductosHoy.slice(0, 8).map((p, i) => (
                          <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
                            <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold shrink-0",
                              i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground")}>
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-foreground truncate">{p.nombre}</p>
                              <p className="text-[9px] text-muted-foreground">{p.codigo} · {p.qty} uds</p>
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-foreground shrink-0">{fmtMoney(p.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cartera detalle */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5 text-destructive" /> Cartera vencida
                    </h3>
                    <div className="grid grid-cols-4 gap-1.5 mb-2">
                      {[{ label: '1-7 días', k: '1-7', color: 'text-emerald-600' }, { label: '8-15 días', k: '8-15', color: 'text-primary' }, { label: '16-30 días', k: '16-30', color: 'text-amber-500' }, { label: '+30 días', k: '30+', color: 'text-destructive' }].map(({ label, k, color }) => (
                        <div key={k} className="rounded-lg bg-muted/40 px-2 py-2 text-center">
                          <p className={cn("text-[11px] font-bold tabular-nums", color)}>{fmtMoney(carteraAging[k as keyof typeof carteraAging] as number)}</p>
                          <p className="text-[8px] text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ingreso en riesgo */}
                  {clienteActivity.filter(c => !c.visitado).length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" /> Clientes sin visitar
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
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Client Detail Sheet */}
      <Sheet open={!!detailClientId} onOpenChange={(open) => { if (!open) setDetailClientId(null); }}>
        <SheetContent side="right" className="w-full sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col">
          {clientDetail && (
            <>
              <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold",
                    clientDetail.cliente.visitado ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive")}>
                    {clientDetail.cliente.visitado ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-[15px] truncate">{clientDetail.cliente.nombre}</SheetTitle>
                    <p className="text-[11px] text-muted-foreground">{clientDetail.cliente.vendedorNombre}</p>
                  </div>
                </div>
              </SheetHeader>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                      <ShoppingCart className="h-4 w-4 mx-auto mb-1 text-primary" />
                      <p className="text-[14px] font-bold tabular-nums text-foreground">{fmtMoney(clientDetail.totalVentas)}</p>
                      <p className="text-[9px] text-muted-foreground">{clientDetail.ventas.length} ventas</p>
                    </div>
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
                      <Banknote className="h-4 w-4 mx-auto mb-1 text-emerald-600" />
                      <p className="text-[14px] font-bold tabular-nums text-foreground">{fmtMoney(clientDetail.totalCobros)}</p>
                      <p className="text-[9px] text-muted-foreground">{clientDetail.cobros.length} cobros</p>
                    </div>
                    <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-center">
                      <RotateCcw className="h-4 w-4 mx-auto mb-1 text-destructive" />
                      <p className="text-[14px] font-bold tabular-nums text-foreground">{clientDetail.devoluciones.length}</p>
                      <p className="text-[9px] text-muted-foreground">devoluciones</p>
                    </div>
                  </div>

                  {/* Info row */}
                  {clientDetail.cliente.diasSinComprar !== null && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Última compra hace</span>
                      <span className={cn("text-[12px] font-bold tabular-nums",
                        clientDetail.cliente.diasSinComprar > 14 ? "text-destructive" : clientDetail.cliente.diasSinComprar > 7 ? "text-primary" : "text-foreground")}>
                        {clientDetail.cliente.diasSinComprar} días
                      </span>
                    </div>
                  )}

                  {/* Ventas detail */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5 text-primary" /> Ventas del día
                    </h3>
                    {clientDetail.ventas.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2">Sin ventas registradas</p>
                    ) : (
                      <div className="space-y-2">
                        {clientDetail.ventas.map((v: any) => (
                          <div key={v.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[9px]">{v.tipo === 'pedido' ? 'Pedido' : 'Directa'}</Badge>
                                <span className="text-[9px] text-muted-foreground">{v.condicion_pago === 'credito' ? 'Crédito' : 'Contado'}</span>
                              </div>
                              <span className="text-[13px] font-bold tabular-nums text-foreground">{fmtMoney(v.total ?? 0)}</span>
                            </div>
                            {(v.venta_lineas ?? []).length > 0 && (
                              <div className="space-y-0.5">
                                {(v.venta_lineas ?? []).map((l: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between text-[10px]">
                                    <span className="text-foreground truncate max-w-[200px]">
                                      {l.productos?.nombre ?? 'Producto'} <span className="text-muted-foreground">×{l.cantidad}</span>
                                    </span>
                                    <span className="tabular-nums text-muted-foreground shrink-0">{fmtMoney(l.total ?? 0)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cobros detail */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Cobros del día
                    </h3>
                    {clientDetail.cobros.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2">Sin cobros registrados</p>
                    ) : (
                      <div className="space-y-1.5">
                        {clientDetail.cobros.map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5">
                            <div>
                              <p className="text-[11px] font-medium text-foreground">{c.metodo_pago ?? 'Efectivo'}</p>
                              <p className="text-[9px] text-muted-foreground">{new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            <span className="text-[13px] font-bold tabular-nums text-emerald-600">{fmtMoney(c.monto ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Devoluciones detail */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-destructive" /> Devoluciones del día
                    </h3>
                    {clientDetail.devoluciones.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2">Sin devoluciones</p>
                    ) : (
                      <div className="space-y-1.5">
                        {clientDetail.devoluciones.map((d: any) => {
                          const lineas = d.devolucion_lineas ?? [];
                          return (
                            <div key={d.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                              {lineas.map((l: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                  <span className="text-foreground truncate max-w-[200px]">
                                    {l.productos?.nombre ?? 'Producto'} <span className="text-muted-foreground">×{l.cantidad}</span>
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="outline" className="text-[8px] px-1">{l.motivo ?? '—'}</Badge>
                                    {l.monto_credito > 0 && <span className="text-[10px] tabular-nums text-destructive">{fmtMoney(l.monto_credito)}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-2.5 sm:p-3 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">{label}</span>
      </div>
      <p className={cn("text-[15px] sm:text-lg font-bold tabular-nums leading-tight truncate", color ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
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

function SupervisorMap({ markers, sellerLocations = [], selectedClientId, onSelectClient, recorridoUserId, recorridoFecha, multiRoutes = [] }: {
  markers: MarkerPoint[];
  sellerLocations?: SellerLocation[];
  selectedClientId?: string | null;
  onSelectClient?: (id: string) => void;
  recorridoUserId?: string | null;
  recorridoFecha?: string;
  multiRoutes?: RouteResultEntry[];
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

  const makePinIcon = useCallback((orden: number | null, visitado: boolean, outOfRange: boolean) => {
    const w = 28, h = 40;
    const color = visitado ? '#22c55e' : '#ef4444';
    const icon = visitado
      ? `<polyline points="9,20 13,24 20,15" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<line x1="10" y1="15" x2="18" y2="23" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="18" y1="15" x2="10" y2="23" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
    const label = orden != null ? `<text x="14" y="14" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="9" font-weight="bold" font-family="Arial,sans-serif">${orden}</text>` : '';
    // Warning badge overlay (top-right) when visited far away
    const warning = outOfRange
      ? `<g transform="translate(18,-2)"><circle cx="6" cy="6" r="6" fill="#f59e0b" stroke="#fff" stroke-width="1.2"/><text x="6" y="8.5" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="Arial,sans-serif">!</text></g>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <path d="M14 ${h - 2} C14 ${h - 2} 2 24 2 14 C2 7.4 7.4 2 14 2 C20.6 2 26 7.4 26 14 C26 24 14 ${h - 2} 14 ${h - 2} Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      ${orden != null ? label : icon}
      ${orden != null ? icon.replace(/stroke-width="2.5"/g, 'stroke-width="0"') : ''}
    </svg>`;
    // If we have orden, show the number on top and a small check/x at bottom
    const svgFinal = orden != null
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
          <path d="M14 ${h - 2} C14 ${h - 2} 2 24 2 14 C2 7.4 7.4 2 14 2 C20.6 2 26 7.4 26 14 C26 24 14 ${h - 2} 14 ${h - 2} Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
          <text x="14" y="16" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="11" font-weight="bold" font-family="Arial,sans-serif">${orden}</text>
          ${warning}
        </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
          <path d="M14 ${h - 2} C14 ${h - 2} 2 24 2 14 C2 7.4 7.4 2 14 2 C20.6 2 26 7.4 26 14 C26 24 14 ${h - 2} 14 ${h - 2} Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
          ${icon}
          ${warning}
        </svg>`;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgFinal),
      scaledSize: new google.maps.Size(w, h),
      anchor: new google.maps.Point(w / 2, h),
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

  useEffect(() => {
    if (!selectedClientId || !mapRef.current) return;
    const marker = markers.find(m => m.id === selectedClientId);
    if (marker) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
      mapRef.current.setZoom(16);
      setSelected(marker);
    }
  }, [selectedClientId, markers]);

  useEffect(() => { fitBounds(); }, [fitBounds]);

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
          icon={makePinIcon(m.orden, m.visitado, m.outOfRange)}
          title={m.outOfRange ? `${m.nombre} — ⚠️ Visitado a ${m.outOfRangeMeters ?? '?'} m del cliente` : m.nombre}
        />
      ))}
      {/* Multi-route overlay (polilíneas guardadas + paradas numeradas por color de vendedor) */}
      {multiRoutes.length > 0 && (
        <MultiRouteOverlay
          results={multiRoutes}
          clientesById={new Map(markers.map(m => [m.id, { id: m.id, nombre: m.nombre, gps_lat: m.lat, gps_lng: m.lng }]))}
          visibility={Object.fromEntries(multiRoutes.map(r => [r.vendedor_id, true]))}
        />
      )}
      {sellerLocations.map((s) => (
        <Marker key={`seller-${s.id}`} position={{ lat: s.lat, lng: s.lng }}
          onClick={() => { setSelectedSellerLoc(s); setSelected(null); }}
          icon={makeSellerIcon(s.nombre)} zIndex={1000} />
      ))}
      {/* Vendedores en vivo (transmiten desde la app móvil) */}
      <LiveVendedoresLayer enabled />
      {/* Recorrido histórico del vendedor seleccionado (fecha) */}
      {recorridoUserId && recorridoFecha && (
        <VendedorRecorridoLayer userId={recorridoUserId} fecha={recorridoFecha} />
      )}
      {selected && (
        <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
          <div className="space-y-1 p-1 text-xs">
            {selected.orden != null && <p className="font-bold text-sm">#{selected.orden}</p>}
            <p className="font-semibold">{selected.nombre}</p>
            <p style={{ color: '#6b7280' }}>{selected.vendedorNombre}</p>
            <p>{selected.visitado ? '✅ Visitado' : '⏳ Pendiente'}</p>
            {selected.outOfRange && (
              <p style={{ color: '#b45309', fontWeight: 600 }}>
                ⚠️ Venta registrada a {selected.outOfRangeMeters ?? '?'} m del cliente (fuera del rango de {VISIT_RADIUS_METERS} m)
              </p>
            )}
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
