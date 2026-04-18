import { useMemo, useState } from 'react';
import { Polyline, Marker } from '@react-google-maps/api';
import { Eye, EyeOff, Loader2, Route as RouteIcon, TrendingDown, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 12 contrasting colors for routes */
export const ROUTE_PALETTE = [
  '#E63946', '#2A9D8F', '#F4A261', '#264653', '#9B5DE5',
  '#00BBF9', '#F15BB5', '#FB8500', '#06A77D', '#3A0CA3',
  '#FF006E', '#8338EC',
];

export function getRouteColor(idx: number): string {
  return ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
}

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export interface RouteResultEntry {
  vendedor_id: string;
  vendedor_nombre: string;
  origin: { lat: number; lng: number; label?: string };
  optimized_order: string[]; // cliente_ids
  polyline: string | null;
  distance_meters: number;
  duration: string; // "1234s"
  original_distance_meters: number;
  error?: string;
}

interface ClienteLite {
  id: string; nombre: string; gps_lat: number; gps_lng: number; direccion?: string | null;
  visitado?: boolean;
  outOfRange?: boolean;
  outOfRangeMeters?: number | null;
}

interface Props {
  results: RouteResultEntry[];
  clientesById: Map<string, ClienteLite>;
  /** Map id -> visibility */
  visibility: Record<string, boolean>;
  onToggleVisibility: (vendedor_id: string) => void;
  onApply: () => void;
  applying: boolean;
  applied: boolean;
  onClose: () => void;
}

/** Format a duration in "1234s" → "20 min" or "1h 5min" */
export function fmtDuration(d?: string) {
  if (!d) return '';
  const secs = parseInt(String(d).replace('s', ''), 10);
  if (isNaN(secs)) return d;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

/**
 * Renderiza polilíneas + marcadores numerados para múltiples rutas a la vez.
 * Cada ruta tiene un color y se puede ocultar individualmente.
 */
export function MultiRouteOverlay({ results, clientesById, visibility }: {
  results: RouteResultEntry[]; clientesById: Map<string, ClienteLite>; visibility: Record<string, boolean>;
}) {
  const items = useMemo(() => results.map((r, idx) => ({ r, idx, color: getRouteColor(idx) })), [results]);

  return (
    <>
      {items.map(({ r, color }) => {
        if (!visibility[r.vendedor_id]) return null;
        if (r.error) return null;

        // polyline can be a single encoded string OR a JSON array of strings (from chunked Google response)
        let polylines: { lat: number; lng: number }[][] = [];
        if (r.polyline) {
          try {
            const parsed = r.polyline.startsWith('[') ? JSON.parse(r.polyline) : null;
            if (Array.isArray(parsed)) {
              polylines = parsed.map((s: string) => decodePolyline(s));
            } else {
              polylines = [decodePolyline(r.polyline)];
            }
          } catch {
            polylines = [decodePolyline(r.polyline)];
          }
        } else {
          // Fallback: straight-line polyline from origin → ordered stops (used when restoring saved routes)
          const fallback: { lat: number; lng: number }[] = [];
          if (r.origin && r.origin.lat !== 0 && r.origin.lng !== 0) {
            fallback.push({ lat: r.origin.lat, lng: r.origin.lng });
          }
          for (const cid of r.optimized_order) {
            const c = clientesById.get(cid);
            if (c && c.gps_lat != null && c.gps_lng != null) {
              fallback.push({ lat: Number(c.gps_lat), lng: Number(c.gps_lng) });
            }
          }
          if (fallback.length >= 2) polylines = [fallback];
        }

        return (
          <div key={r.vendedor_id} style={{ display: 'contents' }}>
            {/* Origin marker */}
            <Marker
              position={r.origin}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: color,
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 3,
                scale: 12,
              }}
              label={{ text: '▶', color: '#fff', fontSize: '10px', fontWeight: '700' }}
              title={`Salida: ${r.vendedor_nombre}${r.origin.label ? ` (${r.origin.label})` : ''}`}
              zIndex={9000}
            />
            {/* Polylines */}
            {polylines.map((path, pi) => (
              <Polyline
                key={pi}
                path={path}
                options={{ strokeColor: color, strokeWeight: 4, strokeOpacity: 0.85, zIndex: 100 }}
              />
            ))}
            {/* Numbered stops */}
            {r.optimized_order.map((cid, idx) => {
              const c = clientesById.get(cid);
              if (!c) return null;
              const visited = !!c.visitado;
              const oor = !!c.outOfRange;
              // Si está visitado, fondo verde; si no, color de la ruta
              const fill = visited ? '#22c55e' : color;
              const w = 30, h = 30;
              const warning = oor
                ? `<g transform="translate(20,-2)"><circle cx="6" cy="6" r="6" fill="#f59e0b" stroke="#fff" stroke-width="1.2"/><text x="6" y="9" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="Arial,sans-serif">!</text></g>`
                : '';
              const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-2 -4 ${w + 2} ${h}">
                <circle cx="14" cy="14" r="13" fill="${fill}" stroke="#fff" stroke-width="2.5"/>
                <text x="14" y="18" text-anchor="middle" fill="#fff" font-size="11" font-weight="700" font-family="Arial,sans-serif">${idx + 1}</text>
                ${warning}
              </svg>`;
              return (
                <Marker
                  key={`${r.vendedor_id}-${cid}`}
                  position={{ lat: c.gps_lat, lng: c.gps_lng }}
                  icon={{
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                    scaledSize: new google.maps.Size(w, h),
                    anchor: new google.maps.Point(w / 2, h / 2),
                  }}
                  title={`${idx + 1}. ${c.nombre} (${r.vendedor_nombre})${visited ? ' · ✅ Visitado' : ''}${oor ? ` · ⚠️ Fuera de rango` : ''}`}
                  zIndex={500}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export default function MultiRoutePanel({
  results, clientesById, visibility, onToggleVisibility, onApply, applying, applied, onClose,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const totals = useMemo(() => {
    const distOrig = results.reduce((s, r) => s + (r.original_distance_meters || 0), 0);
    const distOpt = results.reduce((s, r) => s + (r.distance_meters || 0), 0);
    const totalSecs = results.reduce((s, r) => s + parseInt(String(r.duration).replace('s', ''), 10) || 0, 0);
    return { distOrig, distOpt, totalSecs, savedM: Math.max(0, distOrig - distOpt) };
  }, [results]);

  return (
    <div className={cn('absolute top-3 right-3 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg w-80 flex flex-col transition-all',
      expanded ? 'max-h-[75vh]' : 'max-h-[42px]')}>
      <button onClick={() => setExpanded(!expanded)} className="px-3 py-2.5 border-b border-border flex items-center justify-between w-full hover:bg-accent/30 rounded-t-xl">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <RouteIcon className="h-3.5 w-3.5 text-primary" />
          {results.length} {results.length === 1 ? 'ruta' : 'rutas'} optimizadas
        </span>
        <div className="flex items-center gap-2">
          {totals.savedM > 0 && (
            <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
              <TrendingDown className="h-3 w-3" />-{(totals.savedM / 1000).toFixed(1)}km
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <>
          <div className="flex-1 overflow-auto">
            {results.map((r, idx) => {
              const color = getRouteColor(idx);
              const visible = visibility[r.vendedor_id];
              const stops = r.optimized_order.length;
              const km = (r.distance_meters / 1000).toFixed(1);
              const savedKm = ((r.original_distance_meters - r.distance_meters) / 1000);
              return (
                <div key={r.vendedor_id} className="px-3 py-2 border-b border-border/30 last:border-0">
                  <div className="flex items-start gap-2">
                    <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-semibold text-foreground truncate flex-1">{r.vendedor_nombre}</div>
                        <button
                          onClick={() => onToggleVisibility(r.vendedor_id)}
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                          title={visible ? 'Ocultar' : 'Mostrar'}
                        >
                          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {r.error ? (
                        <div className="text-[10px] text-destructive mt-0.5">⚠️ {r.error}</div>
                      ) : (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{stops} paradas</span>
                          <span>·</span>
                          <span className="font-medium text-foreground">{km} km</span>
                          <span>·</span>
                          <span>{fmtDuration(r.duration)}</span>
                          {savedKm > 0.05 && (
                            <span className="ml-auto text-emerald-600 font-medium">-{savedKm.toFixed(1)}km</span>
                          )}
                        </div>
                      )}
                      {r.origin.label && <div className="text-[10px] text-muted-foreground/80 truncate">📍 {r.origin.label}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-border bg-muted/30 rounded-b-xl flex items-center gap-2">
            <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Cancelar</button>
            <button
              onClick={onApply}
              disabled={applying || applied || results.every(r => !!r.error)}
              className={cn('ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                applied ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50')}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {applied ? 'Aplicado' : applying ? 'Guardando...' : 'Aplicar cambios'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
