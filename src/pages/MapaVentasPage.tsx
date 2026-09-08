import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Map as MapGL, Marker, Popup, NavigationControl, MapRef, Source, Layer } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import SearchableSelect from '@/components/SearchableSelect';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useVendedores } from '@/hooks/useClientes';
import { Link } from 'react-router-dom';
import { Filter, Truck, X, Calendar, Loader2, Navigation, Route, Info, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, todayInTimezone, zonedDayRangeISO } from '@/lib/utils';
import { deliveryMatchesStatusFilter, isPendingDeliveryThrough, wasDeliveredInRange } from '@/lib/supervisorDeliveryMetrics';
import { Badge } from '@/components/ui/badge';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { toast } from 'sonner';
import MyLocationMarkerML from '@/components/MyLocationMarkerML';
import LiveVendedoresLayerML from '@/components/LiveVendedoresLayerML';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';

// OpenFreeMap = tiles MapLibre gratuitos, sin API key, sin watermark.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const DEFAULT_CENTER = { lng: -102.5528, lat: 23.6345 };
type DeliveryMapFilter = 'pendientes' | 'entregadas' | 'todas' | 'sinGps';


export default function MapaVentasPage() {
  const { user, empresa } = useAuth();
  const today = todayInTimezone(empresa?.zona_horaria);
  const [fechaEntregas, setFechaEntregas] = useState(today);
  const [mapFilter, setMapFilter] = useState<DeliveryMapFilter>('pendientes');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [selectedEntrega, setSelectedEntrega] = useState<any | null>(null);
  const [originPoint, setOriginPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [settingOrigin, setSettingOrigin] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState<any | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ km: number; min: number } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const routeCacheRef = useRef<Map<string, { geometry: any; km: number; min: number }>>(new Map());
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
  useRealtimeInvalidate({ table: 'entregas', empresaId: empresa?.id, queryKeys: [['mapa-entregas']] });

  const completionRange = useMemo(
    () => zonedDayRangeISO(fechaEntregas, empresa?.zona_horaria),
    [fechaEntregas, empresa?.zona_horaria],
  );

  const { data: entregasData, isLoading: loadingEntregas } = useQuery({
    queryKey: ['mapa-entregas', empresa?.id, fechaEntregas, completionRange.start, completionRange.end, vendedorFilter],
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/supabasePaginate');
      const columns = 'id, folio, fecha, fecha_entrega, validado_at, status, orden_entrega, notas, cliente_id, vendedor_id, vendedor_ruta_id, clientes(id, nombre, codigo, gps_lat, gps_lng, direccion, colonia), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre), vendedor_ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre)';
      const withSeller = (query: any) => vendedorFilter
        ? query.or(`vendedor_id.eq.${vendedorFilter},vendedor_ruta_id.eq.${vendedorFilter}`)
        : query;

      const [completed, legacyCompleted, pending] = await Promise.all([
        fetchAllPages<any>((from, to) => withSeller(supabase
          .from('entregas')
          .select(columns)
          .eq('empresa_id', empresa!.id)
          .eq('status', 'hecho')
          .gte('fecha_entrega', completionRange.start)
          .lte('fecha_entrega', completionRange.end)
          .order('orden_entrega', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to))),
        fetchAllPages<any>((from, to) => withSeller(supabase
          .from('entregas')
          .select(columns)
          .eq('empresa_id', empresa!.id)
          .eq('status', 'hecho')
          .is('fecha_entrega', null)
          .gte('validado_at', completionRange.start)
          .lte('validado_at', completionRange.end)
          .order('orden_entrega', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to))),
        fetchAllPages<any>((from, to) => withSeller(supabase
          .from('entregas')
          .select(columns)
          .eq('empresa_id', empresa!.id)
          .not('status', 'in', '(hecho,cancelado,no_entregado)')
          .lte('fecha', fechaEntregas)
          .order('fecha', { ascending: true })
          .order('orden_entrega', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to))),
      ]);

      const unique = new Map<string, any>();
      [...completed, ...legacyCompleted, ...pending].forEach((row) => {
        if (wasDeliveredInRange(row, completionRange) || isPendingDeliveryThrough(row, fechaEntregas)) {
          unique.set(row.id, row);
        }
      });
      return [...unique.values()];
    },
    enabled: !!empresa?.id,
  });

  const visibleEntregas = useMemo(() => (entregasData ?? []).filter((entrega: any) => {
    if (mapFilter === 'sinGps') return !entrega.clientes?.gps_lat || !entrega.clientes?.gps_lng;
    return deliveryMatchesStatusFilter(entrega, mapFilter, fechaEntregas);
  }), [entregasData, mapFilter, fechaEntregas]);

  const entregasConGps = useMemo(() => {
    const filtered = visibleEntregas.filter((e: any) => e.clientes?.gps_lat && e.clientes?.gps_lng);
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
  }, [visibleEntregas]);

  const stats = useMemo(() => {
    const all = visibleEntregas;
    return {
      total: all.length,
      conGps: entregasConGps.length,
      sinGps: all.length - entregasConGps.length,
      entregadas: (entregasData ?? []).filter((e: any) => e.status === 'hecho').length,
      pendientes: (entregasData ?? []).filter((e: any) => isPendingDeliveryThrough(e, fechaEntregas)).length,
    };
  }, [visibleEntregas, entregasConGps, entregasData, fechaEntregas]);

  useEffect(() => {
    setSelectedEntrega((current: any) => current && entregasConGps.some((entrega: any) => entrega.id === current.id) ? current : null);
  }, [entregasConGps]);

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


  // Build ordered list of coordinates for ORS (origin -> entregas in client order)
  const routeCoords = useMemo<[number, number][]>(() => {
    const coords: [number, number][] = [];
    if (originPoint) coords.push([originPoint.lng, originPoint.lat]);
    entregasConGps.filter((e: any) => e.status !== 'hecho').forEach((e: any) => {
      coords.push([Number(e.clientes.gps_lng), Number(e.clientes.gps_lat)]);
    });
    return coords;
  }, [entregasConGps, originPoint]);

  // Fetch road-following polyline from ORS edge function (cached by coords signature)
  useEffect(() => {
    if (routeCoords.length < 2) {
      setRouteGeometry(null);
      setRouteInfo(null);
      return;
    }
    const key = routeCoords.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join('|');
    const cached = routeCacheRef.current.get(key);
    if (cached) {
      setRouteGeometry(cached.geometry);
      setRouteInfo({ km: cached.km, min: cached.min });
      return;
    }
    let cancelled = false;
    setLoadingRoute(true);
    supabase.functions
      .invoke('route-ors', { body: { coordinates: routeCoords } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.geometry) {
          console.error('ORS fetch error', error, data);
          setRouteGeometry(null);
          setRouteInfo(null);
          return;
        }
        const km = (data.distanceMeters ?? 0) / 1000;
        const min = (data.durationSeconds ?? 0) / 60;
        routeCacheRef.current.set(key, { geometry: data.geometry, km, min });
        setRouteGeometry(data.geometry);
        setRouteInfo({ km, min });
      })
      .finally(() => {
        if (!cancelled) setLoadingRoute(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeCoords]);

  const handleMapClick = useCallback((e: any) => {
    if (settingOrigin && e.lngLat) {
      setOriginPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setSettingOrigin(false);
      toast.success('Punto de partida establecido');
    }
  }, [settingOrigin]);



  const STATUS_COLORS: Record<string, string> = {
    borrador: '#64748b',
    listo: '#0ea5e9',
    surtido: '#3b82f6',
    asignado: '#f59e0b',
    cargado: '#8b5cf6',
    en_ruta: '#06b6d4',
    hecho: '#16a34a',
  };

  const activeFiltersCount = [vendedorFilter].filter(Boolean).length;

  return (
    <div className="h-[calc(100dvh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Truck className="h-4 w-4 text-primary" /> Mapa de entregas
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <OdooDatePicker value={fechaEntregas} onChange={v => setFechaEntregas(v)} />
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
            <button onClick={() => setOriginPoint(null)}
              className="text-xs text-destructive hover:underline py-2">
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {routeInfo && (
              <div className="bg-emerald-500/10 rounded-lg px-3 py-1.5 text-center flex items-center gap-2">
                {loadingRoute ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                ) : (
                  <Route className="h-3.5 w-3.5 text-emerald-600" />
                )}
                <div>
                  <div className="text-sm font-bold text-emerald-700 leading-tight">{routeInfo.km.toFixed(1)} km</div>
                  <div className="text-[10px] text-emerald-600 font-medium leading-tight">~{Math.round(routeInfo.min)} min</div>
                </div>
              </div>
            )}
            <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-primary">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground font-medium capitalize">{mapFilter === 'sinGps' ? 'Sin GPS' : mapFilter}</div>
            </div>
            <div className="flex flex-col text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-600" />{stats.entregadas} entregadas</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" />{stats.pendientes} pendientes</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" />{stats.conGps} en mapa</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-muted-foreground/40" />{stats.sinGps} sin GPS</span>
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
                onChange={val => setVendedorFilter(val)}
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


        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-2 rounded-lg">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Verde significa entregada realmente en la fecha elegida. Por entregar incluye los atrasos aún abiertos; la ruta azul se calcula únicamente con esos pendientes.</span>
        </div>
      </div>

      {/* Split: tabla izquierda + mapa derecha */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Panel izquierdo: tabla con tabs */}
        <div
          className={cn(
            "border-r border-border flex flex-col bg-card min-h-0 shrink-0 transition-all duration-300 ease-in-out",
            panelOpen ? "w-[420px]" : "w-0 overflow-hidden"
          )}
        >
          <PanelEntregas
            entregasData={entregasData ?? []}
            visibleEntregas={visibleEntregas}
            entregasConGps={entregasConGps}
            tab={mapFilter}
            setTab={setMapFilter}
            selectedEntrega={selectedEntrega}
            setSelectedEntrega={setSelectedEntrega}
            STATUS_COLORS={STATUS_COLORS}
            mapRef={mapRef}
          />
        </div>

        {/* Mapa derecha */}
        <div className="flex-1 relative min-h-0">
          {/* Botón toggle del panel (en el borde izquierdo del mapa = borde derecho del panel) */}
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="absolute top-3 left-0 z-20 bg-card border border-border rounded-r-md p-1.5 shadow-md hover:bg-accent transition-all"
            title={panelOpen ? "Ocultar panel" : "Mostrar panel"}
          >
            {panelOpen ? <ChevronLeft className="h-4 w-4 text-foreground" /> : <ChevronRight className="h-4 w-4 text-foreground" />}
          </button>
          {loadingEntregas && (
            <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center pointer-events-none">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {!loadingEntregas && entregasConGps.length === 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-lg border border-border bg-card/95 px-4 py-2 text-xs font-medium text-muted-foreground shadow-lg">
              {mapFilter === 'sinGps'
                ? `${visibleEntregas.length} entregas necesitan ubicación del cliente`
                : 'No hay entregas con GPS para este filtro'}
            </div>
          )}
          {settingOrigin && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse">
              Haz click en el mapa para establecer el punto de partida
            </div>
          )}
          <MapGL
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

            {/* Mi ubicación + vendedores en vivo */}
            <MyLocationMarkerML />
            <LiveVendedoresLayerML enabled={!!isAdmin} />

            {/* Ruta siguiendo calles reales (OpenRouteService) */}
            {routeGeometry && (
              <Source
                id="ors-route"
                type="geojson"
                data={{ type: 'Feature', properties: {}, geometry: routeGeometry }}
              >
                <Layer
                  id="ors-route-casing"
                  type="line"
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 7,
                    'line-opacity': 0.85,
                  }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="ors-route-line"
                  type="line"
                  paint={{
                    'line-color': '#2563eb',
                    'line-width': 4,
                    'line-opacity': 0.9,
                  }}
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

            {/* Entregas: numeradas por su orden definido en la ruta del cliente */}
            {entregasConGps.map((e: any, idx: number) => {
              const numero = idx + 1;
              const color = STATUS_COLORS[e.status] ?? '#714BF4';
              const isSelected = selectedEntrega?.id === e.id;
              const delivered = e.status === 'hecho';
              return (
                <Marker
                  key={e.id}
                  longitude={e._displayLng}
                  latitude={e._displayLat}
                  anchor="center"
                  onClick={(ev) => {
                    ev.originalEvent.stopPropagation();
                    setSelectedEntrega(e);
                  }}
                >
                  <div
                    className={cn(
                      "rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold cursor-pointer hover:scale-110 transition-transform",
                      isSelected && "ring-4 ring-primary/40 scale-125"
                    )}
                    style={{
                      backgroundColor: color,
                      width: 28,
                      height: 28,
                      fontSize: 11,
                    }}
                    title={`${delivered ? 'Entregada' : `#${numero}`} · ${e.folio} - ${e.clientes.nombre}`}
                  >
                    {delivered ? '✓' : numero}
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
                      {selectedEntrega.status === 'hecho' ? 'Entregada' : selectedEntrega.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 font-medium mb-0.5">{selectedEntrega.clientes?.nombre}</div>
                  {selectedEntrega.clientes?.direccion && <div className="text-xs text-gray-500 mb-1">{selectedEntrega.clientes.direccion}</div>}
                  {selectedEntrega.vendedor_ruta?.nombre && <div className="text-[10px] text-gray-400">Ruta: {selectedEntrega.vendedor_ruta.nombre}</div>}
                  <div className="text-[10px] text-gray-400">Programada: {selectedEntrega.fecha}</div>
                  {selectedEntrega.status === 'hecho' && (
                    <div className="text-[10px] font-medium text-green-700">
                      Entregada: {new Date(selectedEntrega.fecha_entrega ?? selectedEntrega.validado_at).toLocaleString('es-MX', { timeZone: empresa?.zona_horaria || 'America/Mexico_City' })}
                    </div>
                  )}
                  {selectedEntrega.orden_entrega > 0 && <div className="text-[10px] text-gray-400">Orden: #{selectedEntrega.orden_entrega}</div>}
                  <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
                    <Link to={`/logistica/entregas/${selectedEntrega.id}`} className="text-xs text-blue-600 hover:underline">Ver entrega</Link>
                  </div>
                </div>
              </Popup>
            )}
          </MapGL>

          <button
            onClick={handleRecenter}
            className="absolute bottom-6 left-3 z-10 bg-card border border-border rounded-full p-2.5 shadow-lg hover:bg-accent transition-colors"
            title="Centrar mapa"
          >
            <Navigation className="h-4 w-4 text-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Panel lateral: las pestañas controlan simultáneamente tabla y mapa.
// ============================================================
function PanelEntregas({
  entregasData,
  visibleEntregas,
  entregasConGps,
  tab,
  setTab,
  selectedEntrega,
  setSelectedEntrega,
  STATUS_COLORS,
  mapRef,
}: {
  entregasData: any[];
  visibleEntregas: any[];
  entregasConGps: any[];
  tab: DeliveryMapFilter;
  setTab: (tab: DeliveryMapFilter) => void;
  selectedEntrega: any | null;
  setSelectedEntrega: (e: any) => void;
  STATUS_COLORS: Record<string, string>;
  mapRef: React.MutableRefObject<MapRef | null>;
}) {
  const sinGps = useMemo(
    () => (entregasData ?? []).filter((e: any) => !e.clientes?.gps_lat || !e.clientes?.gps_lng),
    [entregasData]
  );

  // Las entregas ya vienen ordenadas por `orden_entrega` (definido en la ruta del cliente)
  const filaList: any[] = useMemo(() => {
    if (tab === 'sinGps') return sinGps;
    const positioned = new Map(entregasConGps.map((entrega: any) => [entrega.id, entrega]));
    return visibleEntregas.map((entrega: any) => positioned.get(entrega.id) ?? entrega);
  }, [tab, visibleEntregas, entregasConGps, sinGps]);

  const handleRowClick = (e: any) => {
    setSelectedEntrega(e);
    if (mapRef.current && e._displayLat && e._displayLng) {
      mapRef.current.flyTo({ center: [e._displayLng, e._displayLat], zoom: 15, duration: 600 });
    }
  };

  const tabs = [
    { id: 'pendientes' as const, label: 'Por entregar', count: entregasData.filter((e: any) => e.status !== 'hecho').length, icon: Route },
    { id: 'entregadas' as const, label: 'Entregadas', count: entregasData.filter((e: any) => e.status === 'hecho').length, icon: Truck },
    { id: 'todas' as const, label: 'Todas', count: entregasData.length, icon: Truck },
    { id: 'sinGps' as const, label: 'Sin GPS', count: sinGps.length, icon: MapPin },
  ];


  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-border bg-card shrink-0">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 min-w-0 flex items-center justify-center gap-1 px-1 py-2.5 text-[10px] font-medium border-b-2 transition-colors",
                active ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{t.label}</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>




      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {filaList.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {tab === 'sinGps' ? 'Todas las entregas tienen GPS 🎉' : 'No hay entregas para mostrar'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left w-8">#</th>
                <th className="px-2 py-2 text-left">Folio / Cliente</th>
                <th className="px-2 py-2 text-left w-16">Est.</th>
                <th className="px-2 py-2 text-left w-20">Ruta</th>
                <th className="px-1 py-2 text-right w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filaList.map((e: any, idx: number) => {
                const isSelected = selectedEntrega?.id === e.id;
                const hasGps = !!(e.clientes?.gps_lat && e.clientes?.gps_lng);
                const delivered = e.status === 'hecho';
                return (
                  <tr
                    key={e.id}
                    onClick={() => hasGps && handleRowClick(e)}
                    className={cn(
                      "border-b border-border/40 transition-colors",
                      hasGps ? "cursor-pointer hover:bg-accent/50" : "opacity-70",
                      isSelected && "bg-primary/10"
                    )}
                  >
                    <td className="px-2 py-2">
                      {hasGps ? (
                        <div className={cn("w-6 h-6 rounded-full text-white flex items-center justify-center text-[11px] font-bold", delivered ? "bg-green-600" : "bg-primary")}>
                          {delivered ? '✓' : idx + 1}
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[11px] font-bold">
                          ?
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 min-w-0">
                      <div className="font-mono text-[10px] text-muted-foreground">{e.folio}</div>
                      <div className="font-medium text-foreground truncate max-w-[150px]">{e.clientes?.nombre}</div>
                      {e.clientes?.direccion && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">{e.clientes.direccion}</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{ backgroundColor: `${STATUS_COLORS[e.status]}20`, color: STATUS_COLORS[e.status] }}
                      >
                        {delivered ? 'Entregada' : e.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[80px] text-[10px]">
                      {e.vendedor_ruta?.nombre ?? e.vendedores?.nombre ?? '—'}
                    </td>
                    <td className="px-1 py-2 text-right">
                      <Link
                        to={`/logistica/entregas/${e.id}`}
                        onClick={(ev) => ev.stopPropagation()}
                        className="text-primary hover:underline text-[10px]"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
