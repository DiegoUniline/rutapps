import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { GoogleMap, Marker, InfoWindow, Polyline } from '@react-google-maps/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useVendedores } from '@/hooks/useClientes';
import { Link } from 'react-router-dom';
import { Filter, Truck, X, Calendar, Loader2, Navigation, Route, CheckCircle2, Info, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import MapRecenterButton from '@/components/MapRecenterButton';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { toast } from 'sonner';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 23.6345, lng: -102.5528 };
const today = new Date().toISOString().split('T')[0];

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

  const { data: vendedores } = useVendedores();

  // ── Entregas data filtered by date ──
  const { data: entregasData, isLoading: loadingEntregas } = useQuery({
    queryKey: ['mapa-entregas', empresa?.id, fechaEntregas, vendedorFilter],
    queryFn: async () => {
      let q = supabase
        .from('entregas')
        .select('id, folio, fecha, status, orden_entrega, notas, cliente_id, vendedor_id, vendedor_ruta_id, clientes(id, nombre, codigo, gps_lat, gps_lng, direccion, colonia), vendedores!entregas_vendedor_id_fkey(nombre), vendedor_ruta:vendedores!entregas_vendedor_ruta_id_fkey(nombre)')
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

  const entregasConGps = useMemo(() => (entregasData ?? []).filter((e: any) => e.clientes?.gps_lat && e.clientes?.gps_lng), [entregasData]);

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

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (mapRef.current && entregasConGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      entregasConGps.forEach((e: any) => bounds.extend({ lat: e.clientes.gps_lat, lng: e.clientes.gps_lng }));
      if (originPoint) bounds.extend(originPoint);
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [entregasConGps, originPoint]);

  const handleRecenter = useCallback(() => {
    if (mapRef.current && entregasConGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      entregasConGps.forEach((e: any) => bounds.extend({ lat: e.clientes.gps_lat, lng: e.clientes.gps_lng }));
      if (originPoint) bounds.extend(originPoint);
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [entregasConGps, originPoint]);

  const polylinePoints = useMemo(() => {
    if (!routeResult?.polyline) return null;
    return decodePolyline(routeResult.polyline);
  }, [routeResult]);

  const orderedItems = useMemo(() => {
    if (!routeResult) return null;
    return routeResult.orderedIds.map(id => {
      const entrega = entregasConGps.find((e: any) => e.id === id);
      return entrega ? { id: entrega.id, folio: entrega.folio, nombre: entrega.clientes.nombre, direccion: entrega.clientes.direccion, lat: entrega.clientes.gps_lat, lng: entrega.clientes.gps_lng } : null;
    }).filter(Boolean);
  }, [routeResult, entregasConGps]);

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

  const getEntregaIcon = (status: string) => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: STATUS_COLORS[status] ?? '#714BF4',
    fillOpacity: 0.9,
    strokeColor: '#fff',
    strokeWeight: 2,
    scale: 10,
  });

  const createNumberedLabel = (): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#6366f1',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 16,
    labelOrigin: new google.maps.Point(0, 0),
  });

  const activeFiltersCount = [vendedorFilter].filter(Boolean).length;

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Truck className="h-4 w-4 text-primary" /> Mapa de entregas
          </div>

          {/* Date filter */}
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
            <span>Se muestran entregas pendientes para la fecha seleccionada. Establece un punto de partida y optimiza la ruta para guardar el orden de entrega.</span>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {(loadingEntregas || !isLoaded) && (
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
            center={entregasConGps.length > 0 ? { lat: entregasConGps[0].clientes.gps_lat, lng: entregasConGps[0].clientes.gps_lng } : defaultCenter}
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

            {polylinePoints && (
              <Polyline
                path={polylinePoints}
                options={{ strokeColor: '#6366f1', strokeWeight: 4, strokeOpacity: 0.8 }}
              />
            )}

            {orderedItems ? (
              orderedItems.map((c: any, idx: number) => (
                <Marker
                  key={c.id}
                  position={{ lat: c.lat, lng: c.lng }}
                  icon={createNumberedLabel()}
                  label={{ text: `${idx + 1}`, color: '#fff', fontSize: '11px', fontWeight: '700' }}
                  onClick={() => {
                    const ent = entregasConGps.find((e: any) => e.id === c.id);
                    if (ent) { setSelectedEntrega(ent); }
                  }}
                />
              ))
            ) : (
              entregasConGps.map((e: any) => (
                <Marker
                  key={e.id}
                  position={{ lat: e.clientes.gps_lat, lng: e.clientes.gps_lng }}
                  icon={getEntregaIcon(e.status)}
                  onClick={() => setSelectedEntrega(e)}
                  title={`${e.folio} - ${e.clientes.nombre}`}
                />
              ))
            )}

            {selectedEntrega && (
              <InfoWindow
                position={{ lat: selectedEntrega.clientes.gps_lat, lng: selectedEntrega.clientes.gps_lng }}
                onCloseClick={() => setSelectedEntrega(null)}
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
              </InfoWindow>
            )}
          </GoogleMap>
        )}
        <MapRecenterButton onClick={handleRecenter} className="bottom-6 left-3" />

        {orderedItems && orderedItems.length > 0 && (
          <div className="absolute top-3 right-3 z-10 bg-card border border-border rounded-xl shadow-lg w-72 max-h-[60vh] flex flex-col">
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
