import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Navigation, Phone, Check, ShoppingCart, Truck, MapPin, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { useGoogleMaps, GoogleMapsProvider } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, DirectionsRenderer, MarkerF } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
}

function NavegacionContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get('modo') as 'clientes' | 'entregas') || 'clientes';
  const { empresa, profile } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { mutate: offlineMutate } = useOfflineMutation();

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

  // Fetch clients
  const { data: clientesData } = useQuery({
    queryKey: ['nav-clientes', empresa?.id],
    enabled: !!empresa?.id && mode === 'clientes',
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
  const vendedorId = profile?.vendedor_id;
  const { data: allEntregas, refetch: refetchEntregas } = useOfflineQuery('entregas', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id && mode === 'entregas', orderBy: 'orden_entrega' });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, {
    enabled: !!empresa?.id && mode === 'entregas',
  });

  const clienteMap = useMemo(() => new Map((clientes ?? []).map((c: any) => [c.id, c])), [clientes]);

  const stops: Stop[] = useMemo(() => {
    if (mode === 'clientes') {
      return (clientesData ?? []).map(c => ({
        id: c.id, nombre: c.nombre,
        direccion: c.direccion ?? undefined, colonia: c.colonia ?? undefined,
        telefono: c.telefono ?? undefined,
        gps_lat: c.gps_lat!, gps_lng: c.gps_lng!, tipo: 'cliente' as const,
      }));
    } else {
      return (allEntregas ?? [])
        .filter((e: any) =>
          (e.status === 'cargado' || e.status === 'en_ruta') &&
          (e.vendedor_ruta_id === vendedorId || e.vendedor_id === vendedorId)
        )
        .sort((a: any, b: any) => (a.orden_entrega ?? 999) - (b.orden_entrega ?? 999))
        .map((e: any) => {
          const cliente = clienteMap.get(e.cliente_id);
          return {
            id: e.id, nombre: cliente?.nombre ?? 'Sin cliente',
            direccion: cliente?.direccion ?? undefined, colonia: cliente?.colonia ?? undefined,
            telefono: cliente?.telefono ?? undefined,
            gps_lat: cliente?.gps_lat ?? 0, gps_lng: cliente?.gps_lng ?? 0,
            folio: e.folio, tipo: 'entrega' as const,
          };
        })
        .filter(s => s.gps_lat !== 0 && s.gps_lng !== 0);
    }
  }, [mode, clientesData, allEntregas, vendedorId, clienteMap]);

  const currentStop = stops[currentIdx];
  const completedCount = completedIds.size;
  const totalCount = stops.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Calculate directions from user to current stop
  useEffect(() => {
    if (!isLoaded || !currentStop || !userLocation) {
      setDirections(null);
      return;
    }

    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin: userLocation,
        destination: { lat: currentStop.gps_lat, lng: currentStop.gps_lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        setDirections(status === 'OK' && result ? result : null);
      }
    );
  }, [isLoaded, currentStop?.id, userLocation?.lat, userLocation?.lng]);

  const openGoogleMaps = (stop: Stop) => {
    const url = userLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${stop.gps_lat},${stop.gps_lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${stop.gps_lat},${stop.gps_lng}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleVisited = async (stop: Stop) => {
    if (mode === 'entregas') {
      const entrega = (allEntregas ?? []).find((e: any) => e.id === stop.id) as any;
      if (entrega) {
        await offlineMutate('entregas', 'update', {
          ...entrega, status: 'hecho', validado_at: new Date().toISOString(),
        });
        refetchEntregas();
      }
    }
    setCompletedIds(prev => new Set([...prev, stop.id]));
    toast.success(mode === 'entregas' ? '¡Entregado!' : '¡Visitado!');

    // Auto-advance
    const nextIdx = stops.findIndex((s, i) => i > currentIdx && !completedIds.has(s.id) && s.id !== stop.id);
    if (nextIdx >= 0) setCurrentIdx(nextIdx);
  };

  const handleSaleAndVisit = (stop: Stop) => {
    setCompletedIds(prev => new Set([...prev, stop.id]));
    navigate(`/ruta/ventas/nueva?clienteId=${stop.id}`);
  };

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
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

  const leg = directions?.routes?.[0]?.legs?.[0];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground">
            {mode === 'entregas' ? 'Ruta de entregas' : 'Ruta de visitas'}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {completedCount}/{totalCount} completadas
          </p>
        </div>
        {completedCount === totalCount && (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px]">✓ Listo</Badge>
        )}
      </header>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted">
        <div className="h-full bg-primary transition-all duration-500 rounded-r-full" style={{ width: `${progress}%` }} />
      </div>

      {/* MAP — shows route to current stop */}
      {isLoaded && currentStop && (
        <div className="h-52 relative">
          <GoogleMap
            center={{ lat: currentStop.gps_lat, lng: currentStop.gps_lng }}
            zoom={13}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            options={{
              disableDefaultUI: true,
              zoomControl: false,
              gestureHandling: 'greedy',
              styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] },
              ],
            }}
          >
            {directions ? (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: false,
                  polylineOptions: { strokeColor: 'hsl(var(--primary))', strokeWeight: 5 },
                }}
              />
            ) : (
              <MarkerF position={{ lat: currentStop.gps_lat, lng: currentStop.gps_lng }} />
            )}
          </GoogleMap>

          {/* ETA overlay */}
          {leg && (
            <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-sm">
              <Navigation className="h-3.5 w-3.5 text-primary" />
              <span className="text-[13px] font-semibold text-foreground">{leg.duration?.text}</span>
              <span className="text-[11px] text-muted-foreground">· {leg.distance?.text}</span>
            </div>
          )}

          {/* Open in Google Maps button */}
          <button
            onClick={() => openGoogleMaps(currentStop)}
            className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-3 py-2 flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
          >
            <ExternalLink className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Google Maps</span>
          </button>
        </div>
      )}

      {/* Current stop card */}
      {currentStop && !completedIds.has(currentStop.id) && (
        <div className="px-4 py-3 bg-card border-b border-border space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
              {currentIdx + 1}
            </div>
            <div className="flex-1 min-w-0">
              {currentStop.folio && <p className="text-[10px] font-mono text-muted-foreground">{currentStop.folio}</p>}
              <p className="text-[15px] font-bold text-foreground truncate">{currentStop.nombre}</p>
              {(currentStop.direccion || currentStop.colonia) && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[currentStop.direccion, currentStop.colonia].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {currentStop.telefono && (
              <a href={`tel:${currentStop.telefono}`}
                className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 active:scale-90 transition-transform shrink-0">
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === 'clientes' ? (
              <>
                <Button onClick={() => handleSaleAndVisit(currentStop)} className="flex-1 rounded-xl gap-2 h-11">
                  <ShoppingCart className="h-4 w-4" /> Vender
                </Button>
                <Button variant="outline" onClick={() => handleVisited(currentStop)} className="flex-1 rounded-xl gap-2 h-11">
                  <Check className="h-4 w-4" /> Sin venta
                </Button>
              </>
            ) : (
              <Button onClick={() => handleVisited(currentStop)} className="flex-1 rounded-xl gap-2 h-11">
                <Truck className="h-4 w-4" /> Marcar entregado
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Remaining stops list */}
      <div className="flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        {stops.map((stop, idx) => {
          const isCompleted = completedIds.has(stop.id);
          const isCurrent = idx === currentIdx;
          if (isCurrent && !isCompleted) return null; // shown above

          return (
            <div
              key={stop.id}
              onClick={() => !isCompleted && setCurrentIdx(idx)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 border-b border-border transition-colors",
                isCompleted ? "opacity-40" : "active:bg-muted/50"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                isCompleted
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}>
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                {stop.folio && <p className="text-[10px] font-mono text-muted-foreground">{stop.folio}</p>}
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
                <button
                  onClick={(e) => { e.stopPropagation(); openGoogleMaps(stop); }}
                  className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform shrink-0"
                >
                  <Navigation className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RutaNavegacionPage() {
  return (
    <GoogleMapsProvider>
      <NavegacionContent />
    </GoogleMapsProvider>
  );
}
