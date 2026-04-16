import { useEffect, useMemo, useState } from 'react';
import { Polyline, Marker, InfoWindow } from '@react-google-maps/api';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, MapPin } from 'lucide-react';

interface RecorridoPoint {
  id: string;
  lat: number;
  lng: number;
  recorded_at: string;
  battery_level: number | null;
}

interface Props {
  /** UUID del vendedor (auth user_id) cuyo recorrido queremos ver */
  userId: string | null;
  /** Fecha YYYY-MM-DD */
  fecha: string;
  /** Color de la línea */
  color?: string;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function diffMinutes(aIso: string, bIso: string) {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Renderiza el recorrido GPS de un vendedor para una fecha dada.
 * - Polyline con todos los puntos del día.
 * - Marcadores numerados solo en "paradas" (>5 min en el mismo lugar) para no saturar.
 * - InfoWindow con hora, batería y tiempo total parado.
 */
export default function VendedorRecorridoLayer({ userId, fecha, color = '#3b82f6' }: Props) {
  const { empresa } = useAuth();
  const [selected, setSelected] = useState<{ point: RecorridoPoint; minsHere: number } | null>(null);

  const { data: points = [] } = useQuery({
    queryKey: ['vendedor-recorrido', userId, fecha, empresa?.id],
    enabled: !!userId && !!empresa?.id && !!fecha,
    staleTime: 30_000,
    queryFn: async () => {
      const startIso = new Date(`${fecha}T00:00:00`).toISOString();
      const endIso = new Date(`${fecha}T23:59:59.999`).toISOString();
      const { data, error } = await supabase
        .from('vendedor_ubicaciones_historial' as any)
        .select('id, lat, lng, recorded_at, battery_level')
        .eq('user_id', userId)
        .eq('empresa_id', empresa!.id)
        .gte('recorded_at', startIso)
        .lte('recorded_at', endIso)
        .order('recorded_at', { ascending: true });
      if (error) return [];
      return (data ?? []) as unknown as RecorridoPoint[];
    },
  });

  // Agrupa puntos cercanos (< 50m) consecutivos en "paradas"
  const stops = useMemo(() => {
    if (points.length === 0) return [] as { point: RecorridoPoint; minsHere: number }[];
    const result: { point: RecorridoPoint; minsHere: number }[] = [];
    let clusterStart = points[0];
    let clusterLast = points[0];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const d = haversineMeters(clusterStart, p);
      if (d < 50) {
        clusterLast = p;
      } else {
        const mins = diffMinutes(clusterStart.recorded_at, clusterLast.recorded_at);
        // Solo registramos como "parada" si estuvo >= 5 minutos
        if (mins >= 5) {
          result.push({ point: clusterStart, minsHere: mins });
        }
        clusterStart = p;
        clusterLast = p;
      }
    }
    // último cluster
    const minsLast = diffMinutes(clusterStart.recorded_at, clusterLast.recorded_at);
    if (minsLast >= 5) result.push({ point: clusterStart, minsHere: minsLast });
    return result;
  }, [points]);

  const path = useMemo(() => points.map(p => ({ lat: p.lat, lng: p.lng })), [points]);

  // Re-render al cambiar puntos
  useEffect(() => { setSelected(null); }, [userId, fecha]);

  if (typeof google === 'undefined' || !userId || points.length === 0) return null;

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  return (
    <>
      <Polyline
        path={path}
        options={{
          strokeColor: color,
          strokeOpacity: 0.85,
          strokeWeight: 4,
          geodesic: true,
          icons: [{
            icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, strokeColor: color },
            offset: '0',
            repeat: '120px',
          }],
        }}
      />

      {/* Punto de inicio (verde) */}
      <Marker
        position={{ lat: startPoint.lat, lng: startPoint.lng }}
        zIndex={9000}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          scale: 9,
        }}
        label={{ text: 'A', color: '#fff', fontSize: '11px', fontWeight: '700' }}
        title={`Inicio · ${fmtTime(startPoint.recorded_at)}`}
      />

      {/* Punto final (rojo) */}
      {endPoint.id !== startPoint.id && (
        <Marker
          position={{ lat: endPoint.lat, lng: endPoint.lng }}
          zIndex={9000}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
            scale: 9,
          }}
          label={{ text: 'B', color: '#fff', fontSize: '11px', fontWeight: '700' }}
          title={`Última posición · ${fmtTime(endPoint.recorded_at)}`}
        />
      )}

      {/* Paradas numeradas */}
      {stops.map((s, idx) => (
        <Marker
          key={s.point.id}
          position={{ lat: s.point.lat, lng: s.point.lng }}
          zIndex={8000}
          onClick={() => setSelected(s)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
            scale: 11,
          }}
          label={{ text: String(idx + 1), color: '#fff', fontSize: '11px', fontWeight: '700' }}
          title={`Parada ${idx + 1} · ${fmtTime(s.point.recorded_at)} (${s.minsHere} min)`}
        />
      ))}

      {selected && (
        <InfoWindow
          position={{ lat: selected.point.lat, lng: selected.point.lng }}
          onCloseClick={() => setSelected(null)}
          options={{ pixelOffset: new google.maps.Size(0, -16) }}
        >
          <div className="min-w-[180px] text-foreground space-y-1">
            <div className="font-semibold text-sm">📍 Parada</div>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Clock className="h-3 w-3" />
              <span>{fmtTime(selected.point.recorded_at)} · estuvo {selected.minsHere} min</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{selected.point.lat.toFixed(5)}, {selected.point.lng.toFixed(5)}</span>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}
