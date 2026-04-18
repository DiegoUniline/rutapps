import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { GoogleMap, Marker, InfoWindow, Polyline, MarkerClusterer } from '@react-google-maps/api';
import { useClientes, useZonas, useVendedores } from '@/hooks/useClientes';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, Filter, MapPin, X, Users, Loader2, CheckCircle2, Navigation,
  Route, Info, Clock, TrendingUp, MapPinOff, Eye, EyeOff, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import MapRecenterButton from '@/components/MapRecenterButton';
import MyLocationMarker from '@/components/MyLocationMarker';
import LiveVendedoresLayer from '@/components/LiveVendedoresLayer';
import { toast } from 'sonner';
import { useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import OriginPicker, { type OriginValue } from '@/components/maps/OriginPicker';
import MultiRoutePanel, { MultiRouteOverlay, getRouteColor, type RouteResultEntry } from '@/components/maps/MultiRoutePanel';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIA_HOY = (() => {
  const d = new Date().toLocaleDateString('es-MX', { weekday: 'long' });
  return d.charAt(0).toUpperCase() + d.slice(1);
})();

// Color palette for each day
const DIA_COLORS: Record<string, string> = {
  Lunes: '#6366f1',      // indigo
  Martes: '#f59e0b',     // amber
  Miércoles: '#10b981',  // emerald
  Jueves: '#ef4444',     // red
  Viernes: '#8b5cf6',    // violet
  Sábado: '#06b6d4',     // cyan
  Domingo: '#f97316',    // orange
};

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 23.6345, lng: -102.5528 };

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// KPI Card component
function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-sm
      px-2 py-1.5 md:px-4 md:py-3 min-w-0 md:min-w-[140px]">
      {/* Mobile: compact horizontal */}
      <div className="flex md:hidden items-center gap-1.5">
        <div className={cn("w-5 h-5 rounded-md flex items-center justify-center shrink-0", color)}>
          <Icon className="h-2.5 w-2.5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground leading-tight">{label}</div>
          <div className="text-xs font-bold text-foreground leading-tight">{value}</div>
        </div>
      </div>
      {/* Desktop: vertical with subtitle */}
      <div className="hidden md:block">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
        </div>
        <div className="text-xl font-bold text-foreground leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function MapaClientesPage() {
  const { user, empresa } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [diaFilter, setDiaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [originPoint, setOriginPoint] = useState<OriginValue | null>(null);
  const [settingOrigin, setSettingOrigin] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    orderedIds: string[];
    polyline: string | null;
    distance_meters: number;
    duration: string;
  } | null>(null);
  const [showRoutePanel, setShowRoutePanel] = useState(true);
  const [colorMode, setColorMode] = useState<'dia' | 'status' | 'visitado'>('visitado');
  // Multi-route state
  const [optimMode, setOptimMode] = useState<'common' | 'individual'>('common');
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [multiResults, setMultiResults] = useState<RouteResultEntry[] | null>(null);
  const [routeVisibility, setRouteVisibility] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role_id, roles(nombre, es_sistema)')
        .eq('user_id', user!.id);
      if (!data || data.length === 0) return true;
      return data.some((ur: any) => {
        const roleName = ur.roles?.nombre?.toLowerCase?.() ?? '';
        return ur.roles?.es_sistema === true || roleName.includes('admin');
      });
    },
    enabled: !!user?.id,
  });

  // Today's ventas to determine "visited" clients
  const { data: ventasHoy } = useQuery({
    queryKey: ['ventas-hoy', empresa?.id],
    enabled: !!empresa?.id,
    refetchInterval: 15000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('ventas')
        .select('cliente_id')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .neq('status', 'cancelado')
        .not('cliente_id', 'is', null);
      return new Set((data ?? []).map((v: any) => v.cliente_id));
    },
  });

  const { data: clientes, isLoading } = useClientes(search, statusFilter || undefined);
  const { data: zonas } = useZonas();
  const { data: vendedores } = useVendedores();

  // Load saved route order for current day/vendedor combination
  const { data: savedOrder, refetch: refetchSavedOrder } = useQuery({
    queryKey: ['cliente-orden-ruta', empresa?.id, diaFilter, vendedorFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('cliente_orden_ruta' as any)
        .select('cliente_id, orden, vendedor_id')
        .eq('empresa_id', empresa!.id)
        .order('vendedor_id', { ascending: true, nullsFirst: false })
        .order('orden', { ascending: true });
      q = diaFilter ? q.eq('dia', diaFilter) : q.is('dia', null);
      // If a vendedor filter is set, restrict; otherwise return ALL groups so multi-route persists
      if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);
      const { data } = await q;
      return ((data ?? []) as unknown) as { cliente_id: string; orden: number; vendedor_id: string | null }[];
    },
  });

  // Restore saved route automatically when filters change
  useEffect(() => {
    if (!savedOrder || savedOrder.length === 0) {
      setRouteResult(null);
      setMultiResults(null);
      return;
    }
    // Group by vendedor_id
    const groups = new Map<string, { cliente_id: string; orden: number }[]>();
    for (const row of savedOrder) {
      const key = row.vendedor_id ?? '__sin_vendedor__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    // If real vendor groups exist alongside an inconsistent "__sin_vendedor__" residual group, drop the residual
    if (groups.size > 1 && groups.has('__sin_vendedor__')) {
      groups.delete('__sin_vendedor__');
    }
    // If only one group AND a vendedor filter is active (or no groups have a vendor), use single-route view
    const groupKeys = Array.from(groups.keys());
    if (groupKeys.length <= 1) {
      setMultiResults(null);
      setRouteResult({
        orderedIds: savedOrder.map(o => o.cliente_id),
        polyline: null,
        distance_meters: 0,
        duration: '',
      });
      return;
    }
    // Multiple vendor groups → reconstruct multi-route view (no polyline, will be re-optimized if user clicks)
    setRouteResult(null);
    const entries: RouteResultEntry[] = groupKeys.map(vid => {
      const rows = groups.get(vid)!.sort((a, b) => a.orden - b.orden);
      const vendedor = vendedores?.find((v: any) => v.id === vid);
      return {
        vendedor_id: vid,
        vendedor_nombre: vendedor?.nombre ?? (vid === '__sin_vendedor__' ? 'Sin vendedor' : 'Vendedor'),
        origin: { lat: 0, lng: 0, label: 'Guardado' },
        optimized_order: rows.map(r => r.cliente_id),
        polyline: null,
        distance_meters: 0,
        duration: '0s',
        original_distance_meters: 0,
      };
    });
    setMultiResults(entries);
    const vis: Record<string, boolean> = {};
    entries.forEach(e => { vis[e.vendedor_id] = true; });
    setRouteVisibility(vis);
    setApplied(true);
  }, [savedOrder, vendedores]);

  const filtered = useMemo(() => {
    let result = clientes ?? [];
    if (zonaFilter) result = result.filter((c: any) => c.zona_id === zonaFilter);
    if (vendedorFilter) result = result.filter((c: any) => c.vendedor_id === vendedorFilter);
    if (diaFilter) result = result.filter((c: any) => c.dia_visita?.includes(diaFilter));
    return result;
  }, [clientes, zonaFilter, vendedorFilter, diaFilter]);

  const withGps = useMemo(() => filtered.filter((c: any) => c.gps_lat && c.gps_lng), [filtered]);
  const withoutGps = useMemo(() => filtered.filter((c: any) => !c.gps_lat || !c.gps_lng), [filtered]);

  const todayClients = useMemo(() => filtered.filter((c: any) => c.dia_visita?.includes(DIA_HOY)), [filtered]);
  const visitedCount = useMemo(() => {
    if (!ventasHoy) return 0;
    return todayClients.filter((c: any) => ventasHoy.has(c.id)).length;
  }, [todayClients, ventasHoy]);

  const activeFiltersCount = [zonaFilter, vendedorFilter, diaFilter, statusFilter].filter(Boolean).length;

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  useEffect(() => {
    if (mapRef.current && withGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      withGps.forEach((c: any) => bounds.extend({ lat: c.gps_lat, lng: c.gps_lng }));
      if (originPoint) bounds.extend(originPoint);
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [withGps, originPoint]);

  const handleRecenter = useCallback(() => {
    if (mapRef.current && withGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      withGps.forEach((c: any) => bounds.extend({ lat: c.gps_lat, lng: c.gps_lng }));
      if (originPoint) bounds.extend(originPoint);
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [withGps, originPoint]);

  const polylinePoints = useMemo(() => {
    if (!routeResult?.polyline) return null;
    return decodePolyline(routeResult.polyline);
  }, [routeResult]);

  const orderedClients = useMemo(() => {
    if (!routeResult) return null;
    return routeResult.orderedIds.map(id => withGps.find((c: any) => c.id === id)).filter(Boolean);
  }, [routeResult, withGps]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (settingOrigin && e.latLng) {
      setOriginPoint({ lat: e.latLng.lat(), lng: e.latLng.lng(), label: 'Punto en mapa' });
      setSettingOrigin(false);
      setRouteResult(null);
      setMultiResults(null);
      toast.success('Punto de partida establecido');
    }
  }, [settingOrigin]);

  // Group clients by vendedor for multi-route mode
  const clientsByVendedor = useMemo(() => {
    const map = new Map<string, { vendedor_id: string; vendedor_nombre: string; clientes: any[] }>();
    for (const c of withGps) {
      const vid = c.vendedor_id || '__sin_vendedor__';
      const vname = c.vendedores?.nombre || 'Sin vendedor';
      if (!map.has(vid)) map.set(vid, { vendedor_id: vid, vendedor_nombre: vname, clientes: [] });
      map.get(vid)!.clientes.push(c);
    }
    return Array.from(map.values()).filter(g => g.clientes.length > 0);
  }, [withGps]);

  const clientesById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of withGps) m.set(c.id, c);
    return m;
  }, [withGps]);

  const isMultiVendor = clientsByVendedor.length > 1 && !vendedorFilter;

  /**
   * Resolve the origin for a vendedor in INDIVIDUAL mode.
   * Strategy: vendor's profiles.almacen_id with gps → fallback to first almacen with gps → fallback to common origin.
   */
  const resolveIndividualOrigin = async (vendedor_id: string): Promise<OriginValue | null> => {
    if (vendedor_id === '__sin_vendedor__') return originPoint;
    const { data: prof } = await (supabase
      .from('profiles') as any)
      .select('almacen_id, almacenes:almacen_id (id, nombre, gps_lat, gps_lng)')
      .eq('id', vendedor_id)
      .maybeSingle();
    const a = prof?.almacenes;
    if (a?.gps_lat != null && a?.gps_lng != null) {
      return { lat: Number(a.gps_lat), lng: Number(a.gps_lng), label: a.nombre };
    }
    return originPoint;
  };

  const handleOptimize = async () => {
    if (!originPoint) { toast.error('Primero establece un punto de partida'); return; }
    if (withGps.length < 1) { toast.error('Se necesita al menos 1 cliente con GPS'); return; }
    setOptimizing(true);
    setRouteResult(null);
    setMultiResults(null);
    setApplied(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error('Sesión no válida'); return; }

      // Build payload: one route per vendedor (or single 'default' route)
      const groups = isMultiVendor ? clientsByVendedor : [{
        vendedor_id: vendedorFilter || 'default',
        vendedor_nombre: vendedorFilter
          ? (vendedores?.find(v => v.id === vendedorFilter)?.nombre ?? 'Vendedor')
          : 'Todos',
        clientes: withGps,
      }];

      const routes = await Promise.all(groups.map(async (g) => {
        const origin = optimMode === 'individual' && isMultiVendor
          ? (await resolveIndividualOrigin(g.vendedor_id)) ?? originPoint
          : originPoint;
        return {
          key: g.vendedor_id,
          origin: { lat: origin.lat, lng: origin.lng },
          waypoints: g.clientes.map((c: any) => ({ id: c.id, lat: c.gps_lat, lng: c.gps_lng })),
          _origin_full: origin,
          _vendedor_nombre: g.vendedor_nombre,
        };
      }));

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/optimize-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          routes: routes.map(r => ({ key: r.key, origin: r.origin, waypoints: r.waypoints })),
          dia_filtro: diaFilter || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Error al optimizar'); return; }

      const entries: RouteResultEntry[] = (result.routes ?? []).map((r: any) => {
        const meta = routes.find(x => x.key === r.key)!;
        return {
          vendedor_id: r.key,
          vendedor_nombre: meta._vendedor_nombre,
          origin: meta._origin_full,
          optimized_order: r.optimized_order ?? [],
          polyline: r.polyline ?? null,
          distance_meters: r.distance_meters ?? 0,
          duration: r.duration ?? '0s',
          original_distance_meters: r.original_distance_meters ?? 0,
          error: r.error,
        };
      });

      // Multi-route view when more than one vendor
      if (entries.length > 1) {
        setMultiResults(entries);
        const vis: Record<string, boolean> = {};
        entries.forEach(e => { vis[e.vendedor_id] = true; });
        setRouteVisibility(vis);
        toast.success(`${entries.length} rutas optimizadas`);
      } else {
        const e = entries[0];
        if (e?.error) { toast.error(e.error); return; }
        setRouteResult({
          orderedIds: e.optimized_order,
          polyline: e.polyline,
          distance_meters: e.distance_meters,
          duration: e.duration,
        });
        setShowRoutePanel(true);
        toast.success(`Ruta optimizada: ${(e.distance_meters / 1000).toFixed(1)} km`);
        // Persist immediately for single-route flow (matches previous behaviour)
        await persistOrder([{ vendedor_id: vendedorFilter || null, ordered: e.optimized_order }]);
        await refetchSavedOrder();
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al optimizar ruta');
    } finally {
      setOptimizing(false);
    }
  };

  /** Persist the optimized order(s) into cliente_orden_ruta */
  const persistOrder = async (groups: { vendedor_id: string | null; ordered: string[] }[]) => {
    for (const g of groups) {
      let delQ = (supabase.from('cliente_orden_ruta' as any) as any)
        .delete().eq('empresa_id', empresa!.id);
      delQ = diaFilter ? delQ.eq('dia', diaFilter) : delQ.is('dia', null);
      delQ = g.vendedor_id ? delQ.eq('vendedor_id', g.vendedor_id) : delQ.is('vendedor_id', null);
      await delQ;
      const rows = g.ordered.map((id, idx) => ({
        empresa_id: empresa!.id,
        cliente_id: id,
        dia: diaFilter || null,
        vendedor_id: g.vendedor_id,
        orden: idx + 1,
      }));
      if (rows.length > 0) {
        await (supabase.from('cliente_orden_ruta' as any) as any).insert(rows);
      }
    }
  };

  const handleApplyMulti = async () => {
    if (!multiResults) return;
    setApplying(true);
    try {
      // Wipe full scope (empresa + dia) so old rows with vendedor_id=null or stale vendor groups don't survive
      let wipeQ = (supabase.from('cliente_orden_ruta' as any) as any)
        .delete().eq('empresa_id', empresa!.id);
      wipeQ = diaFilter ? wipeQ.eq('dia', diaFilter) : wipeQ.is('dia', null);
      await wipeQ;

      const groups = multiResults
        .filter(r => !r.error && r.optimized_order.length > 0)
        .map(r => ({
          vendedor_id: r.vendedor_id === '__sin_vendedor__' ? null : r.vendedor_id,
          ordered: r.optimized_order,
        }));
      // Insert all rows in one go (persistOrder also deletes per-vendedor, but scope is already empty)
      const allRows = groups.flatMap(g =>
        g.ordered.map((id, idx) => ({
          empresa_id: empresa!.id,
          cliente_id: id,
          dia: diaFilter || null,
          vendedor_id: g.vendedor_id,
          orden: idx + 1,
        }))
      );
      if (allRows.length > 0) {
        await (supabase.from('cliente_orden_ruta' as any) as any).insert(allRows);
      }
      await refetchSavedOrder();
      setApplied(true);
      toast.success(`Orden guardado para ${groups.length} ${groups.length === 1 ? 'ruta' : 'rutas'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Error al aplicar cambios');
    } finally {
      setApplying(false);
    }
  };

  const formatDuration = (d?: string) => {
    if (!d) return '';
    const secs = parseInt(d.replace('s', ''));
    if (isNaN(secs)) return d;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  const getMarkerColor = (cliente: any): string => {
    if (colorMode === 'visitado') {
      const visited = ventasHoy?.has(cliente.id);
      return visited ? '#22c55e' : '#ef4444';
    }
    if (colorMode === 'dia') {
      const dias: string[] = cliente.dia_visita ?? [];
      if (diaFilter && dias.includes(diaFilter)) return DIA_COLORS[diaFilter] ?? '#6366f1';
      const todayMatch = dias.includes(DIA_HOY);
      if (todayMatch) return DIA_COLORS[DIA_HOY] ?? '#6366f1';
      if (dias.length > 0) return DIA_COLORS[dias[0]] ?? '#6366f1';
      return '#9ca3af';
    }
    // status
    const s = cliente.status ?? 'activo';
    if (s === 'activo') return '#22c55e';
    if (s === 'suspendido') return '#ef4444';
    return '#9ca3af';
  };

  const getMarkerIcon = (cliente: any) => {
    const color = getMarkerColor(cliente);
    const visited = ventasHoy?.has(cliente.id);
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: visited && colorMode === 'visitado' ? 1 : 0.85,
      strokeColor: '#fff',
      strokeWeight: visited && colorMode === 'visitado' ? 3 : 2,
      scale: visited && colorMode === 'visitado' ? 12 : 9,
    };
  };

  const createNumberedLabel = (): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: 'hsl(230, 55%, 52%)',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 16,
    labelOrigin: new google.maps.Point(0, 0),
  });

  // Cluster styles
  const clusterStyles = [
    { textColor: 'white', textSize: 12, width: 40, height: 40, url: '' },
    { textColor: 'white', textSize: 13, width: 48, height: 48, url: '' },
    { textColor: 'white', textSize: 14, width: 56, height: 56, url: '' },
  ];

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Compact header */}
      <div className="bg-card border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <MapPin className="h-4.5 w-4.5 text-primary" />
            <h1 className="text-base font-bold text-foreground">Mapa de clientes</h1>
          </div>

          <div className="flex-1 max-w-[200px] relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input type="text" placeholder="Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Always-visible quick filters: Día + Vendedor (key for route optimization) */}
          <div className="min-w-[150px]">
            <SearchableSelect
              options={[{ value: '', label: '📅 Todos los días' }, ...DIAS.map(d => ({ value: d, label: d === DIA_HOY ? `${d} (hoy)` : d }))]}
              value={diaFilter}
              onChange={val => { setDiaFilter(val); setRouteResult(null); }}
              placeholder="Día visita..."
            />
          </div>
          <div className="min-w-[160px]">
            <SearchableSelect
              options={[{ value: '', label: '👤 Todos vendedores' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
              value={vendedorFilter}
              onChange={val => { setVendedorFilter(val); setRouteResult(null); }}
              placeholder="Vendedor..."
            />
          </div>

          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              showFilters || zonaFilter || statusFilter ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground")}>
            <Filter className="h-3.5 w-3.5" />Más
            {(zonaFilter || statusFilter) && <Badge className="ml-0.5 h-4 w-4 p-0 flex items-center justify-center text-[9px]">{[zonaFilter, statusFilter].filter(Boolean).length}</Badge>}
          </button>

          {/* Color mode toggle */}
          <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden text-[10px] font-medium">
            {(['dia', 'visitado', 'status'] as const).map(mode => (
              <button key={mode} onClick={() => setColorMode(mode)}
                className={cn("px-2.5 py-1.5 transition-colors capitalize",
                  colorMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {mode === 'dia' ? 'Día' : mode === 'visitado' ? 'Visita' : 'Status'}
              </button>
            ))}
          </div>

          {/* Route controls */}
          <div className="flex items-center gap-1 ml-auto relative">
            {isMultiVendor && (
              <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden text-[10px] font-medium">
                {(['common', 'individual'] as const).map(m => (
                  <button key={m} onClick={() => setOptimMode(m)}
                    className={cn("px-2 py-1.5 transition-colors",
                      optimMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    title={m === 'common' ? 'Todos parten del mismo punto' : 'Cada vendedor parte de su almacén'}>
                    {m === 'common' ? 'Origen común' : 'Individual'}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowOriginPicker(s => !s)}
              className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                originPoint ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-background border-border text-muted-foreground")}>
              <Navigation className="h-3.5 w-3.5" />
              {originPoint ? `✓ ${originPoint.label ?? 'Origen'}` : 'Origen'}
            </button>
            {showOriginPicker && (
              <div className="absolute top-full right-0 mt-2 z-20 w-72 bg-card border border-border rounded-xl shadow-lg p-3">
                <OriginPicker
                  value={originPoint}
                  onChange={(v) => { setOriginPoint(v); setRouteResult(null); setMultiResults(null); if (v) setShowOriginPicker(false); }}
                  onPickFromMapRequest={() => { setSettingOrigin(true); setShowOriginPicker(false); toast.info('Click en el mapa'); }}
                  pickingFromMap={settingOrigin}
                />
              </div>
            )}
            {isAdmin && originPoint && withGps.length >= 1 && (
              <button onClick={handleOptimize} disabled={optimizing}
                className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  (routeResult || multiResults) ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                    : "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
                  optimizing && "opacity-70")}>
                {optimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (routeResult || multiResults) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Route className="h-3.5 w-3.5" />}
                {optimizing ? 'Optimizando...' : multiResults ? `${multiResults.length} rutas` : routeResult ? 'Optimizada' : isMultiVendor ? 'Optimizar todas' : 'Optimizar'}
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border">
            <div className="min-w-[130px]">
              <SearchableSelect
                options={[{ value: '', label: 'Todas las zonas' }, ...(zonas ?? []).map(z => ({ value: z.id, label: z.nombre }))]}
                value={zonaFilter}
                onChange={setZonaFilter}
                placeholder="Zona..."
              />
            </div>
            <div className="min-w-[110px]">
              <SearchableSelect
                options={[{ value: '', label: 'Todo status' }, { value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }, { value: 'suspendido', label: 'Suspendido' }]}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Status..."
              />
            </div>
            {activeFiltersCount > 0 && (
              <button onClick={() => { setZonaFilter(''); setVendedorFilter(''); setDiaFilter(''); setStatusFilter(''); }}
                className="flex items-center gap-1 text-[10px] text-destructive hover:underline py-1">
                <X className="h-2.5 w-2.5" /> Limpiar todo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        {(isLoading || !isLoaded) && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {settingOrigin && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse">
            Click en el mapa para el punto de partida
          </div>
        )}

        {/* Floating KPI cards — horizontal bottom on mobile, vertical left on desktop */}
        <div className="absolute bottom-14 left-2 right-2 md:bottom-auto md:right-auto md:top-3 md:left-3 z-10
          flex flex-row md:flex-col gap-1.5 md:gap-2 overflow-x-auto md:overflow-visible">
          <KpiCard icon={MapPin} label="GPS" value={withGps.length}
            sub={`${withoutGps.length} sin GPS`} color="bg-primary" />
          <KpiCard icon={Users} label="Hoy" value={todayClients.length}
            sub={`${DIA_HOY}`} color="bg-[hsl(var(--chart-4))]" />
          <KpiCard icon={CheckCircle2} label="Visitados" value={visitedCount}
            sub={todayClients.length > 0 ? `${Math.round((visitedCount / todayClients.length) * 100)}%` : '—'}
            color="bg-[hsl(var(--success))]" />
          {routeResult && (
            <>
              <KpiCard icon={TrendingUp} label="Dist." value={`${(routeResult.distance_meters / 1000).toFixed(1)}km`}
                color="bg-[hsl(var(--chart-1))]" />
              <KpiCard icon={Clock} label="Tiempo" value={formatDuration(routeResult.duration)}
                color="bg-[hsl(var(--chart-2))]" />
            </>
          )}
        </div>

        {/* Color legend */}
        <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-2 py-1.5 md:px-3 md:py-2 shadow-sm max-w-[calc(100vw-1rem)] overflow-x-auto hidden md:block">
          {colorMode === 'dia' && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {DIAS.map(d => (
                <button key={d} onClick={() => setDiaFilter(diaFilter === d ? '' : d)}
                  className={cn("flex items-center gap-1 text-[10px] transition-opacity",
                    diaFilter && diaFilter !== d ? "opacity-40" : "opacity-100")}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DIA_COLORS[d] }} />
                  <span className={cn("font-medium", d === DIA_HOY && "underline")}>{d.slice(0, 3)}</span>
                </button>
              ))}
            </div>
          )}
          {colorMode === 'visitado' && (
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-[10px]">
                <div className="w-3 h-3 rounded-full bg-[#22c55e]" /><span className="font-medium">Visitado</span>
              </span>
              <span className="flex items-center gap-1.5 text-[10px]">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]" /><span className="font-medium">Pendiente</span>
              </span>
            </div>
          )}
          {colorMode === 'status' && (
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-[10px]"><div className="w-3 h-3 rounded-full bg-[#22c55e]" /><span className="font-medium">Activo</span></span>
              <span className="flex items-center gap-1.5 text-[10px]"><div className="w-3 h-3 rounded-full bg-[#9ca3af]" /><span className="font-medium">Inactivo</span></span>
              <span className="flex items-center gap-1.5 text-[10px]"><div className="w-3 h-3 rounded-full bg-[#ef4444]" /><span className="font-medium">Suspendido</span></span>
            </div>
          )}
        </div>

        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={withGps.length > 0 ? { lat: withGps[0].gps_lat, lng: withGps[0].gps_lng } : defaultCenter}
            zoom={6}
            onLoad={onMapLoad}
            onClick={handleMapClick}
            options={{
              styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] },
              ],
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
              draggableCursor: settingOrigin ? 'crosshair' : undefined,
            }}
          >
            {/* My current location (blue dot) */}
            <MyLocationMarker />
            {/* Live seller positions */}
            <LiveVendedoresLayer />

            {/* Origin */}
            {originPoint && (
              <Marker
                position={originPoint}
                icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: '#059669', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 14 }}
                label={{ text: '▶', color: '#fff', fontSize: '10px', fontWeight: '700' }}
              />
            )}

            {/* Route polyline (single-route flow) */}
            {polylinePoints && !multiResults && (
              <Polyline path={polylinePoints} options={{ strokeColor: 'hsl(230, 55%, 52%)', strokeWeight: 4, strokeOpacity: 0.8 }} />
            )}

            {/* Multi-route overlay (polylines + numbered stops + per-route origin) */}
            {multiResults && (
              <MultiRouteOverlay
                results={multiResults}
                clientesById={clientesById}
                visibility={routeVisibility}
              />
            )}

            {/* Markers with clustering when no route is active */}
            {orderedClients ? (
              orderedClients.map((c: any, idx: number) => (
                <Marker
                  key={c.id}
                  position={{ lat: c.gps_lat, lng: c.gps_lng }}
                  icon={createNumberedLabel()}
                  label={{ text: `${idx + 1}`, color: '#fff', fontSize: '11px', fontWeight: '700' }}
                  onClick={() => setSelectedCliente(c)}
                />
              ))
            ) : (
              <>
                {/* Numbered markers (with orden) rendered outside cluster so labels always show */}
                {withGps.filter((c: any) => typeof c.orden === 'number' && c.orden > 0).map((c: any) => (
                  <Marker
                    key={c.id}
                    position={{ lat: c.gps_lat, lng: c.gps_lng }}
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      fillColor: getMarkerColor(c),
                      fillOpacity: 1,
                      strokeColor: '#fff',
                      strokeWeight: 2.5,
                      scale: 14,
                      labelOrigin: new google.maps.Point(0, 0),
                    }}
                    label={{ text: `${c.orden}`, color: '#fff', fontSize: '10px', fontWeight: '700' }}
                    onClick={() => setSelectedCliente(c)}
                    title={c.nombre}
                  />
                ))}
                {/* Non-ordered markers stay clustered */}
                <MarkerClusterer
                  options={{
                    maxZoom: 14,
                    gridSize: 50,
                    minimumClusterSize: 5,
                  }}
                >
                  {(clusterer) => (
                    <>
                      {withGps.filter((c: any) => !c.orden || c.orden <= 0).map((c: any) => (
                        <Marker
                          key={c.id}
                          position={{ lat: c.gps_lat, lng: c.gps_lng }}
                          icon={getMarkerIcon(c)}
                          onClick={() => setSelectedCliente(c)}
                          title={c.nombre}
                          clusterer={clusterer}
                        />
                      ))}
                    </>
                  )}
                </MarkerClusterer>
              </>
            )}

            {selectedCliente && (
              <InfoWindow
                position={{ lat: selectedCliente.gps_lat, lng: selectedCliente.gps_lng }}
                onCloseClick={() => setSelectedCliente(null)}
              >
                <div className="min-w-[220px] p-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-bold text-sm flex-1">{selectedCliente.nombre}</div>
                    {ventasHoy?.has(selectedCliente.id) ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Visitado</span>
                    ) : selectedCliente.dia_visita?.includes(DIA_HOY) ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Pendiente</span>
                    ) : null}
                  </div>
                  {selectedCliente.codigo && <div className="text-xs text-gray-500 font-mono mb-1">{selectedCliente.codigo}</div>}
                  {typeof selectedCliente.orden === 'number' && selectedCliente.orden > 0 && (
                    <div className="text-[10px] text-gray-500 mb-1">📍 Orden de ruta: <strong>{selectedCliente.orden}</strong></div>
                  )}
                  {selectedCliente.direccion && <div className="text-xs text-gray-600 mb-2">{selectedCliente.direccion}{selectedCliente.colonia ? `, ${selectedCliente.colonia}` : ''}</div>}
                  {selectedCliente.vendedores?.nombre && (
                    <div className="text-[10px] text-gray-500 mb-1">🧑‍💼 {selectedCliente.vendedores.nombre}</div>
                  )}
                  {selectedCliente.dia_visita?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {selectedCliente.dia_visita.map((d: string) => (
                        <span key={d} className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: `${DIA_COLORS[d]}20`, color: DIA_COLORS[d] }}>
                          {d.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1 pt-1 border-t border-gray-100">
                    <Link to={`/clientes/${selectedCliente.id}`} className="text-xs text-blue-600 hover:underline font-medium">Ver ficha</Link>
                    {selectedCliente.telefono && <a href={`tel:${selectedCliente.telefono}`} className="text-xs text-green-600 hover:underline">Llamar</a>}
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedCliente.gps_lat},${selectedCliente.gps_lng}`}
                      target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Navegar</a>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
        <MapRecenterButton onClick={handleRecenter} className="bottom-6 left-3" />

        {/* Route order sidebar (single route, hidden when multi-route panel is active) */}
        {orderedClients && orderedClients.length > 0 && !multiResults && (
          <div className={cn("absolute top-3 right-3 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg w-72 flex flex-col transition-all",
            showRoutePanel ? "max-h-[65vh]" : "max-h-[42px]")}>
            <button onClick={() => setShowRoutePanel(!showRoutePanel)}
              className="px-3 py-2.5 border-b border-border flex items-center justify-between w-full hover:bg-accent/30 transition-colors rounded-t-xl">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5 text-primary" />
                Orden de visita
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{orderedClients.length} paradas</span>
                {showRoutePanel ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
            {showRoutePanel && (
              <div className="flex-1 overflow-auto">
                {orderedClients.map((c: any, idx: number) => {
                  const visited = ventasHoy?.has(c.id);
                  return (
                    <button key={c.id}
                      onClick={() => { setSelectedCliente(c); mapRef.current?.panTo({ lat: c.gps_lat, lng: c.gps_lng }); }}
                      className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/30 last:border-0 w-full text-left hover:bg-accent/30 transition-colors">
                      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                        visited ? "bg-[hsl(var(--success))] text-white" : "bg-primary text-primary-foreground")}>
                        {visited ? '✓' : idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground truncate">{c.nombre}</div>
                        {c.direccion && <div className="text-[10px] text-muted-foreground truncate">{c.direccion}</div>}
                      </div>
                      {visited && <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Multi-route panel */}
        {multiResults && multiResults.length > 0 && (
          <MultiRoutePanel
            results={multiResults}
            clientesById={clientesById}
            visibility={routeVisibility}
            onToggleVisibility={(vid) => setRouteVisibility(v => ({ ...v, [vid]: !v[vid] }))}
            onApply={handleApplyMulti}
            applying={applying}
            applied={applied}
            onClose={() => { setMultiResults(null); setApplied(false); }}
          />
        )}

        {/* Without GPS sidebar (hidden when any route panel is active) */}
        {!orderedClients && !multiResults && withoutGps.length > 0 && (
          <div className="absolute top-3 right-3 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg w-64 max-h-[50vh] flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <MapPinOff className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Sin GPS ({withoutGps.length})</span>
            </div>
            <div className="flex-1 overflow-auto">
              {withoutGps.map((c: any) => (
                <Link key={c.id} to={`/clientes/${c.id}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{c.nombre}</div>
                    {c.direccion && <div className="text-[10px] text-muted-foreground truncate">{c.direccion}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* First-time hint */}
        {!originPoint && !routeResult && withGps.length > 0 && (
          <div className="absolute bottom-3 right-3 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-sm max-w-[240px]">
            <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
              <span>Haz click en <strong>"Origen"</strong> y selecciona en el mapa, luego <strong>"Optimizar"</strong> para calcular la mejor ruta.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
