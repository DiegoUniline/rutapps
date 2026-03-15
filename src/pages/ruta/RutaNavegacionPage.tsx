import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Navigation, ChevronLeft, ChevronRight, MapPin, Phone, Check, ExternalLink, ShoppingCart, Truck, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { useGoogleMaps, GoogleMapsProvider } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api';
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
  completed: boolean;
}

function NavegacionContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('modo') as 'clientes' | 'entregas' || 'clientes';
  const { empresa, profile } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { mutate: offlineMutate } = useOfflineMutation();

  // Get user location
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Fetch clients for "clientes" mode
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

  // Fetch entregas for "entregas" mode
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
        id: c.id,
        nombre: c.nombre,
        direccion: c.direccion ?? undefined,
        colonia: c.colonia ?? undefined,
        telefono: c.telefono ?? undefined,
        gps_lat: c.gps_lat!,
        gps_lng: c.gps_lng!,
        tipo: 'cliente' as const,
        completed: completedIds.has(c.id),
      }));
    } else {
      const entregas = (allEntregas ?? [])
        .filter((e: any) =>
          (e.status === 'cargado' || e.status === 'en_ruta') &&
          (e.vendedor_ruta_id === vendedorId || e.vendedor_id === vendedorId)
        )
        .sort((a: any, b: any) => (a.orden_entrega ?? 999) - (b.orden_entrega ?? 999));

      return entregas.map((e: any) => {
        const cliente = clienteMap.get(e.cliente_id);
        return {
          id: e.id,
          nombre: cliente?.nombre ?? 'Sin cliente',
          direccion: cliente?.direccion ?? undefined,
          colonia: cliente?.colonia ?? undefined,
          telefono: cliente?.telefono ?? undefined,
          gps_lat: cliente?.gps_lat ?? 0,
          gps_lng: cliente?.gps_lng ?? 0,
          folio: e.folio,
          tipo: 'entrega' as const,
          completed: completedIds.has(e.id),
        };
      }).filter(s => s.gps_lat !== 0 && s.gps_lng !== 0);
    }
  }, [mode, clientesData, allEntregas, vendedorId, clienteMap, completedIds]);

  const currentStop = stops[currentIdx];
  const completedCount = completedIds.size;
  const totalCount = stops.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Calculate directions from user to current stop
  useEffect(() => {
    if (!isLoaded || !currentStop || !userLocation) return;

    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin: userLocation,
        destination: { lat: currentStop.gps_lat, lng: currentStop.gps_lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
        } else {
          setDirections(null);
        }
      }
    );
  }, [isLoaded, currentStop?.id, userLocation]);

  const handleComplete = async () => {
    if (!currentStop) return;

    if (mode === 'entregas') {
      const entrega = (allEntregas ?? []).find((e: any) => e.id === currentStop.id) as any;
      if (entrega) {
        await offlineMutate('entregas', 'update', {
          ...entrega,
          status: 'hecho',
          validado_at: new Date().toISOString(),
        });
        refetchEntregas();
      }
    }

    setCompletedIds(prev => new Set([...prev, currentStop.id]));
    toast.success(mode === 'entregas' ? '¡Entrega completada!' : '¡Visita registrada!');

    // Auto-advance to next incomplete
    const nextIdx = stops.findIndex((s, i) => i > currentIdx && !completedIds.has(s.id) && s.id !== currentStop.id);
    if (nextIdx >= 0) {
      setCurrentIdx(nextIdx);
    }
  };

  const openGoogleMaps = () => {
    if (!currentStop) return;
    const url = userLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${currentStop.gps_lat},${currentStop.gps_lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${currentStop.gps_lat},${currentStop.gps_lng}&travelmode=driving`;
    window.open(url, '_blank');
  };

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
          <h1 className="text-[16px] font-bold text-foreground">Navegación</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Navigation className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No hay paradas con GPS disponibles</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-foreground">
            {mode === 'entregas' ? 'Entregas' : 'Visitas'}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {completedCount}/{totalCount} completadas
          </p>
        </div>
        {completedCount === totalCount && totalCount > 0 && (
          <Badge className="bg-emerald-500 text-white text-[10px]">¡Listo!</Badge>
        )}
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stop dots */}
      <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto scrollbar-none">
        {stops.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentIdx(i)}
            className={cn(
              "shrink-0 w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center transition-all",
              completedIds.has(s.id)
                ? "bg-emerald-500 text-white"
                : i === currentIdx
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30 scale-110"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {completedIds.has(s.id) ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </button>
        ))}
      </div>

      {/* Map */}
      {isLoaded && currentStop && (
        <div className="h-48 mx-4 rounded-2xl overflow-hidden border border-border">
          <GoogleMap
            center={{ lat: currentStop.gps_lat, lng: currentStop.gps_lng }}
            zoom={14}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: 'greedy',
            }}
          >
            {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: false }} />}
            {!directions && (
              <Marker position={{ lat: currentStop.gps_lat, lng: currentStop.gps_lng }} />
            )}
          </GoogleMap>
        </div>
      )}

      {/* Current stop card */}
      {currentStop && (
        <div className="flex-1 overflow-auto px-4 pt-3 pb-4 space-y-3">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {currentStop.folio && (
                  <p className="text-[11px] font-mono text-muted-foreground">{currentStop.folio}</p>
                )}
                <h2 className="text-[17px] font-bold text-foreground truncate">{currentStop.nombre}</h2>
                {(currentStop.direccion || currentStop.colonia) && (
                  <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[currentStop.direccion, currentStop.colonia].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {currentIdx + 1} de {totalCount}
              </Badge>
            </div>

            {/* Directions info */}
            {directions?.routes?.[0]?.legs?.[0] && (
              <div className="flex items-center gap-3 bg-primary/5 rounded-xl px-3 py-2">
                <Navigation className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <span className="text-[13px] font-semibold text-foreground">
                    {directions.routes[0].legs[0].duration?.text}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-2">
                    ({directions.routes[0].legs[0].distance?.text})
                  </span>
                </div>
              </div>
            )}

            {/* Actions row */}
            <div className="flex items-center gap-2">
              <Button
                onClick={openGoogleMaps}
                variant="outline"
                className="flex-1 rounded-xl gap-2"
              >
                <ExternalLink className="h-4 w-4" /> Ir con Google Maps
              </Button>
              {currentStop.telefono && (
                <a href={`tel:${currentStop.telefono}`}
                  className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 active:scale-90 transition-transform shrink-0">
                  <Phone className="h-4 w-4" />
                </a>
              )}
              {mode === 'clientes' && (
                <button
                  onClick={() => navigate(`/ruta/ventas/nueva?clienteId=${currentStop.id}`)}
                  className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform shrink-0"
                >
                  <ShoppingCart className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Complete + navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl shrink-0"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx(i => i - 1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            {currentStop.completed ? (
              <div className="flex-1 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                <Check className="h-5 w-5" /> Completado
              </div>
            ) : (
              <Button
                onClick={handleComplete}
                className="flex-1 h-12 rounded-xl text-sm gap-2"
              >
                {mode === 'entregas' ? (
                  <><Truck className="h-4 w-4" /> Marcar entregado</>
                ) : (
                  <><Check className="h-4 w-4" /> Visita completada</>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="icon"
              className="rounded-xl shrink-0"
              disabled={currentIdx >= totalCount - 1}
              onClick={() => setCurrentIdx(i => i + 1)}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
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
