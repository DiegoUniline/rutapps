import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MONTHLY_LIMIT = 200; // higher limit since multi-route can call several at once
const MAX_WAYPOINTS_PER_REQUEST = 23; // Google Routes hard limit is 25 incl. origin/destination

type LatLng = { lat: number; lng: number };
type Waypoint = LatLng & { id: string };

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestNeighborOrder(origin: LatLng, waypoints: Waypoint[]): number[] {
  const n = waypoints.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];
  let current: LatLng = origin;
  for (let step = 0; step < n; step++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = haversine(current, waypoints[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    visited[bestIdx] = true;
    order.push(bestIdx);
    current = waypoints[bestIdx];
  }
  return order;
}

function twoOptImprove(origin: LatLng, waypoints: Waypoint[], order: number[]): number[] {
  const route = [...order];
  const n = route.length;
  const pos = (i: number) => (i === -1 ? origin : waypoints[route[i]]);
  let improved = true;
  let iterations = 0;
  const maxIterations = Math.min(n * n, 400);
  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const prevI = pos(i - 1);
        const curI = waypoints[route[i]];
        const curJ = waypoints[route[j]];
        const nextJ = j + 1 < n ? waypoints[route[j + 1]] : origin;
        const currentDist = haversine(prevI, curI) + haversine(curJ, nextJ);
        const newDist = haversine(prevI, curJ) + haversine(curI, nextJ);
        if (newDist < currentDist - 1) {
          let left = i, right = j;
          while (left < right) {
            [route[left], route[right]] = [route[right], route[left]];
            left++; right--;
          }
          improved = true;
        }
      }
    }
  }
  return route;
}

function totalOriginalDistance(origin: LatLng, waypoints: Waypoint[]): number {
  if (waypoints.length === 0) return 0;
  let d = haversine(origin, waypoints[0]);
  for (let i = 0; i < waypoints.length - 1; i++) d += haversine(waypoints[i], waypoints[i + 1]);
  d += haversine(waypoints[waypoints.length - 1], origin);
  return d;
}

async function fetchGooglePolyline(
  googleApiKey: string,
  origin: LatLng,
  ordered: Waypoint[]
): Promise<{ polyline: string | null; distanceMeters: number; duration: string }> {
  // chunk if needed (>23 intermediates)
  if (ordered.length === 0) return { polyline: null, distanceMeters: 0, duration: "0s" };

  const chunks: Waypoint[][] = [];
  for (let i = 0; i < ordered.length; i += MAX_WAYPOINTS_PER_REQUEST) {
    chunks.push(ordered.slice(i, i + MAX_WAYPOINTS_PER_REQUEST));
  }

  let totalDistance = 0;
  let totalSeconds = 0;
  const polylines: string[] = [];
  let chunkOrigin = origin;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const isLast = ci === chunks.length - 1;
    const chunkDest = isLast ? origin : chunk[chunk.length - 1];
    const intermediates = isLast ? chunk : chunk.slice(0, -1);

    const body: any = {
      origin: { location: { latLng: { latitude: chunkOrigin.lat, longitude: chunkOrigin.lng } } },
      destination: { location: { latLng: { latitude: chunkDest.lat, longitude: chunkDest.lng } } },
      travelMode: "DRIVE",
      optimizeWaypointOrder: false,
      routeModifiers: { avoidTolls: false, avoidHighways: false },
    };
    if (intermediates.length > 0) {
      body.intermediates = intermediates.map(wp => ({
        location: { latLng: { latitude: wp.lat, longitude: wp.lng } }
      }));
    }

    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error("Google Routes chunk error:", await res.text());
        continue;
      }
      const data = await res.json();
      const route = data.routes?.[0];
      if (!route) continue;
      totalDistance += route.distanceMeters ?? 0;
      const sec = parseInt(String(route.duration ?? "0").replace("s", ""), 10);
      if (!isNaN(sec)) totalSeconds += sec;
      if (route.polyline?.encodedPolyline) polylines.push(route.polyline.encodedPolyline);
    } catch (e) {
      console.error("Google Routes chunk fetch error:", e);
    }
    chunkOrigin = chunkDest;
  }

  // Returning multiple polylines as a JSON-encoded array (frontend will decode each)
  return {
    polyline: polylines.length === 1 ? polylines[0] : (polylines.length > 1 ? JSON.stringify(polylines) : null),
    distanceMeters: totalDistance,
    duration: `${totalSeconds}s`,
  };
}

interface RouteInput {
  /** Identifier for this route (e.g. vendedor_id or 'default') */
  key: string;
  origin: LatLng;
  waypoints: Waypoint[];
  /** If true, skip NN+2-opt and use waypoints in the given order (for restoring saved routes) */
  preserve_order?: boolean;
}

interface RouteResult {
  key: string;
  optimized_order: string[];
  polyline: string | null;
  distance_meters: number;
  duration: string;
  original_distance_meters: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const googleApiKey = Deno.env.get("GOOGLE_ROUTES_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role_id, roles(nombre, es_sistema)")
      .eq("user_id", userId);
    const isAdmin = userRoles?.some((ur: any) => {
      const roleName = (ur.roles?.nombre ?? "").toLowerCase();
      return ur.roles?.es_sistema === true || roleName.includes("admin");
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo administradores pueden optimizar rutas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabase
      .from("profiles").select("empresa_id").eq("user_id", userId).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Perfil no encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();

    // Build a unified list of routes to process. Supports BOTH legacy and new payload.
    // Legacy: { origin, waypoints, dia_filtro }
    // New:    { routes: [{ key, origin, waypoints }], dia_filtro }
    let routesIn: RouteInput[] = [];
    if (Array.isArray(body.routes)) {
      routesIn = body.routes.filter((r: any) =>
        r && r.origin && r.origin.lat != null && r.origin.lng != null && Array.isArray(r.waypoints) && r.waypoints.length >= 1
      );
    } else if (body.origin && Array.isArray(body.waypoints)) {
      routesIn = [{ key: "default", origin: body.origin, waypoints: body.waypoints }];
    }

    if (routesIn.length === 0) {
      return new Response(JSON.stringify({ error: "Se necesita al menos una ruta con origen y al menos 1 cliente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Quota check (each optimization counts as 1; preserve_order calls are free)
    const optimizingCount = routesIn.filter(r => r.preserve_order !== true).length;
    if (optimizingCount > 0) {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count: monthlyCount } = await supabase
        .from("optimizacion_rutas_log")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", profile.empresa_id)
        .gte("created_at", firstOfMonth);

      const used = monthlyCount ?? 0;
      if (used + optimizingCount > MONTHLY_LIMIT) {
        return new Response(JSON.stringify({
          error: `Límite mensual alcanzado (${MONTHLY_LIMIT} optimizaciones por mes). Disponibles: ${Math.max(0, MONTHLY_LIMIT - used)}, requeridas: ${optimizingCount}.`,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const results: RouteResult[] = [];

    // Process each route independently (atomic per-route)
    for (const r of routesIn) {
      try {
        const preserveOrder = r.preserve_order === true;

        // Only count toward quota if we are actually optimizing (not just drawing saved routes)
        if (!preserveOrder) {
          await supabase.from("optimizacion_rutas_log").insert({
            empresa_id: profile.empresa_id,
            user_id: userId,
            dia_filtro: body.dia_filtro || null,
            clientes_count: r.waypoints.length,
          });
        }

        const original = totalOriginalDistance(r.origin, r.waypoints);
        let orderedWp: Waypoint[];
        if (preserveOrder) {
          orderedWp = r.waypoints;
        } else {
          const nn = nearestNeighborOrder(r.origin, r.waypoints);
          const optimized = twoOptImprove(r.origin, r.waypoints, nn);
          orderedWp = optimized.map(idx => r.waypoints[idx]);
        }

        let polyline: string | null = null;
        let distanceMeters = 0;
        let duration = "0s";

        if (googleApiKey) {
          const g = await fetchGooglePolyline(googleApiKey, r.origin, orderedWp);
          polyline = g.polyline;
          distanceMeters = g.distanceMeters;
          duration = g.duration;
        }

        if (distanceMeters === 0) {
          let totalDist = haversine(r.origin, orderedWp[0]);
          for (let i = 0; i < orderedWp.length - 1; i++) {
            totalDist += haversine(orderedWp[i], orderedWp[i + 1]);
          }
          totalDist += haversine(orderedWp[orderedWp.length - 1], r.origin);
          distanceMeters = Math.round(totalDist * 1.3);
          duration = `${Math.round(totalDist * 1.3 / 8.33)}s`;
        }

        results.push({
          key: r.key,
          optimized_order: orderedWp.map(wp => wp.id),
          polyline,
          distance_meters: distanceMeters,
          duration,
          original_distance_meters: Math.round(original * 1.3),
        });
      } catch (e: any) {
        console.error(`Error optimizing route ${r.key}:`, e);
        results.push({
          key: r.key, optimized_order: [], polyline: null,
          distance_meters: 0, duration: "0s", original_distance_meters: 0,
          error: e?.message || "Error desconocido",
        });
      }
    }

    const remaining = Math.max(0, MONTHLY_LIMIT - (await (async () => {
      const fm = new Date(); fm.setDate(1); fm.setHours(0,0,0,0);
      const { count } = await supabase.from("optimizacion_rutas_log")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", profile.empresa_id)
        .gte("created_at", fm.toISOString());
      return count ?? 0;
    })()));

    // Backwards-compatible response: when single route, expose top-level fields too.
    const single = results.length === 1 ? results[0] : null;

    return new Response(JSON.stringify({
      routes: results,
      remaining_this_month: remaining,
      ...(single ? {
        optimized_order: single.optimized_order,
        polyline: single.polyline,
        distance_meters: single.distance_meters,
        duration: single.duration,
      } : {}),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Optimize route error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
