import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Navigation, Phone, Check, ShoppingCart, Truck, MapPin, ChevronUp, X, CornerUpLeft, CornerUpRight, ArrowUp, RotateCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { useGoogleMaps, GoogleMapsProvider } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, DirectionsRenderer, MarkerF } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import MapRecenterButton from '@/components/MapRecenterButton';
import { toast } from 'sonner';

/** Pick an icon for a maneuver instruction */
function ManeuverIcon({ maneuver }: { maneuver?: string }) {
  if (!maneuver) return <ArrowUp className="h-7 w-7" />;
  if (maneuver.includes('left')) return <CornerUpLeft className="h-7 w-7" />;
  if (maneuver.includes('right')) return <CornerUpRight className="h-7 w-7" />;
  if (maneuver.includes('uturn') || maneuver.includes('u-turn')) return <RotateCw className="h-7 w-7" />;
  return <ArrowUp className="h-7 w-7" />;
}

/** Strip HTML tags from directions instructions */
function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, '');
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIA_HOY = DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

interface Stop {
  id: string;
  nombre: string;
  direccion?: string;
  colonia?: string;
  telefono?: string;
  gps_lat: number;
  gps_lng: number;
  folio?: string;
  tipo: 'cliente' | 'entrega';
  orden: number;
  entregaRef?: any;
}

function NavegacionContent({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { empresa, profile } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [arrivedIds, setArrivedIds] = useState<Set<string>>(new Set());
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const { mutate: offlineMutate } = useOfflineMutation();
  const vendedorId = profile?.vendedor_id;

  // Watch user location
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Fetch clients for today
  const { data: clientesData } = useQuery({
    queryKey: ['nav-clientes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, direccion, colonia, telefono, dia_visita, gps_lat, gps_lng, orden')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('orden', { ascending: true });
      return (data ?? []).filter(c =>
        c.dia_visita?.some((d: string) => d.toLowerCase() === DIA_HOY.toLowerCase()) && c.gps_lat && c.gps_lng
      );
    },
  });

  // Fetch entregas
  const { data: allEntregas, refetch: refetchEntregas } = useOfflineQuery('entregas', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id, orderBy: 'orden_entrega' });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, {
    enabled: !!empresa?.id,
  });

  const clienteMap = useMemo(() => new Map((clientes ?? []).map((c: any) => [c.id, c])), [clientes]);

  // Build unified stops: clients + entregas merged, avoiding duplicates (same client GPS)
  const stops: Stop[] = useMemo(() => {
    const clientStops: Stop[] = (clientesData ?? []).map((c, i) => ({
      id: `cli-${c.id}`, nombre: c.nombre,
      direccion: c.direccion ?? undefined, colonia: c.colonia ?? undefined,
      telefono: c.telefono ?? undefined,
      gps_lat: c.gps_lat!, gps_lng: c.gps_lng!, tipo: 'cliente' as const,
      orden: c.orden ?? i,
    }));

    const entregaStops: Stop[] = (allEntregas ?? [])
      .filter((e: any) =>
        (e.status === 'cargado' || e.status === 'en_ruta') &&
        (e.vendedor_ruta_id === vendedorId || e.vendedor_id === vendedorId)
      )
      .sort((a: any, b: any) => (a.orden_entrega ?? 999) - (b.orden_entrega ?? 999))
      .map((e: any) => {
        const cliente = clienteMap.get(e.cliente_id);
        return {
          id: `ent-${e.id}`, nombre: cliente?.nombre ?? 'Sin cliente',
          direccion: cliente?.direccion ?? undefined, colonia: cliente?.colonia ?? undefined,
          telefono: cliente?.telefono ?? undefined,
          gps_lat: cliente?.gps_lat ?? 0, gps_lng: cliente?.gps_lng ?? 0,
          folio: e.folio, tipo: 'entrega' as const,
          orden: e.orden_entrega ?? 999,
          entregaRef: e,
        };
      })
      .filter(s => s.gps_lat !== 0 && s.gps_lng !== 0);

    // Merge: entregas first (priority), then client visits
    const all = [...entregaStops, ...clientStops];
    // Sort by orden
    all.sort((a, b) => a.orden - b.orden);
    return all;
  }, [clientesData, allEntregas, vendedorId, clienteMap]);

  const completedCount = completedIds.size;
  const totalCount = stops.length;
  const activeStop = stops.find(s => s.id === activeStopId) ?? null;
  const navigatingStop = stops.find(s => s.id === navigatingTo) ?? null;

  // Calculate directions when navigating
  useEffect(() => {
    if (!isLoaded || !navigatingStop || !userLocation) {
      setDirections(null);
      return;
    }
    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin: userLocation,
        destination: { lat: navigatingStop.gps_lat, lng: navigatingStop.gps_lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
          // Zoom in to user location at street level (like Google Maps nav)
          if (mapRef.current && userLocation) {
            mapRef.current.setCenter(userLocation);
            mapRef.current.setZoom(17);
          }
        } else {
          setDirections(null);
        }
      }
    );
  }, [isLoaded, navigatingTo, userLocation?.lat, userLocation?.lng]);

  // Fit map to show all markers initially
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (stops.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      stops.forEach(s => bounds.extend({ lat: s.gps_lat, lng: s.gps_lng }));
      if (userLocation) bounds.extend(userLocation);
      map.fitBounds(bounds, 60);
    }
  }, [stops, userLocation]);

  const startNavigation = (stop: Stop) => {
    setNavigatingTo(stop.id);
    setActiveStopId(stop.id);
    setCurrentStepIdx(0);
    setPanelOpen(true);
    // Initial center on user while directions load
    if (mapRef.current && userLocation) {
      mapRef.current.setCenter(userLocation);
      mapRef.current.setZoom(17);
    }
  };

  const recenterMap = useCallback(() => {
    if (mapRef.current && stops.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      stops.forEach(s => bounds.extend({ lat: s.gps_lat, lng: s.gps_lng }));
      if (userLocation) bounds.extend(userLocation);
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [stops, userLocation]);

  const stopNavigation = () => {
    setNavigatingTo(null);
    setDirections(null);
    setCurrentStepIdx(0);
    recenterMap();
  };

  const handleArrived = (stop: Stop) => {
    setArrivedIds(prev => new Set([...prev, stop.id]));
    stopNavigation();
    setActiveStopId(stop.id);
    setPanelOpen(true);
    toast.success(`¡Llegaste a ${stop.nombre}!`);
    // Center map on the stop
    if (mapRef.current) {
      mapRef.current.setCenter({ lat: stop.gps_lat, lng: stop.gps_lng });
      mapRef.current.setZoom(17);
    }
  };

  const handleVisited = async (stop: Stop) => {
    if (stop.tipo === 'entrega' && stop.entregaRef) {
      await offlineMutate('entregas', 'update', {
        ...stop.entregaRef, status: 'hecho', validado_at: new Date().toISOString(),
      });
      refetchEntregas();
    }
    setCompletedIds(prev => new Set([...prev, stop.id]));
    toast.success(stop.tipo === 'entrega' ? '¡Entregado!' : '¡Visitado!');
    setActiveStopId(null);

    // Auto-navigate to next
    const currentStopIdx = stops.findIndex(s => s.id === stop.id);
    const nextStop = stops.find((s, i) => i > currentStopIdx && !completedIds.has(s.id) && s.id !== stop.id);
    if (nextStop) {
      setTimeout(() => startNavigation(nextStop), 600);
    }
  };

  const handleSaleAndVisit = (stop: Stop) => {
    setCompletedIds(prev => new Set([...prev, stop.id]));
    const realClientId = stop.id.replace('cli-', '');
    navigate(`/ruta/ventas/nueva?clienteId=${realClientId}`);
  };

  const leg = directions?.routes?.[0]?.legs?.[0];
  const steps = leg?.steps ?? [];
  const currentStep = steps[currentStepIdx];
  const nextStep = steps[currentStepIdx + 1];

  // Auto-advance step based on user proximity
  useEffect(() => {
    if (!userLocation || steps.length === 0) return;
    // Find closest upcoming step
    for (let i = currentStepIdx; i < steps.length; i++) {
      const endLat = steps[i].end_location.lat();
      const endLng = steps[i].end_location.lng();
      const dist = Math.sqrt(
        Math.pow((userLocation.lat - endLat) * 111000, 2) +
        Math.pow((userLocation.lng - endLng) * 111000 * Math.cos(userLocation.lat * Math.PI / 180), 2)
      );
      if (dist < 30 && i > currentStepIdx) {
        setCurrentStepIdx(i);
        break;
      }
    }
  }, [userLocation, steps, currentStepIdx]);

  // Keep camera centered on user's blue dot while navigating (Google Maps-like)
  useEffect(() => {
    if (!navigatingTo || !userLocation || !mapRef.current) return;
    mapRef.current.setCenter(userLocation);
    mapRef.current.setZoom(17);
  }, [navigatingTo, userLocation?.lat, userLocation?.lng]);

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
          <button onClick={() => navigate('/ruta')} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
          <h1 className="text-base font-bold text-foreground">Navegación</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <Navigation className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No hay paradas con GPS</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {/* FULL SCREEN MAP */}
      {isLoaded && (
        <GoogleMap
          onLoad={onMapLoad}
          center={navigatingTo && userLocation ? userLocation : (stops[0] ? { lat: stops[0].gps_lat, lng: stops[0].gps_lng } : undefined)}
          zoom={navigatingTo && userLocation ? 17 : 13}
          mapContainerStyle={{ width: '100%', height: '100%' }}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
            gestureHandling: 'greedy',
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            ],
          }}
        >
          {/* Route when navigating */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: { strokeColor: '#4285F4', strokeWeight: 5, strokeOpacity: 0.9 },
              }}
            />
          )}

          {/* User location */}
          {userLocation && (
            <MarkerF
              position={userLocation}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              }}
            />
          )}

          {/* Stop markers */}
          {stops.map((stop, idx) => {
            const isCompleted = completedIds.has(stop.id);
            const isNavigating = navigatingTo === stop.id;
            return (
              <MarkerF
                key={stop.id}
                position={{ lat: stop.gps_lat, lng: stop.gps_lng }}
                label={{
                  text: isCompleted ? '✓' : `${idx + 1}`,
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '12px',
                }}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                  fillColor: isCompleted ? '#22c55e' : isNavigating ? '#ef4444' : stop.tipo === 'entrega' ? '#f59e0b' : '#6366f1',
                  fillOpacity: isCompleted ? 0.5 : 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                  scale: isNavigating ? 2 : 1.5,
                  anchor: new google.maps.Point(12, 22),
                  labelOrigin: new google.maps.Point(12, 9),
                }}
                onClick={() => {
                  if (!isCompleted) {
                    setActiveStopId(stop.id);
                    setPanelOpen(true);
                  }
                }}
              />
            );
          })}
        </GoogleMap>
      )}
      <MapRecenterButton onClick={recenterMap} className="bottom-24 left-3" />

      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
        {navigatingStop && currentStep ? (
          /* TURN-BY-TURN NAVIGATION BAR */
          <div className="mx-3 space-y-2">
            {/* Main instruction */}
            <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
              <ManeuverIcon maneuver={(currentStep as any).maneuver} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold leading-tight">
                  {stripHtml(currentStep.instructions)}
                </p>
                <p className="text-[12px] opacity-80 mt-0.5">
                  {currentStep.distance?.text} · {currentStep.duration?.text}
                </p>
              </div>
              <button onClick={stopNavigation} className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Next step preview + ETA */}
            <div className="mx-1 bg-card/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 flex items-center gap-2 shadow-sm">
              {nextStep && (
                <p className="text-[11px] text-muted-foreground flex-1 truncate">
                  Después: {stripHtml(nextStep.instructions)}
                </p>
              )}
              {leg && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Navigation className="h-3 w-3 text-primary" />
                  <span className="text-[12px] font-semibold text-foreground">{leg.duration?.text}</span>
                  <span className="text-[11px] text-muted-foreground">{leg.distance?.text}</span>
                </div>
              )}
            </div>
          </div>
        ) : navigatingStop ? (
          /* Navigating but no steps yet (loading) */
          <div className="mx-3 bg-primary text-primary-foreground rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <Navigation className="h-7 w-7 animate-pulse" />
            <div className="flex-1">
              <p className="text-[15px] font-bold">{navigatingStop.nombre}</p>
              <p className="text-[12px] opacity-80">Calculando ruta...</p>
            </div>
            <button onClick={stopNavigation} className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* Default: overview bar */
          <div className="mx-3 bg-card/90 backdrop-blur-md border border-border rounded-2xl px-3 py-2.5 flex items-center gap-3 shadow-lg">
            <button onClick={() => navigate('/ruta')} className="p-1 -ml-0.5">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-foreground">
                Mi ruta
              </p>
              <p className="text-[11px] text-muted-foreground">
                {completedCount}/{totalCount} completadas
              </p>
            </div>
            <div className="flex gap-0.5">
              {stops.slice(0, 12).map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "w-2 h-2 rounded-full",
                    completedIds.has(s.id)
                      ? "bg-emerald-500"
                      : navigatingTo === s.id
                        ? "bg-destructive"
                        : "bg-muted-foreground/30"
                  )}
                />
              ))}
              {stops.length > 12 && (
                <span className="text-[9px] text-muted-foreground ml-0.5">+{stops.length - 12}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* NAVIGATION ACTION BAR — "Llegué" button when navigating */}
      {navigatingStop && !completedIds.has(navigatingStop.id) && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-3 bg-card/95 backdrop-blur-md border border-border rounded-2xl p-3 shadow-lg space-y-2.5">
            {/* Stop info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center font-bold text-sm shrink-0">
                {stops.findIndex(s => s.id === navigatingStop.id) + 1}
              </div>
              <div className="flex-1 min-w-0">
                {navigatingStop.folio && <p className="text-[10px] font-mono text-muted-foreground">{navigatingStop.folio}</p>}
                <p className="text-[15px] font-bold text-foreground truncate">{navigatingStop.nombre}</p>
                {(navigatingStop.direccion || navigatingStop.colonia) && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    <MapPin className="h-3 w-3 inline mr-0.5" />
                    {[navigatingStop.direccion, navigatingStop.colonia].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              {navigatingStop.telefono && (
                <a href={`tel:${navigatingStop.telefono}`}
                  className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 active:scale-90 transition-transform shrink-0">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>

            {/* BIG "Llegué" button */}
            <Button onClick={() => handleArrived(navigatingStop)} className="w-full rounded-xl gap-2 h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
              <MapPin className="h-5 w-5" /> ¡Llegué!
            </Button>
          </div>
        </div>
      )}

      {/* ARRIVED CARD — after pressing "Llegué", shows Vender / Sin compra / Llamar */}
      {!navigatingTo && activeStop && arrivedIds.has(activeStop.id) && !completedIds.has(activeStop.id) && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-3 bg-card/95 backdrop-blur-md border border-border rounded-2xl p-3 shadow-lg space-y-2.5">
            {/* Stop info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                <Check className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Estás aquí</p>
                <p className="text-[15px] font-bold text-foreground truncate">{activeStop.nombre}</p>
                {(activeStop.direccion || activeStop.colonia) && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    <MapPin className="h-3 w-3 inline mr-0.5" />
                    {[activeStop.direccion, activeStop.colonia].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              {activeStop.telefono && (
                <a href={`tel:${activeStop.telefono}`}
                  className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 active:scale-90 transition-transform shrink-0">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {activeStop.tipo === 'cliente' ? (
                <>
                  <Button onClick={() => handleSaleAndVisit(activeStop)} className="flex-1 rounded-xl gap-2 h-12 text-sm">
                    <ShoppingCart className="h-4 w-4" /> Vender
                  </Button>
                  <Button variant="outline" onClick={() => handleVisited(activeStop)} className="flex-1 rounded-xl gap-2 h-12 text-sm">
                    <Check className="h-4 w-4" /> Sin compra
                  </Button>
                </>
              ) : (
                <Button onClick={() => handleVisited(activeStop)} className="flex-1 rounded-xl gap-2 h-12 text-sm">
                  <Truck className="h-4 w-4" /> Marcar entregado
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET — stop list (when NOT navigating and no arrived card showing) */}
      {!navigatingTo && !(activeStop && arrivedIds.has(activeStop.id) && !completedIds.has(activeStop.id)) && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(0rem,env(safe-area-inset-bottom))]">
          {/* Toggle handle */}
          <div className="flex justify-center">
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="bg-card/90 backdrop-blur-md border border-border border-b-0 rounded-t-xl px-6 py-1.5"
            >
              <ChevronUp className={cn("h-4 w-4 text-muted-foreground transition-transform", panelOpen ? "rotate-180" : "")} />
            </button>
          </div>

          <div className={cn(
            "bg-card/95 backdrop-blur-md border-t border-border transition-all duration-300 overflow-hidden",
            panelOpen ? "max-h-[45vh]" : "max-h-0"
          )}>
            <div className="overflow-auto max-h-[45vh]">
              {stops.map((stop, idx) => {
                const isCompleted = completedIds.has(stop.id);
                return (
                  <button
                    key={stop.id}
                    disabled={isCompleted}
                    onClick={() => startNavigation(stop)}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-3 border-b border-border/50 text-left transition-colors",
                      isCompleted ? "opacity-40" : "active:bg-card"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                      isCompleted
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : stop.tipo === 'entrega' ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : stop.tipo === 'entrega' ? <Truck className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {stop.folio && <span className="text-[10px] font-mono text-muted-foreground">{stop.folio}</span>}
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                          stop.tipo === 'entrega' ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
                        )}>
                          {stop.tipo === 'entrega' ? 'Entrega' : 'Visita'}
                        </span>
                      </div>
                      <p className={cn("text-sm font-medium truncate", isCompleted ? "line-through text-muted-foreground" : "text-foreground")}>
                        {stop.nombre}
                      </p>
                      {(stop.direccion || stop.colonia) && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[stop.direccion, stop.colonia].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    {!isCompleted && (
                      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                        <Navigation className="h-4 w-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RutaNavegacionPage({ embedded, onBack }: { embedded?: boolean; onBack?: () => void }) {
  return (
    <GoogleMapsProvider blocking>
      <NavegacionContent onBack={onBack} />
    </GoogleMapsProvider>
  );
}
