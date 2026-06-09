import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-map-gl/maplibre';
import { useLiveVendedores, type LiveVendedor } from '@/hooks/useLiveVendedores';
import { Battery, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const SELLER_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function colorForUser(userId: string, index: number): string {
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
}

/**
 * MapLibre version: live seller markers inside any <MapGL>.
 */
export default function LiveVendedoresLayerML({ enabled = true }: Props) {
  const vendedores = useLiveVendedores(enabled);
  const [selected, setSelected] = useState<LiveVendedor | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const colored = useMemo(
    () => vendedores.map((v, i) => ({ ...v, color: colorForUser(v.user_id, i) })),
    [vendedores]
  );

  return (
    <>
      {colored.map((v) => {
        const initials = (v.nombre ?? '?').trim().slice(0, 1).toUpperCase();
        const minsSince = (Date.now() - new Date(v.updated_at).getTime()) / 60000;
        const inactive = minsSince > 3;
        const idle = !inactive && minsSince > 1.5;
        const ringColor = inactive ? '#9ca3af' : (idle ? '#facc15' : v.color);
        const fadeOpacity = inactive
          ? Math.max(0.25, 0.6 - (minsSince - 3) / 117 * 0.35)
          : 1;
        const fillColor = inactive ? '#9ca3af' : v.color;
        const borderW = idle ? 4 : 3;
        const size = v.avatar_url ? 44 : 36;

        return (
          <Marker
            key={v.user_id}
            longitude={v.lng}
            latitude={v.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelected(v);
            }}
          >
            <div
              title={`${v.nombre ?? 'Vendedor'} · ${timeAgo(v.updated_at)}${inactive ? ' (inactivo)' : ''}`}
              className="rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 overflow-hidden bg-white"
              style={{
                width: size,
                height: size,
                border: `${borderW}px solid ${ringColor}`,
                opacity: fadeOpacity,
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              }}
            >
              {v.avatar_url ? (
                <img
                  src={v.avatar_url}
                  alt={v.nombre ?? ''}
                  className="w-full h-full object-cover rounded-full"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-bold text-sm rounded-full"
                  style={{ backgroundColor: fillColor }}
                >
                  {initials}
                </div>
              )}
            </div>
          </Marker>
        );
      })}

      {selected && (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          anchor="bottom"
          onClose={() => setSelected(null)}
          closeButton={true}
          closeOnClick={false}
          offset={24}
        >
          <div className="min-w-[180px] text-foreground p-1">
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
        </Popup>
      )}
    </>
  );
}
