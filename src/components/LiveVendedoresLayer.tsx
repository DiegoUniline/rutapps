import { useEffect, useMemo, useState } from 'react';
import { Marker, InfoWindow } from '@react-google-maps/api';
import { useLiveVendedores, type LiveVendedor } from '@/hooks/useLiveVendedores';
import { Battery, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

// 8 distinct, vivid colors for sellers (cycled by index)
const SELLER_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function colorForUser(userId: string, index: number): string {
  // stable hash → color, fallback to index
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return SELLER_COLORS[Math.abs(hash) % SELLER_COLORS.length] ?? SELLER_COLORS[index % SELLER_COLORS.length];
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h}h`;
}

interface Props {
  enabled?: boolean;
  /** Optional list to show in a side panel; consumers can use the same hook directly */
  showPanel?: boolean;
}

/**
 * Renders live seller markers + a compact status panel inside any GoogleMap.
 * Heavy lifting (realtime + dedupe + stale filtering) lives in useLiveVendedores.
 */
export default function LiveVendedoresLayer({ enabled = true }: Props) {
  const vendedores = useLiveVendedores(enabled);
  const [selected, setSelected] = useState<LiveVendedor | null>(null);
  const [, setTick] = useState(0);

  // Re-render every 20s so "hace X min" stays fresh even without realtime events
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const colored = useMemo(
    () => vendedores.map((v, i) => ({ ...v, color: colorForUser(v.user_id, i) })),
    [vendedores]
  );

  if (typeof google === 'undefined') return null;

  return (
    <>
      {colored.map((v) => {
        const initials = (v.nombre ?? '?').trim().slice(0, 1).toUpperCase();
        // Tiempo desde el último heartbeat: si lleva quieto >2min, marcamos como "estacionado"
        const minsSince = (Date.now() - new Date(v.updated_at).getTime()) / 60000;
        const idle = minsSince > 2;
        return (
          <Marker
            key={v.user_id}
            position={{ lat: v.lat, lng: v.lng }}
            zIndex={10000}
            onClick={() => setSelected(v)}
            title={`${v.nombre ?? 'Vendedor'} · ${timeAgo(v.updated_at)}`}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: v.color,
              fillOpacity: 1,
              strokeColor: idle ? '#facc15' : '#ffffff',
              strokeWeight: idle ? 4 : 3,
              scale: 14,
            }}
            label={{ text: initials, color: '#fff', fontSize: '12px', fontWeight: '700' }}
          />
        );
      })}

      {selected && (
        <InfoWindow
          position={{ lat: selected.lat, lng: selected.lng }}
          onCloseClick={() => setSelected(null)}
          options={{ pixelOffset: new google.maps.Size(0, -20) }}
        >
          <div className="min-w-[180px] text-foreground">
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: colorForUser(selected.user_id, 0) }}
              >
                {(selected.nombre ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="font-semibold text-sm leading-tight">{selected.nombre ?? 'Vendedor'}</div>
            </div>
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>Actualizado {timeAgo(selected.updated_at)}</span>
              </div>
              {selected.battery_level != null && (
                <div className="flex items-center gap-1.5">
                  <Battery className={cn('h-3 w-3', selected.battery_level < 20 && 'text-destructive')} />
                  <span>Batería {selected.battery_level}%</span>
                </div>
              )}
              {selected.accuracy != null && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  <span>Precisión ±{Math.round(selected.accuracy)}m</span>
                </div>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}
