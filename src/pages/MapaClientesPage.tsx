import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { useClientes, useZonas, useVendedores } from '@/hooks/useClientes';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Filter, MapPin, X, Users, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useGoogleMapsKey } from '@/hooks/useGoogleMapsKey';

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

export default function MapaClientesPage() {
  const { user } = useAuth();
  const { apiKey, loading: loadingKey } = useGoogleMapsKey();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [diaFilter, setDiaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ duration?: string; distance_meters?: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? '',
    id: 'google-map-clientes',
  });

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
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [withGps]);

  const handleOptimize = async () => {
    if (withGps.length < 2) { toast.error('Se necesitan al menos 2 clientes con GPS'); return; }
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error('Sesión no válida'); return; }

      const waypoints = withGps.map((c: any) => ({ id: c.id, lat: c.gps_lat, lng: c.gps_lng }));
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/optimize-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ waypoints, dia_filtro: diaFilter || null }),
      });

      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Error al optimizar'); return; }

      const updates = result.optimized_order.map((id: string, idx: number) =>
        supabase.from('clientes').update({ orden: idx + 1 }).eq('id', id)
      );
      await Promise.all(updates);

      setOptimizeResult({ duration: result.duration, distance_meters: result.distance_meters });
      toast.success(`Ruta optimizada: ${(result.distance_meters / 1000).toFixed(1)} km`);
    } catch (err: any) {
      toast.error(err.message || 'Error al optimizar ruta');
    } finally {
      setOptimizing(false);
    }
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

  if (loadingKey || !apiKey) {
    return (
      <div className="h-[calc(100vh-theme(spacing.9))] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-primary" />{withGps.length} con GPS</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-muted-foreground/40" />{withoutGps.length} sin GPS</span>
            {optimizeResult?.distance_meters && (
              <span className="text-emerald-600 font-medium">{(optimizeResult.distance_meters / 1000).toFixed(1)} km</span>
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
              <select value={diaFilter} onChange={e => setDiaFilter(e.target.value)}
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
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {(isLoading || !isLoaded) && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={withGps.length > 0 ? { lat: withGps[0].gps_lat, lng: withGps[0].gps_lng } : defaultCenter}
            zoom={6}
            onLoad={onMapLoad}
            options={{
              styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
            }}
          >
            {withGps.map((c: any) => (
              <Marker
                key={c.id}
                position={{ lat: c.gps_lat, lng: c.gps_lng }}
                icon={getMarkerIcon(c)}
                onClick={() => setSelectedCliente(c)}
                title={c.nombre}
              />
            ))}

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

        {/* Clients without GPS sidebar */}
        {withoutGps.length > 0 && (
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
