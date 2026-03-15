import { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useClientes, useZonas, useVendedores } from '@/hooks/useClientes';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Route, Loader2, CheckCircle2, Navigation, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function createNumberedIcon(num: number, color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 30px; height: 30px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: white;
    ">${num}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

function createOriginIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 34px; height: 34px; border-radius: 50%;
      background: #059669; border: 3px solid white;
      box-shadow: 0 2px 10px rgba(5,150,105,0.5);
      display: flex; align-items: center; justify-content: center;
    "><svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function createClientIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 24px; height: 24px; border-radius: 50% 50% 50% 0;
      background: ${color}; border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      transform: rotate(-45deg);
    "><div style="
      width: 6px; height: 6px; background: white; border-radius: 50%;
      transform: rotate(45deg); margin: 5px auto;
    "></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

// Decode Google encoded polyline
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
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [positions, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function RutasMapPage() {
  const { user } = useAuth();
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

  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role_id, roles(nombre, es_sistema)')
        .eq('user_id', user!.id);
      return data?.some((ur: any) => ur.roles?.es_sistema === true || ur.roles?.nombre?.toLowerCase() === 'admin') ?? false;
    },
    enabled: !!user?.id,
  });

  const { data: clientes, isLoading } = useClientes('', undefined);
  const { data: vendedores } = useVendedores();

  // Filter clients by day + vendedor
  const filtered = useMemo(() => {
    let result = clientes ?? [];
    if (diaFilter) result = result.filter((c: any) => c.dia_visita?.includes(diaFilter));
    if (vendedorFilter) result = result.filter((c: any) => c.vendedor_id === vendedorFilter);
    return result;
  }, [clientes, diaFilter, vendedorFilter]);

  const withGps = useMemo(() => filtered.filter((c: any) => c.gps_lat && c.gps_lng), [filtered]);

  const positions = useMemo<[number, number][]>(
    () => withGps.map((c: any) => [c.gps_lat, c.gps_lng]),
    [withGps]
  );

  const allPositions = useMemo(() => {
    const pts = [...positions];
    if (originPoint) pts.push([originPoint.lat, originPoint.lng]);
    return pts;
  }, [positions, originPoint]);

  const defaultCenter: [number, number] = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length, positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [23.6345, -102.5528];

  const polylinePoints = useMemo(() => {
    if (!routeResult?.polyline) return null;
    return decodePolyline(routeResult.polyline);
  }, [routeResult]);

  // Ordered clients for numbered markers
  const orderedClients = useMemo(() => {
    if (!routeResult) return null;
    return routeResult.orderedIds
      .map(id => withGps.find((c: any) => c.id === id))
      .filter(Boolean);
  }, [routeResult, withGps]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (settingOrigin) {
      setOriginPoint({ lat, lng });
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          origin: originPoint,
          waypoints,
          dia_filtro: diaFilter || null,
        }),
      });

      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Error al optimizar'); return; }

      // Update orden in DB
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

  // Parse duration like "3600s" to readable
  const formatDuration = (d?: string) => {
    if (!d) return '';
    const secs = parseInt(d.replace('s', ''));
    if (isNaN(secs)) return d;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Optimización de rutas</h1>
          </div>

          {/* Day filter */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Día</label>
            <select
              value={diaFilter}
              onChange={e => { setDiaFilter(e.target.value); setRouteResult(null); }}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[130px]"
            >
              <option value="">Todos los días</option>
              {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Vendedor filter */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Vendedor</label>
            <select
              value={vendedorFilter}
              onChange={e => { setVendedorFilter(e.target.value); setRouteResult(null); }}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]"
            >
              <option value="">Todos</option>
              {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>

          {/* Set origin button */}
          <button
            onClick={() => { setSettingOrigin(!settingOrigin); if (!settingOrigin) toast.info('Haz click en el mapa para establecer el punto de partida'); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors mt-auto",
              settingOrigin
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 animate-pulse"
                : originPoint
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Navigation className="h-4 w-4" />
            {settingOrigin ? 'Click en el mapa...' : originPoint ? 'Punto establecido' : 'Punto de partida'}
          </button>

          {originPoint && !settingOrigin && (
            <button onClick={() => { setOriginPoint(null); setRouteResult(null); }}
              className="text-xs text-destructive hover:underline mt-auto py-2">
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Optimize button */}
          {isAdmin && originPoint && withGps.length >= 1 && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all mt-auto",
                routeResult
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
                optimizing && "opacity-70"
              )}
            >
              {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : routeResult ? <CheckCircle2 className="h-4 w-4" /> : <Route className="h-4 w-4" />}
              {optimizing ? 'Optimizando...' : routeResult ? 'Ruta optimizada' : 'Optimizar ruta'}
            </button>
          )}

          {/* Stats */}
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

        {/* Instructions */}
        {!originPoint && !routeResult && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-2 rounded-lg">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Selecciona un día y vendedor, luego haz click en <strong>"Punto de partida"</strong> y selecciona en el mapa desde dónde iniciar la ruta.</span>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {settingOrigin && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse">
            Haz click en el mapa para establecer el punto de partida
          </div>
        )}
        <MapContainer
          center={defaultCenter}
          zoom={6}
          className="h-full w-full z-0"
          style={{ background: 'hsl(var(--background))' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {allPositions.length > 0 && <FitBounds positions={allPositions} />}
          <ClickHandler onClick={handleMapClick} />

          {/* Origin marker */}
          {originPoint && (
            <Marker position={[originPoint.lat, originPoint.lng]} icon={createOriginIcon()}>
              <Popup><div className="font-semibold text-sm">Punto de partida</div></Popup>
            </Marker>
          )}

          {/* Route polyline */}
          {polylinePoints && (
            <Polyline positions={polylinePoints} pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.8 }} />
          )}

          {/* Client markers */}
          {orderedClients ? (
            orderedClients.map((c: any, idx: number) => (
              <Marker key={c.id} position={[c.gps_lat, c.gps_lng]} icon={createNumberedIcon(idx + 1, '#6366f1')}>
                <Popup>
                  <div className="min-w-[180px]">
                    <div className="font-bold text-sm">#{idx + 1} — {c.nombre}</div>
                    {c.codigo && <div className="text-xs text-gray-500 font-mono">{c.codigo}</div>}
                    {c.direccion && <div className="text-xs text-gray-600 mt-1">{c.direccion}</div>}
                  </div>
                </Popup>
              </Marker>
            ))
          ) : (
            withGps.map((c: any) => (
              <Marker key={c.id} position={[c.gps_lat, c.gps_lng]} icon={createClientIcon('#714BF4')}>
                <Popup>
                  <div className="min-w-[180px]">
                    <div className="font-bold text-sm">{c.nombre}</div>
                    {c.codigo && <div className="text-xs text-gray-500 font-mono">{c.codigo}</div>}
                    {c.direccion && <div className="text-xs text-gray-600 mt-1">{c.direccion}</div>}
                  </div>
                </Popup>
              </Marker>
            ))
          )}
        </MapContainer>

        {/* Route order sidebar */}
        {orderedClients && orderedClients.length > 0 && (
          <div className="absolute top-3 right-3 z-[1000] bg-card border border-border rounded-xl shadow-lg w-64 max-h-[60vh] flex flex-col">
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
