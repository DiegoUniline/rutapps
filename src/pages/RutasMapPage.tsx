import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { GoogleMap, Marker, InfoWindow, Polyline } from '@react-google-maps/api';
import { useClientes, useVendedores } from '@/hooks/useClientes';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Route, Loader2, CheckCircle2, Navigation, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import MapRecenterButton from '@/components/MapRecenterButton';
import { toast } from 'sonner';
import { useGoogleMaps } from '@/hooks/useGoogleMapsKey';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 23.6345, lng: -102.5528 };

// Decode Google encoded polyline
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

export default function RutasMapPage() {
  const { user } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [diaFilter, setDiaFilter] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [originPoint, setOriginPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [settingOrigin, setSettingOrigin] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    orderedIds: string[];
    polyline: string | null;
    distance_meters: number;
    duration: string;
  } | null>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
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

  const { data: clientes, isLoading } = useClientes('', undefined);
  const { data: vendedores } = useVendedores();

  const filtered = useMemo(() => {
    let result = clientes ?? [];
    if (diaFilter) result = result.filter((c: any) => c.dia_visita?.includes(diaFilter));
    if (vendedorFilter) result = result.filter((c: any) => c.vendedor_id === vendedorFilter);
    return result;
  }, [clientes, diaFilter, vendedorFilter]);

  const withGps = useMemo(() => filtered.filter((c: any) => c.gps_lat && c.gps_lng), [filtered]);

  // Check if clients already have a saved order
  const hasSavedOrder = useMemo(() => {
    return withGps.some((c: any) => c.orden && c.orden > 0);
  }, [withGps]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
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

  // Show optimized order from routeResult, OR fallback to saved orden from DB
  const orderedClients = useMemo(() => {
    if (routeResult) {
      return routeResult.orderedIds.map(id => withGps.find((c: any) => c.id === id)).filter(Boolean);
    }
    // Fallback: show saved order if clients have orden > 0
    if (hasSavedOrder) {
      return [...withGps].sort((a: any, b: any) => (a.orden ?? 999) - (b.orden ?? 999));
    }
    return null;
  }, [routeResult, withGps, hasSavedOrder]);

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
    if (withGps.length < 1) { toast.error('No hay clientes con GPS para optimizar'); return; }

    setOptimizing(true);
    setRouteResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error('Sesión no válida'); return; }

      const waypoints = withGps.map((c: any) => ({ id: c.id, lat: c.gps_lat, lng: c.gps_lng }));
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/optimize-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin: originPoint, waypoints, dia_filtro: diaFilter || null }),
      });

      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Error al optimizar'); return; }

      const updates = result.optimized_order.map((id: string, idx: number) =>
        supabase.from('clientes').update({ orden: idx + 1 }).eq('id', id)
      );
      await Promise.all(updates);

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

  const createNumberedLabel = (num: number): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#6366f1',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 16,
    labelOrigin: new google.maps.Point(0, 0),
  });


  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Optimización de rutas</h1>
          </div>
          <div className="flex flex-col gap-0.5 min-w-[150px]">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Día</label>
            <SearchableSelect
              options={[{ value: '', label: 'Todos los días' }, ...DIAS.map(d => ({ value: d, label: d }))]}
              value={diaFilter}
              onChange={val => { setDiaFilter(val); setRouteResult(null); }}
              placeholder="Día..."
            />
          </div>
          <div className="flex flex-col gap-0.5 min-w-[150px]">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Vendedor</label>
            <SearchableSelect
              options={[{ value: '', label: 'Todos' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
              value={vendedorFilter}
              onChange={val => { setVendedorFilter(val); setRouteResult(null); }}
              placeholder="Vendedor..."
            />
          </div>
          <button
            onClick={() => { setSettingOrigin(!settingOrigin); if (!settingOrigin) toast.info('Haz click en el mapa para establecer el punto de partida'); }}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors mt-auto",
              settingOrigin ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 animate-pulse"
                : originPoint ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-background border-border text-muted-foreground hover:text-foreground")}>
            <Navigation className="h-4 w-4" />
            {settingOrigin ? 'Click en el mapa...' : originPoint ? 'Punto establecido' : 'Punto de partida'}
          </button>
          {originPoint && !settingOrigin && (
            <button onClick={() => { setOriginPoint(null); setRouteResult(null); }}
              className="text-xs text-destructive hover:underline mt-auto py-2">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isAdmin && originPoint && withGps.length >= 1 && (
            <button onClick={handleOptimize} disabled={optimizing}
              className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all mt-auto",
                routeResult ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
                optimizing && "opacity-70")}>
              {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : routeResult ? <CheckCircle2 className="h-4 w-4" /> : <Route className="h-4 w-4" />}
              {optimizing ? 'Optimizando...' : routeResult ? 'Ruta optimizada' : 'Optimizar ruta'}
            </button>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground ml-auto mt-auto">
            <span><Badge variant="secondary" className="text-[10px]">{withGps.length}</Badge> clientes</span>
            {routeResult && (
              <>
                <span className="text-emerald-600 font-semibold">{(routeResult.distance_meters / 1000).toFixed(1)} km</span>
                <span className="text-emerald-600">{formatDuration(routeResult.duration)}</span>
              </>
            )}
          </div>
        </div>
        {!originPoint && !routeResult && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-2 rounded-lg">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Selecciona un día y vendedor, luego haz click en <strong>"Punto de partida"</strong> y selecciona en el mapa desde dónde iniciar la ruta.</span>
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
            center={withGps.length > 0 ? { lat: withGps[0].gps_lat, lng: withGps[0].gps_lng } : defaultCenter}
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

            {/* Numbered client markers (optimized) */}
            {orderedClients ? (
              orderedClients.map((c: any, idx: number) => (
                <Marker
                  key={c.id}
                  position={{ lat: c.gps_lat, lng: c.gps_lng }}
                  icon={createNumberedLabel(idx + 1)}
                  label={{ text: `${idx + 1}`, color: '#fff', fontSize: '11px', fontWeight: '700' }}
                  onClick={() => setSelectedClient(c)}
                />
              ))
            ) : (
              withGps.map((c: any) => (
                <Marker
                  key={c.id}
                  position={{ lat: c.gps_lat, lng: c.gps_lng }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#714BF4',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                    scale: 8,
                  }}
                  onClick={() => setSelectedClient(c)}
                  title={c.nombre}
                />
              ))
            )}

            {selectedClient && (
              <InfoWindow
                position={{ lat: selectedClient.gps_lat, lng: selectedClient.gps_lng }}
                onCloseClick={() => setSelectedClient(null)}
              >
                <div className="min-w-[180px] p-1">
                  <div className="font-bold text-sm">{selectedClient.nombre}</div>
                  {selectedClient.codigo && <div className="text-xs text-gray-500 font-mono">{selectedClient.codigo}</div>}
                  {selectedClient.direccion && <div className="text-xs text-gray-600 mt-1">{selectedClient.direccion}</div>}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
        <MapRecenterButton onClick={handleRecenter} className="bottom-6 left-3" />

        {/* Route order sidebar */}
        {orderedClients && orderedClients.length > 0 && (
          <div className="absolute top-3 right-3 z-10 bg-card border border-border rounded-xl shadow-lg w-64 max-h-[60vh] flex flex-col">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5 text-primary" />
                Orden de visita
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
