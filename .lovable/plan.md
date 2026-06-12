# Navegación tipo Uber + caché de Google Maps

Plan revisado: sin botón "Abrir en Google Maps", con experiencia in-app completa y tracking en vivo para admin. Cero llamadas a Google por tick de GPS.

---

## FIX 1 — `src/pages/ruta/RutaNavegacionPage.tsx`

### Refs nuevos
- `lastRouteOriginRef` — origen de la última petición Directions.
- `lastRequestTimeRef` — timestamp ms de la última petición.
- `currentRoutePathRef` — `google.maps.LatLng[]` decodificado de la polyline vigente.
- `snappedPosRef` — última posición snapeada (lat/lng).
- `renderedPosRef` — posición actualmente dibujada (para animar).
- `headingRef` — bearing actual del marker.
- `speedHistoryRef` — últimas 5 velocidades (m/s).
- `rafRef` — id de requestAnimationFrame.

### Effect de Directions (línea 276)
- Deps: `[isLoaded, navigatingTo]` (quitar `userLocation?.lat/lng`).
- 1 sola llamada `DirectionsService.route` al cambiar destino.
- Guardar `result`, `overview_path` en `currentRoutePathRef`, `lastRouteOriginRef = userLocation`, `lastRequestTimeRef = Date.now()`.

### Effect de "follow & rerouting + animación" con deps `[userLocation?.lat, userLocation?.lng, navigatingTo]`
1. **Snap-to-route**: helper `projectToPolyline(point, path)` que recorre cada segmento, proyecta el punto sobre el segmento (parámetro t∈[0,1]) y devuelve `{snapped, segmentIndex, t}`.
2. **Bearing**: `bearing(prevSnapped, snapped)` con fórmula estándar.
3. **Animación**: cancelar `rafRef` previo, interpolar `renderedPosRef → snapped` con `requestAnimationFrame` durante ~1 s (easing lineal), actualizando posición y `rotation` del marker.
4. **Velocidad**: empujar a `speedHistoryRef` (máx 5). Promedio con piso 15 km/h (4.17 m/s).
5. **Distancia/ETA en vivo**: helper `remainingDistance(path, segmentIndex, t)` = resto del segmento actual + suma Haversine del resto. ETA = dist / velocidad. Estado `liveEta`, `liveKm` actualizado cada tick.
6. **Polyline bicolor**: dos `<Polyline>` superpuestas con paths derivados del segmento snapeado — recorrido (gris `#cbd5e1`) y restante (azul `--primary`).
7. **Llegada**: si distancia al destino < 50 m → `setNavigatingTo(null)`, mostrar toast/banner "Llegaste", voz "Has llegado".
8. **Re-ruteo**: si distancia mínima del usuario a la polyline > 150 m AND `Date.now()-lastRequestTimeRef > 30_000` → re-pedir Directions.

### Banner fijo "Llegas en X min · Y km"
Sobre el mapa cuando hay `navigatingTo`. Actualizado por estado React.

### Marker del vendedor
`<Marker>` con `icon = { path: FORWARD_CLOSED_ARROW, rotation: headingRef.current, scale: 5, fillColor: 'hsl(var(--primary))' }`.

---

## FIX 2 — Caché de polylines

### Migración

```sql
CREATE TABLE public.ruta_polyline_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  vendedor_id uuid NOT NULL,
  waypoints_hash text NOT NULL,
  encoded_polyline text NOT NULL,
  distancia_total_m integer,
  duracion_total_s integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, waypoints_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruta_polyline_cache TO authenticated;
GRANT ALL ON public.ruta_polyline_cache TO service_role;
ALTER TABLE public.ruta_polyline_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa access" ON public.ruta_polyline_cache FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM profiles WHERE user_id = auth.uid()));
CREATE INDEX ON public.ruta_polyline_cache (empresa_id, vendedor_id);
```

### `supabase/functions/optimize-route/index.ts`
- `sha256Hex(json)` con `crypto.subtle.digest`.
- `waypoints_hash = sha256(JSON.stringify([origin, ...orderedWp.map(w=>[w.lat,w.lng])]))`.
- Si `preserve_order=true`: `SELECT` cache por `(vendedor_id, waypoints_hash)`. Hit → devolver cacheado sin llamar a Google.
- Miss / `preserve_order=false`: llamar `fetchGooglePolyline` como hoy, luego `upsert` con `onConflict: 'vendedor_id,waypoints_hash'`.
- No tocar cuota ni `optimizacion_rutas_log`.

---

## FIX 3 — Caché de matriz

### Migración

```sql
CREATE TABLE public.distancia_cache (
  empresa_id uuid NOT NULL,
  origen_hash text NOT NULL,
  destino_hash text NOT NULL,
  distancia_m integer NOT NULL,
  duracion_s integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, origen_hash, destino_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distancia_cache TO authenticated;
GRANT ALL ON public.distancia_cache TO service_role;
ALTER TABLE public.distancia_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa access" ON public.distancia_cache FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM profiles WHERE user_id = auth.uid()));
```

### `buildRealDistanceMatrix`
- `pointHash(p) = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}``.
- `SELECT` cache con `IN (...)` de orígenes y destinos del set. Llenar `matrix[i][j]` con hits.
- Detectar pares faltantes. Llamar `computeRouteMatrix` por bloques de ≤25×25 solo con los faltantes.
- `upsert` con `onConflict: 'empresa_id,origen_hash,destino_hash'`.
- Sin API key o >60 paradas: Haversine como hoy.

---

## FIX 4 — Tracking en vivo para admin

### Migración

```sql
CREATE TABLE public.vendedor_posicion (
  vendedor_id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  heading numeric,
  speed numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedor_posicion TO authenticated;
GRANT ALL ON public.vendedor_posicion TO service_role;
ALTER TABLE public.vendedor_posicion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa access" ON public.vendedor_posicion FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM profiles WHERE user_id = auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendedor_posicion;
ALTER TABLE public.vendedor_posicion REPLICA IDENTITY FULL;
```

### Vendedor (RutaNavegacionPage)
- Ref `lastUploadAtRef`. En cada tick GPS: si `Date.now()-lastUploadAtRef ≥ 5000`, `upsert` a `vendedor_posicion` con `{vendedor_id, empresa_id, lat, lng, heading, speed}`.

### Admin (MapaClientesPage)
- Hook nuevo `useLiveVendedorPosiciones(empresaId)`:
  - `useEffect` con `supabase.channel('vendedor_posicion')`.
  - `on('postgres_changes', {event:'*', schema:'public', table:'vendedor_posicion', filter:`empresa_id=eq.${empresaId}`})`.
  - Mantener `Map<vendedor_id, posicion>` en estado.
  - Cleanup `supabase.removeChannel`.
- Por cada vendedor: `<Marker>` animado igual que en navegación (interpolación + rotación) usando los mismos helpers compartidos.
- Polyline de cada vendedor obtenida de `ruta_polyline_cache` (query existente / nueva query por `vendedor_id`). Decodificar con `google.maps.geometry.encoding.decodePath` (sin llamadas a Google).
- Pins de paradas: estado por `cliente_orden_ruta` + `entregas`/`visitas` → color gris/azul-pulsante/verde, actualizado por Realtime existente.

---

## Helpers de geometría compartidos — `src/lib/routeGeometry.ts`

Funciones puras (sin Google), implementación propia:
- `haversine(a,b)`
- `bearing(a,b)`
- `projectPointToSegment(p, a, b)` → `{point, t, dist}`
- `projectToPolyline(p, path)` → `{snapped, segmentIndex, t, distToRoute}`
- `remainingDistance(path, segmentIndex, t)`
- `splitPolylineAt(path, segmentIndex, t)` → `[traveled, remaining]`
- `animatePosition(from, to, durationMs, onTick)` con `requestAnimationFrame`

Usados tanto por `RutaNavegacionPage` (vendedor) como por `MapaClientesPage` (admin).

---

## Archivos tocados
- `supabase/migrations/<new>.sql` — 3 tablas + RLS + publicación realtime
- `supabase/functions/optimize-route/index.ts` — hash + caché polylines + caché matriz
- `src/lib/routeGeometry.ts` (nuevo)
- `src/pages/ruta/RutaNavegacionPage.tsx` — refs, effect split, snap+animación, banner ETA, upload 5 s
- `src/hooks/useLiveVendedorPosiciones.ts` (nuevo)
- `src/pages/logistica/MapaClientesPage.tsx` (o equivalente) — markers en vivo + polylines desde caché + pins por estado

## Garantía de costo
| Evento | Llamadas Google |
|---|---|
| Tick GPS vendedor | 0 |
| Tick GPS admin viendo mapa | 0 |
| Empezar navegación a parada | 1 Directions |
| Desvío >150 m & >30 s | 1 Directions |
| Abrir MapaClientesPage con orden guardado | 0 |
| Optimizar set ya cacheado | 0 |
