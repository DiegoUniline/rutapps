import { useEffect, useMemo, useState } from 'react';
import { Layer, Marker, Popup, Source } from 'react-map-gl/maplibre';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface RecorridoPoint {
  id: string;
  lat: number;
  lng: number;
  recorded_at: string;
  battery_level: number | null;
}

interface Props {
  userId: string | null;
  fecha: string;
  color?: string;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function diffMinutes(aIso: string, bIso: string) {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function EndpointMarker({ label, color, title }: { label: string; color: string; title: string }) {
  return (
    <div
      title={title}
      className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  );
}

/** Recorrido histórico del vendedor, adaptado al mapa libre de Supervisor. */
export default function VendedorRecorridoLayerML({ userId, fecha, color = '#3b82f6' }: Props) {
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

  const stops = useMemo(() => {
    if (points.length === 0) return [] as { point: RecorridoPoint; minsHere: number }[];
    const result: { point: RecorridoPoint; minsHere: number }[] = [];
    let clusterStart = points[0];
    let clusterLast = points[0];

    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      if (haversineMeters(clusterStart, point) < 50) {
        clusterLast = point;
      } else {
        const minsHere = diffMinutes(clusterStart.recorded_at, clusterLast.recorded_at);
        if (minsHere >= 5) result.push({ point: clusterStart, minsHere });
        clusterStart = point;
        clusterLast = point;
      }
    }

    const minsHere = diffMinutes(clusterStart.recorded_at, clusterLast.recorded_at);
    if (minsHere >= 5) result.push({ point: clusterStart, minsHere });
    return result;
  }, [points]);

  const route = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map((point) => [Number(point.lng), Number(point.lat)]),
    },
  }), [points]);

  useEffect(() => setSelected(null), [userId, fecha]);

  if (!userId || points.length === 0) return null;

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  return (
    <>
      {points.length > 1 && (
        <Source id="vendedor-recorrido" type="geojson" data={route}>
          <Layer
            id="vendedor-recorrido-casing"
            type="line"
            paint={{ 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.65 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="vendedor-recorrido-line"
            type="line"
            paint={{ 'line-color': color, 'line-width': 4, 'line-opacity': 0.9 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      <Marker longitude={Number(startPoint.lng)} latitude={Number(startPoint.lat)} anchor="center">
        <EndpointMarker label="A" color="#10b981" title={`Inicio · ${fmtTime(startPoint.recorded_at)}`} />
      </Marker>

      {endPoint.id !== startPoint.id && (
        <Marker longitude={Number(endPoint.lng)} latitude={Number(endPoint.lat)} anchor="center">
          <EndpointMarker label="B" color="#ef4444" title={`Última posición · ${fmtTime(endPoint.recorded_at)}`} />
        </Marker>
      )}

      {stops.map((stop, index) => (
        <Marker
          key={stop.point.id}
          longitude={Number(stop.point.lng)}
          latitude={Number(stop.point.lat)}
          anchor="center"
          onClick={(event) => {
            event.originalEvent.stopPropagation();
            setSelected(stop);
          }}
        >
          <button
            type="button"
            title={`Parada ${index + 1} · ${fmtTime(stop.point.recorded_at)} (${stop.minsHere} min)`}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-md transition-transform hover:scale-110"
            style={{ backgroundColor: color }}
          >
            {index + 1}
          </button>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={Number(selected.point.lng)}
          latitude={Number(selected.point.lat)}
          anchor="bottom"
          offset={18}
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <div className="min-w-[180px] space-y-1 p-1 text-foreground">
            <div className="text-sm font-semibold">📍 Parada</div>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Clock className="h-3 w-3" />
              <span>{fmtTime(selected.point.recorded_at)} · estuvo {selected.minsHere} min</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{Number(selected.point.lat).toFixed(5)}, {Number(selected.point.lng).toFixed(5)}</span>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}
