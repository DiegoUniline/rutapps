import { useEffect, useMemo, useState } from 'react';
import { Marker, InfoWindow } from '@react-google-maps/api';
import { useLiveVendedores, type LiveVendedor } from '@/hooks/useLiveVendedores';
import { Battery, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

// Cache: avatar URL → base64 data URI (so SVG markers can rasterize correctly)
const avatarCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchAvatarAsDataUri(url: string): Promise<string | null> {
  if (avatarCache.has(url)) return avatarCache.get(url)!;
  if (inflight.has(url)) return inflight.get(url)!;
  const p = (async () => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUri: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      avatarCache.set(url, dataUri);
      return dataUri;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

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

  const [avatarDataUris, setAvatarDataUris] = useState<Record<string, string>>({});

  // Pre-fetch avatar images as base64 so SVG markers rasterize them reliably
  useEffect(() => {
    let cancelled = false;
    colored.forEach(v => {
      if (!v.avatar_url || avatarDataUris[v.avatar_url]) return;
      fetchAvatarAsDataUri(v.avatar_url).then(uri => {
        if (cancelled || !uri) return;
        setAvatarDataUris(prev => prev[v.avatar_url!] ? prev : { ...prev, [v.avatar_url!]: uri });
      });
    });
    return () => { cancelled = true; };
  }, [colored, avatarDataUris]);

  if (typeof google === 'undefined') return null;

  return (
    <>
      {colored.map((v) => {
        const initials = (v.nombre ?? '?').trim().slice(0, 1).toUpperCase();
        const minsSince = (Date.now() - new Date(v.updated_at).getTime()) / 60000;
        // Estado del marcador según tiempo desde último heartbeat:
        // <1.5 min → activo (color completo)
        // 1.5–3 min → idle (anillo amarillo)
        // >3 min → inactivo (gris, opacidad gradual hasta mínima a las 2h)
        const inactive = minsSince > 3;
        const idle = !inactive && minsSince > 1.5;
        const ringColor = inactive ? '#9ca3af' : (idle ? '#facc15' : v.color);
        // Degradado: 1.0 activo → 0.6 a los 3 min → 0.25 a 2h+
        const fadeOpacity = inactive
          ? Math.max(0.25, 0.6 - (minsSince - 3) / 117 * 0.35)
          : 1;

        // Si tiene avatar → usamos un marcador HTML (foto circular con borde de color).
        // Si NO tiene avatar → fallback al círculo con inicial.
        const cachedAvatar = v.avatar_url ? avatarDataUris[v.avatar_url] : null;
        if (v.avatar_url && cachedAvatar) {
          const size = 44;
          const border = idle ? 4 : 3;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><clipPath id="c-${v.user_id}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - border}" /></clipPath></defs><circle cx="${size/2}" cy="${size/2}" r="${size/2 - border/2}" fill="#fff" stroke="${ringColor}" stroke-width="${border}" /><image href="${cachedAvatar}" x="${border}" y="${border}" width="${size - border*2}" height="${size - border*2}" clip-path="url(#c-${v.user_id})" preserveAspectRatio="xMidYMid slice" /></svg>`;
          const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
          return (
            <Marker
              key={v.user_id}
              position={{ lat: v.lat, lng: v.lng }}
              zIndex={inactive ? 5000 : 10000}
              onClick={() => setSelected(v)}
              title={`${v.nombre ?? 'Vendedor'} · ${timeAgo(v.updated_at)}${inactive ? ' (inactivo)' : ''}`}
              opacity={inactive ? 0.55 : 1}
              icon={{
                url,
                scaledSize: new google.maps.Size(size, size),
                anchor: new google.maps.Point(size / 2, size / 2),
              }}
            />
          );
        }

        // Fallback sin avatar
        const fillColor = inactive ? '#9ca3af' : v.color;
        return (
          <Marker
            key={v.user_id}
            position={{ lat: v.lat, lng: v.lng }}
            zIndex={inactive ? 5000 : 10000}
            onClick={() => setSelected(v)}
            title={`${v.nombre ?? 'Vendedor'} · ${timeAgo(v.updated_at)}${inactive ? ' (inactivo)' : ''}`}
            opacity={inactive ? 0.55 : 1}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor,
              fillOpacity: inactive ? 0.7 : 1,
              strokeColor: ringColor,
              strokeWeight: idle ? 4 : 3,
              scale: 14,
            }}
            label={{ text: initials, color: inactive ? '#4b5563' : '#fff', fontSize: '12px', fontWeight: '700' }}
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
