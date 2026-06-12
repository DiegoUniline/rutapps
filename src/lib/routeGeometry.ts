/**
 * Geometría local para navegación tipo Uber (sin llamadas a Google).
 * Todas las distancias en metros. Coordenadas como { lat, lng }.
 */

export interface LatLng { lat: number; lng: number; }

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Bearing 0..360 (norte = 0, este = 90). */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Proyección lat/lng a un plano local en metros centrado en `ref` (suficiente <50km). */
function toLocalXY(p: LatLng, ref: LatLng): { x: number; y: number } {
  const dLat = toRad(p.lat - ref.lat);
  const dLng = toRad(p.lng - ref.lng);
  return { x: dLng * Math.cos(toRad(ref.lat)) * R, y: dLat * R };
}
function fromLocalXY(xy: { x: number; y: number }, ref: LatLng): LatLng {
  const lat = ref.lat + toDeg(xy.y / R);
  const lng = ref.lng + toDeg(xy.x / (R * Math.cos(toRad(ref.lat))));
  return { lat, lng };
}

/** Proyecta `p` sobre el segmento [a,b]. Devuelve punto, t∈[0,1] y distancia (m). */
export function projectPointToSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number; dist: number } {
  const A = toLocalXY(a, a);
  const B = toLocalXY(b, a);
  const P = toLocalXY(p, a);
  const dx = B.x - A.x, dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: A.x + t * dx, y: A.y + t * dy };
  const point = fromLocalXY(proj, a);
  const dist = Math.hypot(P.x - proj.x, P.y - proj.y);
  return { point, t, dist };
}

/** Proyecta `p` a la polilínea: encuentra el segmento más cercano. */
export function projectToPolyline(p: LatLng, path: LatLng[]): {
  snapped: LatLng; segmentIndex: number; t: number; distToRoute: number;
} {
  if (path.length === 0) return { snapped: p, segmentIndex: 0, t: 0, distToRoute: 0 };
  if (path.length === 1) return { snapped: path[0], segmentIndex: 0, t: 0, distToRoute: haversine(p, path[0]) };
  let best = { snapped: path[0], segmentIndex: 0, t: 0, distToRoute: Infinity };
  for (let i = 0; i < path.length - 1; i++) {
    const r = projectPointToSegment(p, path[i], path[i + 1]);
    if (r.dist < best.distToRoute) {
      best = { snapped: r.point, segmentIndex: i, t: r.t, distToRoute: r.dist };
    }
  }
  return best;
}

/** Distancia restante (m) desde el punto snapeado hasta el final de la polilínea. */
export function remainingDistance(path: LatLng[], segmentIndex: number, t: number): number {
  if (path.length < 2 || segmentIndex >= path.length - 1) return 0;
  const a = path[segmentIndex], b = path[segmentIndex + 1];
  const segLen = haversine(a, b);
  let total = segLen * (1 - t);
  for (let i = segmentIndex + 1; i < path.length - 1; i++) {
    total += haversine(path[i], path[i + 1]);
  }
  return total;
}

/** Divide la polilínea en [recorrida, restante] respecto al punto snapeado. */
export function splitPolylineAt(path: LatLng[], segmentIndex: number, t: number, snapped: LatLng): { traveled: LatLng[]; remaining: LatLng[] } {
  if (path.length === 0) return { traveled: [], remaining: [] };
  const traveled = path.slice(0, segmentIndex + 1).concat([snapped]);
  const remaining = [snapped, ...path.slice(segmentIndex + 1)];
  return { traveled, remaining };
}

/**
 * Anima la posición visual de `from` a `to` durante `durationMs`.
 * Devuelve un función `cancel` y dispara `onTick(pos, rotation)`.
 */
export function animatePosition(
  from: LatLng,
  to: LatLng,
  durationMs: number,
  onTick: (pos: LatLng, rotation: number) => void,
): () => void {
  const startTs = performance.now();
  const rot = bearing(from, to);
  let rafId = 0;
  let cancelled = false;
  const step = (now: number) => {
    if (cancelled) return;
    const k = Math.min(1, (now - startTs) / durationMs);
    const pos = { lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k };
    onTick(pos, rot);
    if (k < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
  return () => { cancelled = true; cancelAnimationFrame(rafId); };
}
