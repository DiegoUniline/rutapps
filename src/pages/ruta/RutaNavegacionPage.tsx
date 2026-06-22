import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Navigation, Phone, Check, ShoppingCart, Truck, MapPin, ChevronUp, X, CornerUpLeft, CornerUpRight, ArrowUp, RotateCw, CalendarDays, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { useGoogleMaps, GoogleMapsProvider } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, DirectionsRenderer, MarkerF, Polyline } from '@react-google-maps/api';
import { haversine as geoHaversine, bearing as geoBearing, projectToPolyline, remainingDistance, splitPolylineAt, animatePosition, type LatLng as GeoLatLng } from '@/lib/routeGeometry';
import { Button } from '@/components/ui/button';
import { cn, todayLocal } from '@/lib/utils';
import MapRecenterButton from '@/components/MapRecenterButton';
import { toast } from 'sonner';
import { useClienteOrdenRuta } from '@/hooks/useClienteOrdenRuta';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';
import { clienteTieneDia, diaFromDate } from '@/lib/rutaDays';

/* ─── Voice Navigation ─── */
const speak = (text: string) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'es-MX';
  utt.rate = 1.05;
  utt.pitch = 1;
  // Try to pick a Spanish voice
  const voices = window.speechSynthesis.getVoices();
  const esVoice = voices.find(v => v.lang.startsWith('es'));
  if (esVoice) utt.voice = esVoice;
  window.speechSynthesis.speak(utt);
};

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
  hasOrden: boolean;
  entregaRef?: any;
}

function NavegacionContent({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate();
  const { user, empresa, profile, overrideVendedorId } = useAuth();
  const { clientesVisibilidad } = useDataVisibility('clientes');
  const { isLoaded } = useGoogleMaps();
  const [filterDate, setFilterDate] = useState(todayLocal());
  const filterDia = diaFromDate(filterDate);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);

  // Super-admin: override read from global context (set in MobileLayout bar)
  const isSuperAdmin = isSuperAdminEmail(user?.email);
  const superVendedorId = isSuperAdmin ? overrideVendedorId : null;

  // Persist completed/arrived across navigation using sessionStorage keyed by date
  const storageKeyCompleted = `nav-completed-${filterDate}`;
  const storageKeyArrived = `nav-arrived-${filterDate}`;

  const [completedIds, setCompletedIdsRaw] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKeyCompleted);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [arrivedIds, setArrivedIdsRaw] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKeyArrived);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const setCompletedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setCompletedIdsRaw(prev => {
      const next = updater(prev);
      try { sessionStorage.setItem(storageKeyCompleted, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [storageKeyCompleted]);

  const setArrivedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setArrivedIdsRaw(prev => {
      const next = updater(prev);
      try { sessionStorage.setItem(storageKeyArrived, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [storageKeyArrived]);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const { mutate: offlineMutate } = useOfflineMutation();
  const vendedorId = (isSuperAdmin && superVendedorId) ? superVendedorId : profile?.id;
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const lastSpokenStepRef = useRef(-1);
  const followUserRef = useRef(true);

  // ─── Uber-like live navigation refs (todo local, cero llamadas a Google por tick) ───
  const lastRouteOriginRef = useRef<GeoLatLng | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const currentRoutePathRef = useRef<GeoLatLng[] | null>(null);
  const renderedPosRef = useRef<GeoLatLng | null>(null);
  const animCancelRef = useRef<(() => void) | null>(null);
  const speedHistoryRef = useRef<number[]>([]);
  const lastTickAtRef = useRef<number>(0);
  const lastUploadAtRef = useRef<number>(0);
  const [renderedPos, setRenderedPos] = useState<GeoLatLng | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number>(0);
  const [traveledPath, setTraveledPath] = useState<GeoLatLng[]>([]);
  const [remainingPath, setRemainingPath] = useState<GeoLatLng[]>([]);
  const [liveEtaMin, setLiveEtaMin] = useState<number | null>(null);
  const [liveRemKm, setLiveRemKm] = useState<number | null>(null);

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

  // Fetch clients for today (respecting visibility — same logic as RutaClientes).
  // Super admin: filter by chosen vendedor (if any) instead of profile.id.
  const { data: clientesData } = useQuery({
    queryKey: ['nav-clientes', empresa?.id, filterDia, profile?.id, clientesVisibilidad, isSuperAdmin ? superVendedorId : null],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, direccion, colonia, telefono, dia_visita, gps_lat, gps_lng, orden, vendedor_id')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('orden', { ascending: true });
      return (data ?? []).filter(c => {
        // Super admin override: only show clients of chosen vendedor
        if (isSuperAdmin && superVendedorId) {
          if (c.vendedor_id !== superVendedorId) return false;
        } else if (clientesVisibilidad === 'propios' && profile?.id) {
          if (c.vendedor_id !== profile.id) return false;
        }
        return clienteTieneDia(c, filterDia) && c.gps_lat && c.gps_lng;
      });
    },
  });

  // Saved optimization order (same source the desktop map uses)
  const { ordenMap } = useClienteOrdenRuta(vendedorId, filterDia);

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
    const clientStops: Stop[] = (clientesData ?? [])
      .map((c, i) => {
        const ord = ordenMap.get(c.id);
        return {
          id: `cli-${c.id}`, nombre: c.nombre,
          direccion: c.direccion ?? undefined, colonia: c.colonia ?? undefined,
          telefono: c.telefono ?? undefined,
          gps_lat: c.gps_lat!, gps_lng: c.gps_lng!, tipo: 'cliente' as const,
          orden: ord ?? c.orden ?? (10000 + i),
          hasOrden: ord != null,
        };
      });

    const entregaStops: Stop[] = (allEntregas ?? [])
      .filter((e: any) =>
        (e.status === 'cargado' || e.status === 'en_ruta') &&
        (e.fecha ?? '').slice(0, 10) === filterDate &&
        (e.vendedor_ruta_id ? e.vendedor_ruta_id === vendedorId : e.vendedor_id === vendedorId)
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
          hasOrden: true, // entregas siempre tienen orden de despacho
          entregaRef: e,
        };
      })
      .filter(s => s.gps_lat !== 0 && s.gps_lng !== 0);

    // Merge: entregas first (priority), then client visits
    const all = [...entregaStops, ...clientStops];
    // Sort: optimizados primero por orden, no-optimizados al final
    all.sort((a, b) => {
      if (a.hasOrden !== b.hasOrden) return a.hasOrden ? -1 : 1;
      return a.orden - b.orden;
    });
    return all;
  }, [clientesData, allEntregas, vendedorId, clienteMap, ordenMap, filterDate]);

  const completedCount = completedIds.size;
  const totalCount = stops.length;
  const activeStop = stops.find(s => s.id === activeStopId) ?? null;
  const navigatingStop = stops.find(s => s.id === navigatingTo) ?? null;

  // Helper: pide Directions a Google y refresca refs. Solo se llama: (1) al cambiar destino,
  // (2) cuando el vendedor se desvía >150 m de la ruta vigente Y han pasado >30 s.
  const requestDirections = useCallback((origin: GeoLatLng, destStop: Stop) => {
    if (!isLoaded) return;
    const service = new google.maps.DirectionsService();
    lastRequestTimeRef.current = Date.now();
    lastRouteOriginRef.current = origin;
    service.route(
      {
        origin,
        destination: { lat: destStop.gps_lat, lng: destStop.gps_lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
          const overview = result.routes?.[0]?.overview_path ?? [];
          const path: GeoLatLng[] = overview.map(p => ({ lat: p.lat(), lng: p.lng() }));
          currentRoutePathRef.current = path;
          setRemainingPath(path);
          setTraveledPath([]);
        } else {
          setDirections(null);
          currentRoutePathRef.current = null;
        }
      },
    );
  }, [isLoaded]);

  // 1 sola petición Directions al cambiar destino. NO depende de userLocation.
  useEffect(() => {
    if (!isLoaded || !navigatingStop) {
      setDirections(null);
      currentRoutePathRef.current = null;
      setTraveledPath([]); setRemainingPath([]);
      setLiveEtaMin(null); setLiveRemKm(null);
      return;
    }
    if (!userLocation) return;
    requestDirections(userLocation, navigatingStop);
    if (mapRef.current) {
      mapRef.current.setCenter(userLocation);
      mapRef.current.setZoom(17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, navigatingTo]);

  // Snap-to-route + animación + ETA + reroute por desvío. Cero llamadas a Google por tick.
  useEffect(() => {
    if (!navigatingStop || !userLocation) return;
    const path = currentRoutePathRef.current;
    const dest: GeoLatLng = { lat: navigatingStop.gps_lat, lng: navigatingStop.gps_lng };

    // Velocidad (m/s) basada en últimas posiciones
    const now = Date.now();
    if (lastTickAtRef.current && renderedPosRef.current) {
      const dt = (now - lastTickAtRef.current) / 1000;
      if (dt > 0) {
        const d = geoHaversine(renderedPosRef.current, userLocation);
        const v = d / dt;
        if (v >= 0 && v < 50) {
          speedHistoryRef.current.push(v);
          if (speedHistoryRef.current.length > 5) speedHistoryRef.current.shift();
        }
      }
    }
    lastTickAtRef.current = now;

    let target: GeoLatLng = userLocation;
    let distToDest = geoHaversine(userLocation, dest);

    if (path && path.length >= 2) {
      const proj = projectToPolyline(userLocation, path);
      target = proj.snapped;
      const { traveled, remaining } = splitPolylineAt(path, proj.segmentIndex, proj.t, proj.snapped);
      setTraveledPath(traveled);
      setRemainingPath(remaining);
      const remM = remainingDistance(path, proj.segmentIndex, proj.t);
      distToDest = remM > 0 ? remM : distToDest;
      setLiveRemKm(remM / 1000);

      const avgSpeed = speedHistoryRef.current.length
        ? speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length
        : 0;
      const effSpeed = Math.max(avgSpeed, 4.17); // piso 15 km/h
      setLiveEtaMin(Math.max(1, Math.round(remM / effSpeed / 60)));

      // Re-ruteo si desvío >150 m y >30 s desde última petición
      if (proj.distToRoute > 150 && (now - lastRequestTimeRef.current) > 30_000) {
        requestDirections(userLocation, navigatingStop);
      }
    } else {
      setLiveRemKm(distToDest / 1000);
    }

    // Animación interpolada del marker
    if (animCancelRef.current) animCancelRef.current();
    const from = renderedPosRef.current ?? target;
    if (renderedPosRef.current) {
      setHeadingDeg(geoBearing(renderedPosRef.current, target));
    }
    renderedPosRef.current = target;
    animCancelRef.current = animatePosition(from, target, 1000, (pos) => {
      setRenderedPos(pos);
    });

    // Llegada
    if (distToDest < 50) {
      handleArrived(navigatingStop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.lat, userLocation?.lng, navigatingTo]);

  // Upload posición cada 5 s mientras navega (overlay sobre useLocationBroadcaster global)
  useEffect(() => {
    if (!navigatingTo || !userLocation || !user?.id || !empresa?.id) return;
    const now = Date.now();
    if (now - lastUploadAtRef.current < 5000) return;
    lastUploadAtRef.current = now;
    supabase.from('vendedor_ubicaciones' as any).upsert({
      user_id: user.id,
      empresa_id: empresa.id,
      lat: userLocation.lat,
      lng: userLocation.lng,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }, [navigatingTo, userLocation?.lat, userLocation?.lng, user?.id, empresa?.id]);


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
    lastSpokenStepRef.current = -1;
    followUserRef.current = true;
    setPanelOpen(true);
    if (mapRef.current && userLocation) {
      mapRef.current.setCenter(userLocation);
      mapRef.current.setZoom(17);
    }
    if (voiceEnabled) speak(`Navegando hacia ${stop.nombre}`);
  };

  const recenterMap = useCallback(() => {
    followUserRef.current = true;
    if (mapRef.current) {
      if (navigatingTo && userLocation) {
        // While navigating, recenter on user
        mapRef.current.setCenter(userLocation);
        mapRef.current.setZoom(17);
      } else if (stops.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        stops.forEach(s => bounds.extend({ lat: s.gps_lat, lng: s.gps_lng }));
        if (userLocation) bounds.extend(userLocation);
        mapRef.current.fitBounds(bounds, 60);
      }
    }
  }, [stops, userLocation, navigatingTo]);

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
    if (voiceEnabled) speak(`Has llegado a ${stop.nombre}`);
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

  // Auto-advance step based on user proximity + voice
  useEffect(() => {
    if (!userLocation || steps.length === 0) return;
    for (let i = currentStepIdx; i < steps.length; i++) {
      const endLat = steps[i].end_location.lat();
      const endLng = steps[i].end_location.lng();
      const dist = Math.sqrt(
        Math.pow((userLocation.lat - endLat) * 111000, 2) +
        Math.pow((userLocation.lng - endLng) * 111000 * Math.cos(userLocation.lat * Math.PI / 180), 2)
      );
      if (dist < 30 && i > currentStepIdx) {
        setCurrentStepIdx(i);
        // Speak next instruction
        if (voiceEnabled && i !== lastSpokenStepRef.current) {
          lastSpokenStepRef.current = i;
          const nextI = steps[i + 1];
          if (nextI) speak(stripHtml(nextI.instructions));
        }
        break;
      }
    }
  }, [userLocation, steps, currentStepIdx, voiceEnabled]);

  // Speak initial instruction when directions arrive
  useEffect(() => {
    if (voiceEnabled && steps.length > 0 && lastSpokenStepRef.current === -1) {
      lastSpokenStepRef.current = 0;
      speak(stripHtml(steps[0].instructions));
    }
  }, [steps.length, voiceEnabled]);

  // Keep camera centered on user while navigating (auto-follow)
  useEffect(() => {
    if (!navigatingTo || !userLocation || !mapRef.current || !followUserRef.current) return;
    mapRef.current.panTo(userLocation);
  }, [navigatingTo, userLocation?.lat, userLocation?.lng]);

  // Detect user manually dragging -> disable follow; re-enable on recenter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const listener = map.addListener('dragstart', () => {
      if (navigatingTo) followUserRef.current = false;
    });
    return () => google.maps.event.removeListener(listener);
  }, [navigatingTo]);

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background">
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
          <button onClick={() => onBack ? onBack() : navigate('/ruta')} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
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
          {/* Route bicolor (traveled gris, remaining azul) — render local desde overview_path */}
          {navigatingTo && traveledPath.length >= 2 && (
            <Polyline
              path={traveledPath}
              options={{ strokeColor: '#cbd5e1', strokeWeight: 6, strokeOpacity: 0.9, zIndex: 1 }}
            />
          )}
          {navigatingTo && remainingPath.length >= 2 && (
            <Polyline
              path={remainingPath}
              options={{ strokeColor: '#2563eb', strokeWeight: 6, strokeOpacity: 0.95, zIndex: 2 }}
            />
          )}
          {/* Fallback: si aún no hay path local, dejar el renderer dibujar */}
          {directions && remainingPath.length < 2 && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9 },
              }}
            />
          )}

          {/* User location — flecha rotada al rumbo (estilo Uber) durante navegación, círculo si no */}
          {(renderedPos || userLocation) && (
            <MarkerF
              position={renderedPos ?? userLocation!}
              icon={navigatingTo ? {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 6,
                rotation: headingDeg,
                fillColor: '#2563eb',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              } : {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              }}
              zIndex={9999}
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
                  fillColor: isCompleted ? '#22c55e' : isNavigating ? '#ef4444' : !stop.hasOrden ? '#ef4444' : stop.tipo === 'entrega' ? '#f59e0b' : '#6366f1',
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
              <button
                onClick={() => { setVoiceEnabled(v => !v); if (voiceEnabled) window.speechSynthesis.cancel(); }}
                className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0"
                title={voiceEnabled ? 'Silenciar' : 'Activar voz'}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button onClick={stopNavigation} className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Next step preview + ETA en vivo (cálculo LOCAL, sin Google) */}
            <div className="mx-1 bg-card/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 flex items-center gap-2 shadow-sm">
              {nextStep && (
                <p className="text-[11px] text-muted-foreground flex-1 truncate">
                  Después: {stripHtml(nextStep.instructions)}
                </p>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                <Navigation className="h-3 w-3 text-primary" />
                {liveEtaMin != null ? (
                  <>
                    <span className="text-[12px] font-semibold text-foreground">Llegas en {liveEtaMin} min</span>
                    {liveRemKm != null && <span className="text-[11px] text-muted-foreground">· {liveRemKm.toFixed(1)} km</span>}
                  </>
                ) : leg ? (
                  <>
                    <span className="text-[12px] font-semibold text-foreground">{leg.duration?.text}</span>
                    <span className="text-[11px] text-muted-foreground">{leg.distance?.text}</span>
                  </>
                ) : null}
              </div>
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
          <div className="mx-3 space-y-2">
            <div className="bg-card/90 backdrop-blur-md border border-border rounded-2xl px-3 py-2.5 flex items-center gap-3 shadow-lg">
              <button onClick={() => onBack ? onBack() : navigate('/ruta')} className="p-1 -ml-0.5">
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
            {/* Date filter */}
            <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="bg-transparent text-[12px] text-foreground border-0 focus:outline-none flex-1"
              />
              <span className="text-[11px] text-muted-foreground capitalize">{filterDia}</span>
            </div>
            {/* Super admin override is now in the global SuperAdminMobileBar */}
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
                      isCompleted ? "opacity-40" : !stop.hasOrden ? "bg-red-500/10 hover:bg-red-500/15 active:bg-red-500/20" : "active:bg-card"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                      isCompleted
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : !stop.hasOrden ? "bg-red-500 text-white"
                        : stop.tipo === 'entrega' ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : stop.tipo === 'entrega' ? <Truck className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {stop.folio && <span className="text-[10px] font-mono text-muted-foreground">{stop.folio}</span>}
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                          stop.tipo === 'entrega' ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
                        )}>
                          {stop.tipo === 'entrega' ? 'Entrega' : 'Visita'}
                        </span>
                        {!stop.hasOrden && !isCompleted && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-red-500 text-white">
                            Sin optimizar
                          </span>
                        )}
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
