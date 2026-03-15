import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Marker, InfoWindow, Polyline } from '@react-google-maps/api';
import { useClientes, useZonas, useVendedores } from '@/hooks/useClientes';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Filter, MapPin, X, Users, Loader2, CheckCircle2, Navigation, Route, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useGoogleMaps } from '@/hooks/useGoogleMapsKey';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIA_HOY = new Date().toLocaleDateString('es-MX', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase());

const COLORS: Record<string, string> = {
  activo: '#22c55e',
  inactivo: '#9ca3af',
  suspendido: '#ef4444',
  default: '#6366f1',
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

export default function MapaClientesPage() {
  const { user } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [diaFilter, setDiaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
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

  const { data: clientes, isLoading } = useClientes(search, statusFilter || undefined);
  const { data: zonas } = useZonas();
  const { data: vendedores } = useVendedores();

  const filtered = useMemo(() => {
    let result = clientes ?? [];
    if (zonaFilter) result = result.filter((c: any) => c.zona_id === zonaFilter);
    if (vendedorFilter) result = result.filter((c: any) => c.vendedor_id === vendedorFilter);
    if (diaFilter) result = result.filter((c: any) => c.dia_visita?.includes(diaFilter));
    return result;
  }, [clientes, zonaFilter, vendedorFilter, diaFilter]);

  const withGps = useMemo(() => filtered.filter((c: any) => c.gps_lat && c.gps_lng), [filtered]);
  const withoutGps = useMemo(() => filtered.filter((c: any) => !c.gps_lat || !c.gps_lng), [filtered]);

  const activeFiltersCount = [zonaFilter, vendedorFilter, diaFilter, statusFilter].filter(Boolean).length;

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

  const orderedClients = useMemo(() => {
    if (!routeResult) return null;
    return routeResult.orderedIds.map(id => withGps.find((c: any) => c.id === id)).filter(Boolean);
  }, [routeResult, withGps]);

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
    if (withGps.length < 2) { toast.error('Se necesitan al menos 2 clientes con GPS'); return; }
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

  const getMarkerIcon = (cliente: any) => {
    const status = cliente.status ?? 'activo';
    const isToday = cliente.dia_visita?.includes(DIA_HOY);
    const color = isToday ? COLORS.activo : COLORS[status] ?? COLORS.default;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2,
      scale: 10,
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


  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Mapa de clientes</h1>
          </div>
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar cliente..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
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
          {isAdmin && originPoint && withGps.length >= 2 && (
            <button onClick={handleOptimize} disabled={optimizing}
              className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
                routeResult ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
                optimizing && "opacity-70")}>
              {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : routeResult ? <CheckCircle2 className="h-4 w-4" /> : <Route className="h-4 w-4" />}
              {optimizing ? 'Optimizando...' : routeResult ? 'Ruta optimizada' : 'Optimizar ruta'}
            </button>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground ml-auto">
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-primary" />{withGps.length} con GPS</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-muted-foreground/40" />{withoutGps.length} sin GPS</span>
            {routeResult && (
              <>
                <span className="text-emerald-600 font-semibold">{(routeResult.distance_meters / 1000).toFixed(1)} km</span>
                <span className="text-emerald-600">{formatDuration(routeResult.duration)}</span>
              </>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Zona</label>
              <select value={zonaFilter} onChange={e => setZonaFilter(e.target.value)}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todas</option>
                {zonas?.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Vendedor</label>
              <select value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Día de visita</label>
              <select value={diaFilter} onChange={e => { setDiaFilter(e.target.value); setRouteResult(null); }}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="suspendido">Suspendido</option>
              </select>
            </div>
            {activeFiltersCount > 0 && (
              <button onClick={() => { setZonaFilter(''); setVendedorFilter(''); setDiaFilter(''); setStatusFilter(''); }}
                className="self-end flex items-center gap-1 text-xs text-destructive hover:underline py-1.5">
                <X className="h-3 w-3" /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!originPoint && !routeResult && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-2 rounded-lg">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Filtra por zona, vendedor o día, luego haz click en <strong>"Punto de partida"</strong> y selecciona en el mapa desde dónde iniciar. Después presiona <strong>"Optimizar ruta"</strong>.</span>
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

            {/* Markers */}
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
              withGps.map((c: any) => (
                <Marker
                  key={c.id}
                  position={{ lat: c.gps_lat, lng: c.gps_lng }}
                  icon={getMarkerIcon(c)}
                  onClick={() => setSelectedCliente(c)}
                  title={c.nombre}
                />
              ))
            )}

            {selectedCliente && (
              <InfoWindow
                position={{ lat: selectedCliente.gps_lat, lng: selectedCliente.gps_lng }}
                onCloseClick={() => setSelectedCliente(null)}
              >
                <div className="min-w-[200px] p-1">
                  <div className="font-bold text-sm mb-1">{selectedCliente.nombre}</div>
                  {selectedCliente.codigo && <div className="text-xs text-gray-500 font-mono mb-1">{selectedCliente.codigo}</div>}
                  {selectedCliente.direccion && <div className="text-xs text-gray-600 mb-2">{selectedCliente.direccion}{selectedCliente.colonia ? `, ${selectedCliente.colonia}` : ''}</div>}
                  {selectedCliente.dia_visita?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {selectedCliente.dia_visita.map((d: string) => (
                        <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${d === DIA_HOY ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {d.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <Link to={`/clientes/${selectedCliente.id}`} className="text-xs text-blue-600 hover:underline">Ver ficha</Link>
                    {selectedCliente.telefono && <a href={`tel:${selectedCliente.telefono}`} className="text-xs text-green-600 hover:underline">Llamar</a>}
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedCliente.gps_lat},${selectedCliente.gps_lng}`}
                      target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Navegar</a>
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

        {/* Clients without GPS sidebar */}
        {!orderedClients && withoutGps.length > 0 && (
          <div className="absolute top-3 right-3 z-10 bg-card border border-border rounded-xl shadow-lg w-64 max-h-[60vh] flex flex-col">
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
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
      </div>
    </div>
  );
}
