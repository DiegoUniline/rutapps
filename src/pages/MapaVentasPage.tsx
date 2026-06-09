import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl, MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import SearchableSelect from '@/components/SearchableSelect';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useVendedores } from '@/hooks/useClientes';
import { Link } from 'react-router-dom';
import { Filter, Truck, X, Calendar, Loader2, Navigation, Route, CheckCircle2, Info, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { toast } from 'sonner';

// OpenFreeMap = tiles MapLibre gratuitos, sin API key, sin watermark.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const DEFAULT_CENTER = { lng: -102.5528, lat: 23.6345 };
const today = new Date().toISOString().split('T')[0];

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

export default function MapaVentasPage() {
  const { user, empresa } = useAuth();
  const [fechaEntregas, setFechaEntregas] = useState(today);
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<any | null>(null);
  const [originPoint, setOriginPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [settingOrigin, setSettingOrigin] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    orderedIds: string[];
    polyline: string | null;
    distance_meters: number;
    duration: string;
  } | null>(null);
  const mapRef = useRef<MapRef | null>(null);

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

  const { data: vendedores } = useVendedores();

  const { data: entregasData, isLoading: loadingEntregas } = useQuery({
    queryKey: ['mapa-entregas', empresa?.id, fechaEntregas, vendedorFilter],
    queryFn: async () => {
      let q = supabase
        .from('entregas')
        .select('id, folio, fecha, status, orden_entrega, notas, cliente_id, vendedor_id, vendedor_ruta_id, clientes(id, nombre, codigo, gps_lat, gps_lng, direccion, colonia), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre), vendedor_ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', fechaEntregas)
        .in('status', ['surtido', 'asignado', 'cargado', 'en_ruta'])
        .order('orden_entrega', { ascending: true });
      if (vendedorFilter) q = q.or(`vendedor_id.eq.${vendedorFilter},vendedor_ruta_id.eq.${vendedorFilter}`);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!empresa?.id,
  });

  const entregasConGps = useMemo(() => {
    const filtered = (entregasData ?? []).filter((e: any) => e.clientes?.gps_lat && e.clientes?.gps_lng);
    const groups = new Map<string, any[]>();
    for (const e of filtered) {
      const key = `${Number(e.clientes.gps_lat).toFixed(5)},${Number(e.clientes.gps_lng).toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    const result: any[] = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        const e = group[0];
        result.push({ ...e, _displayLat: e.clientes.gps_lat, _displayLng: e.clientes.gps_lng });
      } else {
        const radius = 0.00022;
        const lat0 = group[0].clientes.gps_lat;
        const lngScale = 1 / Math.max(0.0001, Math.cos((lat0 * Math.PI) / 180));
        group.forEach((e: any, i: number) => {
          const angle = (2 * Math.PI * i) / group.length;
          result.push({
            ...e,
            _displayLat: e.clientes.gps_lat + radius * Math.cos(angle),
            _displayLng: e.clientes.gps_lng + radius * Math.sin(angle) * lngScale,
          });
        });
      }
    }
    return result;
  }, [entregasData]);

  const uniqueWaypoints = useMemo(() => {
    return entregasConGps.map((e: any) => ({
      id: e.id,
      lat: e.clientes.gps_lat,
      lng: e.clientes.gps_lng,
    }));
  }, [entregasConGps]);

  const stats = useMemo(() => {
    const all = entregasData ?? [];
    return {
      total: all.length,
      conGps: entregasConGps.length,
      sinGps: all.length - entregasConGps.length,
    };
  }, [entregasData, entregasConGps]);

  // Auto-fit bounds when entregas change
  useEffect(() => {
    if (!mapRef.current || entregasConGps.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    entregasConGps.forEach((e: any) => bounds.extend([e._displayLng, e._displayLat]));
    if (originPoint) bounds.extend([originPoint.lng, originPoint.lat]);
    mapRef.current.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: 15 });
  }, [entregasConGps, originPoint]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || entregasConGps.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    entregasConGps.forEach((e: any) => bounds.extend([e._displayLng, e._displayLat]));
    if (originPoint) bounds.extend([originPoint.lng, originPoint.lat]);
    mapRef.current.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: 15 });
  }, [entregasConGps, originPoint]);

  const polylineGeoJson = useMemo(() => {
    if (!routeResult?.polyline) return null;
    const coords = decodePolyline(routeResult.polyline);
    return {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: {},
    };
  }, [routeResult]);

  const orderedItems = useMemo(() => {
    if (!routeResult) return null;
    return routeResult.orderedIds.map(id => {
      const entrega = entregasConGps.find((e: any) => e.id === id);
      return entrega ? { id: entrega.id, folio: entrega.folio, nombre: entrega.clientes.nombre, direccion: entrega.clientes.direccion, lat: entrega._displayLat, lng: entrega._displayLng } : null;
    }).filter(Boolean);
  }, [routeResult, entregasConGps]);

  const handleMapClick = useCallback((e: any) => {
    if (settingOrigin && e.lngLat) {
      setOriginPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setSettingOrigin(false);
      setRouteResult(null);
      toast.success('Punto de partida establecido');
    }
  }, [settingOrigin]);

  const saveEntregaOrder = async (orderedIds: string[]) => {
    setSaving(true);
    try {
      const updates = orderedIds.map((id: string, idx: number) =>
        supabase.from('entregas').update({ orden_entrega: idx + 1 } as any).eq('id', id)
      );
      await Promise.all(updates);
      toast.success('Orden de entregas guardado');
    } catch (err: any) {
      toast.error('Error al guardar orden');
    } finally {
      setSaving(false);
    }
  };

  const handleOptimize = async () => {
    if (!originPoint) { toast.error('Primero establece un punto de partida'); return; }
    if (uniqueWaypoints.length < 2) { toast.error('Se necesitan al menos 2 entregas con GPS'); return; }
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
        body: JSON.stringify({ origin: originPoint, waypoints: uniqueWaypoints }),
      });

      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Error al optimizar'); return; }

      setRouteResult({
        orderedIds: result.optimized_order,
        polyline: result.polyline,
        distance_meters: result.distance_meters,
        duration: result.duration,
      });

      await saveEntregaOrder(result.optimized_order);
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

  const STATUS_COLORS: Record<string, string> = {
    surtido: '#3b82f6',
    asignado: '#f59e0b',
    cargado: '#8b5cf6',
    en_ruta: '#22c55e',
  };

  const activeFiltersCount = [vendedorFilter].filter(Boolean).length;

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Truck className="h-4 w-4 text-primary" /> Mapa de entregas
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <OdooDatePicker value={fechaEntregas} onChange={v => { setFechaEntregas(v); setRouteResult(null); }} />
          </div>

          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              showFilters || activeFiltersCount > 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:text-foreground")}>
            <Filter className="h-4 w-4" />Filtros
            {activeFiltersCount > 0 && <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFiltersCount}</Badge>}
          </button>

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
          {isAdmin && originPoint && uniqueWaypoints.length >= 2 && (
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
              <div className="text-[10px] text-muted-foreground font-medium">Entregas</div>
            </div>
            <div className="flex flex-col text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" />{stats.conGps} en mapa</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-muted-foreground/40" />{stats.sinGps} sin GPS</span>
              {routeResult && (
                <span className="text-emerald-600 font-medium">{(routeResult.distance_meters / 1000).toFixed(1)} km · {formatDuration(routeResult.duration)}</span>
              )}
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Vendedor / Ruta</label>
              <SearchableSelect
                options={[{ value: '', label: 'Todos' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
                value={vendedorFilter}
                onChange={val => { setVendedorFilter(val); setRouteResult(null); }}
                placeholder="Vendedor..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 self-end">
              {Object.entries(STATUS_COLORS).map(([s, c]) => (
                <span key={s} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                  {s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
                </span>
              ))}
            </div>
            {activeFiltersCount > 0 && (
              <button onClick={() => setVendedorFilter('')}
                className="self-end flex items-center gap-1 text-xs text-destructive hover:underline py-1.5">
                <X className="h-3 w-3" /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!originPoint && !routeResult && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-2 rounded-lg">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Mapa OpenStreetMap (sin costo). Se muestran entregas pendientes para la fecha seleccionada. Establece un punto de partida y optimiza la ruta para guardar el orden de entrega.</span>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loadingEntregas && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center pointer-events-none">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {settingOrigin && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse">
            Haz click en el mapa para establecer el punto de partida
          </div>
        )}
        <Map
          ref={mapRef}
          mapStyle={MAP_STYLE}
          initialViewState={{
            longitude: DEFAULT_CENTER.lng,
            latitude: DEFAULT_CENTER.lat,
            zoom: 5,
          }}
          style={{ width: '100%', height: '100%', cursor: settingOrigin ? 'crosshair' : undefined }}
          onClick={handleMapClick}
          attributionControl={{ compact: true }}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {/* Polyline ruta */}
          {polylineGeoJson && (
            <Source id="route-line" type="geojson" data={polylineGeoJson as any}>
              <Layer
                id="route-line-layer"
                type="line"
                paint={{ 'line-color': '#6366f1', 'line-width': 4, 'line-opacity': 0.8 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </Source>
          )}

          {/* Punto de partida */}
          {originPoint && (
            <Marker longitude={originPoint.lng} latitude={originPoint.lat} anchor="center">
              <div className="w-8 h-8 rounded-full bg-emerald-600 border-[3px] border-white shadow-lg flex items-center justify-center text-white text-xs font-bold">
                ▶
              </div>
            </Marker>
          )}

          {/* Entregas */}
          {(orderedItems ?? entregasConGps).map((e: any, idx: number) => {
            const isOrdered = !!orderedItems;
            const lng = isOrdered ? e.lng : e._displayLng;
            const lat = isOrdered ? e.lat : e._displayLat;
            const color = isOrdered ? '#6366f1' : (STATUS_COLORS[e.status] ?? '#714BF4');
            return (
              <Marker
                key={e.id}
                longitude={lng}
                latitude={lat}
                anchor="center"
                onClick={(ev) => {
                  ev.originalEvent.stopPropagation();
                  const ent = isOrdered ? entregasConGps.find((x: any) => x.id === e.id) : e;
                  if (ent) setSelectedEntrega(ent);
                }}
              >
                <div
                  className="rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold cursor-pointer hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: color,
                    width: isOrdered ? 30 : 22,
                    height: isOrdered ? 30 : 22,
                    fontSize: isOrdered ? 12 : 10,
                  }}
                  title={isOrdered ? `${idx + 1}. ${e.nombre}` : `${e.folio} - ${e.clientes.nombre}`}
                >
                  {isOrdered ? idx + 1 : ''}
                </div>
              </Marker>
            );
          })}

          {/* Popup */}
          {selectedEntrega && (
            <Popup
              longitude={selectedEntrega._displayLng ?? selectedEntrega.clientes.gps_lng}
              latitude={selectedEntrega._displayLat ?? selectedEntrega.clientes.gps_lat}
              anchor="bottom"
              onClose={() => setSelectedEntrega(null)}
              closeButton={true}
              closeOnClick={false}
              offset={20}
            >
              <div className="min-w-[200px] p-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm font-mono">{selectedEntrega.folio}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${STATUS_COLORS[selectedEntrega.status]}20`, color: STATUS_COLORS[selectedEntrega.status] }}>
                    {selectedEntrega.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-gray-600 font-medium mb-0.5">{selectedEntrega.clientes?.nombre}</div>
                {selectedEntrega.clientes?.direccion && <div className="text-xs text-gray-500 mb-1">{selectedEntrega.clientes.direccion}</div>}
                {selectedEntrega.vendedor_ruta?.nombre && <div className="text-[10px] text-gray-400">Ruta: {selectedEntrega.vendedor_ruta.nombre}</div>}
                {selectedEntrega.orden_entrega > 0 && <div className="text-[10px] text-gray-400">Orden: #{selectedEntrega.orden_entrega}</div>}
                <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
                  <Link to={`/logistica/entregas/${selectedEntrega.id}`} className="text-xs text-blue-600 hover:underline">Ver entrega</Link>
                </div>
              </div>
            </Popup>
          )}
        </Map>

        <button
          onClick={handleRecenter}
          className="absolute bottom-6 left-3 z-10 bg-card border border-border rounded-full p-2.5 shadow-lg hover:bg-accent transition-colors"
          title="Centrar mapa"
        >
          <Navigation className="h-4 w-4 text-foreground" />
        </button>

        {orderedItems && orderedItems.length > 0 && (
          <div className="absolute top-3 right-14 z-10 bg-card border border-border rounded-xl shadow-lg w-72 max-h-[60vh] flex flex-col">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5 text-primary" />
                Orden de entrega
              </span>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <Save className="h-3 w-3" /> Guardado
                </span>
                <span className="text-[10px] text-muted-foreground">{orderedItems.length} paradas</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {orderedItems.map((c: any, idx: number) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</div>
                  <div className="min-w-0 flex-1">
                    {c.folio && <div className="text-[10px] font-mono text-muted-foreground">{c.folio}</div>}
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
