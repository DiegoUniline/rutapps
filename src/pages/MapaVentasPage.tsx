import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { GoogleMap, Marker, InfoWindow, Polyline } from '@react-google-maps/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useVendedores } from '@/hooks/useClientes';
import { Link } from 'react-router-dom';
import { Filter, ShoppingCart, X, Calendar, Loader2, Navigation, Route, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { toast } from 'sonner';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 23.6345, lng: -102.5528 };
const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

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

export default function MapaVentasPage() {
  const { user, empresa } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [fechaDesde, setFechaDesde] = useState(weekAgo);
  const [fechaHasta, setFechaHasta] = useState(today);
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<any | null>(null);
  const [originPoint, setOriginPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [settingOrigin, setSettingOrigin] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    orderedIds: string[];
    polyline: string | null;
    distance_meters: number;
    duration: string;
  } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role_id, roles(nombre, es_sistema)')
        .eq('user_id', user!.id);
      return data?.some((ur: any) => {
        const roleName = ur.roles?.nombre?.toLowerCase?.() ?? '';
        return ur.roles?.es_sistema === true || roleName.includes('admin');
      }) ?? false;
    },
    enabled: !!user?.id,
  });

  const { data: vendedores } = useVendedores();

  const { data: ventasData, isLoading } = useQuery({
    queryKey: ['mapa-ventas', empresa?.id, fechaDesde, fechaHasta, vendedorFilter, tipoFilter],
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, tipo, status, condicion_pago, cliente_id, vendedor_id, clientes(id, nombre, codigo, gps_lat, gps_lng, direccion, colonia), vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha', { ascending: false });
      if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);
      if (tipoFilter) q = q.eq('tipo', tipoFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!empresa?.id,
  });

  const ventasConGps = useMemo(() => (ventasData ?? []).filter((v: any) => v.clientes?.gps_lat && v.clientes?.gps_lng), [ventasData]);

  // Deduplicate clients for optimization (one waypoint per unique client)
  const uniqueClientWaypoints = useMemo(() => {
    const seen = new Map<string, { id: string; lat: number; lng: number }>();
    ventasConGps.forEach((v: any) => {
      if (!seen.has(v.clientes.id)) {
        seen.set(v.clientes.id, { id: v.clientes.id, lat: v.clientes.gps_lat, lng: v.clientes.gps_lng });
      }
    });
    return Array.from(seen.values());
  }, [ventasConGps]);

  const stats = useMemo(() => {
    const all = ventasData ?? [];
    return {
      total: all.length,
      conGps: ventasConGps.length,
      sinGps: all.length - ventasConGps.length,
      montoTotal: all.reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    };
  }, [ventasData, ventasConGps]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (mapRef.current && ventasConGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      ventasConGps.forEach((v: any) => bounds.extend({ lat: v.clientes.gps_lat, lng: v.clientes.gps_lng }));
      if (originPoint) bounds.extend(originPoint);
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [ventasConGps, originPoint]);

  const polylinePoints = useMemo(() => {
    if (!routeResult?.polyline) return null;
    return decodePolyline(routeResult.polyline);
  }, [routeResult]);

  const orderedClients = useMemo(() => {
    if (!routeResult) return null;
    return routeResult.orderedIds.map(id => {
      const venta = ventasConGps.find((v: any) => v.clientes.id === id);
      return venta ? { id: venta.clientes.id, nombre: venta.clientes.nombre, direccion: venta.clientes.direccion, lat: venta.clientes.gps_lat, lng: venta.clientes.gps_lng } : null;
    }).filter(Boolean);
  }, [routeResult, ventasConGps]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (settingOrigin && e.latLng) {
      setOriginPoint({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      setSettingOrigin(false);
      setRouteResult(null);
      toast.success('Punto de partida establecido');
    }
  }, [settingOrigin]);

  const handleOptimize = async () => {
    if (!originPoint) { toast.error('Primero establece un punto de partida'); return; }
    if (uniqueClientWaypoints.length < 2) { toast.error('Se necesitan al menos 2 clientes con GPS'); return; }
    setOptimizing(true);
    setRouteResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error('Sesión no válida'); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/optimize-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin: originPoint, waypoints: uniqueClientWaypoints }),
      });

      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Error al optimizar'); return; }

      setRouteResult({
        orderedIds: result.optimized_order,
        polyline: result.polyline,
        distance_meters: result.distance_meters,
        duration: result.duration,
      });
      toast.success(`Ruta optimizada: ${(result.distance_meters / 1000).toFixed(1)} km`);
    } catch (err: any) {
      toast.error(err.message || 'Error al optimizar ruta');
    } finally {
      setOptimizing(false);
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

  const getSaleIcon = (total: number) => {
    const color = total >= 5000 ? '#22c55e' : total >= 1000 ? '#3b82f6' : '#714BF4';
    const scale = Math.min(14, Math.max(8, 7 + Math.log10(Math.max(total, 1)) * 2));
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 0.9,
      strokeColor: '#fff',
      strokeWeight: 2,
      scale,
    };
  };

  const createNumberedLabel = (): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#6366f1',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 16,
    labelOrigin: new google.maps.Point(0, 0),
  });

  const activeFiltersCount = [vendedorFilter, tipoFilter].filter(Boolean).length;


  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Mapa de pedidos</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <OdooDatePicker value={fechaDesde} onChange={v => { setFechaDesde(v); setRouteResult(null); }} />
              <span className="text-muted-foreground">—</span>
              <OdooDatePicker value={fechaHasta} onChange={v => { setFechaHasta(v); setRouteResult(null); }} />
            </div>
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              showFilters || activeFiltersCount > 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:text-foreground")}>
            <Filter className="h-4 w-4" />Filtros
            {activeFiltersCount > 0 && <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFiltersCount}</Badge>}
          </button>

          {/* Optimize controls */}
          <button
            onClick={() => { setSettingOrigin(!settingOrigin); if (!settingOrigin) toast.info('Haz click en el mapa para establecer el punto de partida'); }}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              settingOrigin ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 animate-pulse"
                : originPoint ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-background border-border text-muted-foreground hover:text-foreground")}>
            <Navigation className="h-4 w-4" />
            {settingOrigin ? 'Click en el mapa...' : originPoint ? 'Punto establecido' : 'Punto de partida'}
          </button>
          {originPoint && !settingOrigin && (
            <button onClick={() => { setOriginPoint(null); setRouteResult(null); }}
              className="text-xs text-destructive hover:underline py-2">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isAdmin && originPoint && uniqueClientWaypoints.length >= 2 && (
            <button onClick={handleOptimize} disabled={optimizing}
              className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
                routeResult ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
                optimizing && "opacity-70")}>
              {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : routeResult ? <CheckCircle2 className="h-4 w-4" /> : <Route className="h-4 w-4" />}
              {optimizing ? 'Optimizando...' : routeResult ? 'Ruta optimizada' : 'Optimizar ruta'}
            </button>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-primary">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Pedidos</div>
            </div>
            <div className="bg-accent rounded-lg px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-foreground">${stats.montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Total</div>
            </div>
            <div className="flex flex-col text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" />{stats.conGps} en mapa</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-muted-foreground/40" />{stats.sinGps} sin GPS</span>
              {routeResult && (
                <>
                  <span className="text-emerald-600 font-medium">{(routeResult.distance_meters / 1000).toFixed(1)} km · {formatDuration(routeResult.duration)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Vendedor</label>
              <select value={vendedorFilter} onChange={e => { setVendedorFilter(e.target.value); setRouteResult(null); }}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tipo</label>
              <select value={tipoFilter} onChange={e => { setTipoFilter(e.target.value); setRouteResult(null); }}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                <option value="pedido">Pedido</option>
                <option value="venta_directa">Venta directa</option>
              </select>
            </div>
            {activeFiltersCount > 0 && (
              <button onClick={() => { setVendedorFilter(''); setTipoFilter(''); }}
                className="self-end flex items-center gap-1 text-xs text-destructive hover:underline py-1.5">
                <X className="h-3 w-3" /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!originPoint && !routeResult && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-2 rounded-lg">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Selecciona un rango de fechas, luego haz click en <strong>"Punto de partida"</strong> y selecciona en el mapa. Después presiona <strong>"Optimizar ruta"</strong> para calcular el recorrido óptimo.</span>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {(isLoading || !isLoaded) && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {settingOrigin && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse">
            Haz click en el mapa para establecer el punto de partida
          </div>
        )}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={ventasConGps.length > 0 ? { lat: ventasConGps[0].clientes.gps_lat, lng: ventasConGps[0].clientes.gps_lng } : defaultCenter}
            zoom={6}
            onLoad={onMapLoad}
            onClick={handleMapClick}
            options={{
              styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
              draggableCursor: settingOrigin ? 'crosshair' : undefined,
            }}
          >
            {/* Origin marker */}
            {originPoint && (
              <Marker
                position={originPoint}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: '#059669',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 3,
                  scale: 14,
                }}
                label={{ text: '▶', color: '#fff', fontSize: '10px', fontWeight: '700' }}
              />
            )}

            {/* Route polyline */}
            {polylinePoints && (
              <Polyline
                path={polylinePoints}
                options={{ strokeColor: '#6366f1', strokeWeight: 4, strokeOpacity: 0.8 }}
              />
            )}

            {/* Markers */}
            {orderedClients ? (
              orderedClients.map((c: any, idx: number) => (
                <Marker
                  key={c.id}
                  position={{ lat: c.lat, lng: c.lng }}
                  icon={createNumberedLabel()}
                  label={{ text: `${idx + 1}`, color: '#fff', fontSize: '11px', fontWeight: '700' }}
                />
              ))
            ) : (
              ventasConGps.map((v: any) => (
                <Marker
                  key={v.id}
                  position={{ lat: v.clientes.gps_lat, lng: v.clientes.gps_lng }}
                  icon={getSaleIcon(v.total ?? 0)}
                  onClick={() => setSelectedVenta(v)}
                  title={v.folio || 'Sin folio'}
                />
              ))
            )}

            {selectedVenta && (
              <InfoWindow
                position={{ lat: selectedVenta.clientes.gps_lat, lng: selectedVenta.clientes.gps_lng }}
                onCloseClick={() => setSelectedVenta(null)}
              >
                <div className="min-w-[220px] p-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">{selectedVenta.folio || 'Sin folio'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      selectedVenta.tipo === 'pedido' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>{selectedVenta.tipo === 'pedido' ? 'Pedido' : 'Venta'}</span>
                  </div>
                  <div className="text-xs text-gray-600 mb-0.5">{selectedVenta.clientes?.nombre}</div>
                  <div className="text-xs text-gray-500 mb-1">{selectedVenta.clientes?.direccion ?? ''}</div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">{new Date(selectedVenta.fecha).toLocaleDateString('es-MX')}</span>
                    <span className="text-sm font-bold text-green-600">${(selectedVenta.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {selectedVenta.vendedores?.nombre && <div className="text-[10px] text-gray-400">Vendedor: {selectedVenta.vendedores.nombre}</div>}
                  <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
                    <Link to={`/ventas/${selectedVenta.id}`} className="text-xs text-blue-600 hover:underline">Ver venta</Link>
                    <Link to={`/clientes/${selectedVenta.cliente_id}`} className="text-xs text-blue-600 hover:underline">Ver cliente</Link>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}

        {/* Route order sidebar */}
        {orderedClients && orderedClients.length > 0 && (
          <div className="absolute top-3 right-3 z-10 bg-card border border-border rounded-xl shadow-lg w-64 max-h-[60vh] flex flex-col">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5 text-primary" />
                Orden de entrega
              </span>
              <span className="text-[10px] text-muted-foreground">{orderedClients.length} paradas</span>
            </div>
            <div className="flex-1 overflow-auto">
              {orderedClients.map((c: any, idx: number) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{c.nombre}</div>
                    {c.direccion && <div className="text-[10px] text-muted-foreground truncate">{c.direccion}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
