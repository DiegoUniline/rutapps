import { useMemo } from 'react';
import { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { getRouteColor, type RouteResultEntry } from './MultiRoutePanel';

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

interface ClienteLite {
  id: string; nombre: string; gps_lat: number; gps_lng: number;
  visitado?: boolean; outOfRange?: boolean;
}

/**
 * MapLibre version of MultiRouteOverlay: polylines (as Source/Layer) +
 * numbered stops + origin markers, one set per route.
 */
export function MultiRouteOverlayML({
  results, clientesById, visibility, hidePolylines = false,
}: {
  results: RouteResultEntry[];
  clientesById: Map<string, ClienteLite>;
  visibility: Record<string, boolean>;
  hidePolylines?: boolean;
}) {
  const items = useMemo(
    () => results.map((r, idx) => ({ r, idx, color: getRouteColor(idx) })),
    [results]
  );

  return (
    <>
      {items.map(({ r, color }) => {
        if (!visibility[r.vendedor_id]) return null;
        if (r.error) return null;

        // Build polyline coordinates (handles both single encoded string and JSON array)
        let polylines: [number, number][][] = [];
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
          const fallback: [number, number][] = [];
          if (r.origin && r.origin.lat !== 0 && r.origin.lng !== 0) {
            fallback.push([r.origin.lng, r.origin.lat]);
          }
          for (const cid of r.optimized_order) {
            const c = clientesById.get(cid);
            if (c && c.gps_lat != null && c.gps_lng != null) {
              fallback.push([Number(c.gps_lng), Number(c.gps_lat)]);
            }
          }
          if (fallback.length >= 2) polylines = [fallback];
        }

        const sourceId = `route-${r.vendedor_id}`;
        const featureCollection = {
          type: 'FeatureCollection' as const,
          features: polylines.map((coords) => ({
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: coords },
          })),
        };

        return (
          <div key={r.vendedor_id} style={{ display: 'contents' }}>
            {/* Polylines */}
            {!hidePolylines && polylines.length > 0 && (
              <Source id={sourceId} type="geojson" data={featureCollection}>
                <Layer
                  id={`${sourceId}-casing`}
                  type="line"
                  paint={{ 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.7 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id={`${sourceId}-line`}
                  type="line"
                  paint={{ 'line-color': color, 'line-width': 4, 'line-opacity': 0.9 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {/* Origin marker */}
            <Marker longitude={r.origin.lng} latitude={r.origin.lat} anchor="center">
              <div
                className="rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg"
                style={{
                  width: 26, height: 26,
                  backgroundColor: color,
                  border: '3px solid #fff',
                }}
                title={`Salida: ${r.vendedor_nombre}${r.origin.label ? ` (${r.origin.label})` : ''}`}
              >▶</div>
            </Marker>

            {/* Numbered stops */}
            {r.optimized_order.map((cid, idx) => {
              const c = clientesById.get(cid);
              if (!c || c.gps_lat == null || c.gps_lng == null) return null;
              const visited = !!c.visitado;
              const oor = !!c.outOfRange;
              const fill = visited ? '#22c55e' : color;
              return (
                <Marker
                  key={`${r.vendedor_id}-${cid}`}
                  longitude={Number(c.gps_lng)}
                  latitude={Number(c.gps_lat)}
                  anchor="center"
                >
                  <div className="relative pointer-events-none" title={`${idx + 1}. ${c.nombre}`}>
                    <div
                      className="rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                      style={{
                        width: 28, height: 28,
                        backgroundColor: fill,
                        border: '2.5px solid #fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    >{idx + 1}</div>
                    {oor && (
                      <div
                        className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                        style={{ width: 12, height: 12, backgroundColor: '#f59e0b', border: '1px solid #fff' }}
                      >!</div>
                    )}
                  </div>
                </Marker>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
