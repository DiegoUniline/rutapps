import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MONTHLY_LIMIT = 50;

/** Haversine distance in meters */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest-neighbor TSP heuristic starting from origin */
function nearestNeighborOrder(
  origin: { lat: number; lng: number },
  waypoints: { id: string; lat: number; lng: number }[]
): number[] {
  const n = waypoints.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];
  let current = origin;

  for (let step = 0; step < n; step++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = haversine(current, waypoints[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    visited[bestIdx] = true;
    order.push(bestIdx);
    current = waypoints[bestIdx];
  }
  return order;
}

/** 2-opt local improvement */
function twoOptImprove(
  origin: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  order: number[]
): number[] {
  const route = [...order];
  const n = route.length;

  const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversine(a, b);
  const pos = (i: number) => (i === -1 ? origin : waypoints[route[i]]);

  let improved = true;
  let iterations = 0;
  const maxIterations = n * n; // prevent excessive looping for large sets

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const prevI = pos(i - 1);
        const curI = waypoints[route[i]];
        const curJ = waypoints[route[j]];
        const nextJ = j + 1 < n ? waypoints[route[j + 1]] : origin;

        const currentDist = dist(prevI, curI) + dist(curJ, nextJ);
        const newDist = dist(prevI, curJ) + dist(curI, nextJ);

        if (newDist < currentDist - 1) {
          // Reverse segment from i to j
          let left = i, right = j;
          while (left < right) {
            [route[left], route[right]] = [route[right], route[left]];
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }
  return route;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Check admin role
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role_id, roles(nombre, es_sistema)")
      .eq("user_id", userId);

    const isAdmin = userRoles?.some(
      (ur: any) => {
        const roleName = (ur.roles?.nombre ?? "").toLowerCase();
        return ur.roles?.es_sistema === true || roleName.includes("admin");
      }
    );

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden optimizar rutas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get empresa_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userId)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Perfil no encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check monthly limit
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: monthlyCount } = await supabase
      .from("optimizacion_rutas_log")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", profile.empresa_id)
      .gte("created_at", firstOfMonth);

    if ((monthlyCount ?? 0) >= MONTHLY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `Límite mensual alcanzado (${MONTHLY_LIMIT} optimizaciones por mes). Se renueva el día 1 del siguiente mes.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { origin, waypoints, dia_filtro } = await req.json();

    if (!origin || !origin.lat || !origin.lng) {
      return new Response(
        JSON.stringify({ error: "Se necesita un punto de partida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 1) {
      return new Response(
        JSON.stringify({ error: "Se necesita al menos 1 cliente con GPS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log usage
    await supabase.from("optimizacion_rutas_log").insert({
      empresa_id: profile.empresa_id,
      user_id: userId,
      dia_filtro: dia_filtro || null,
      clientes_count: waypoints.length,
    });

    // ---- Step 1: Local TSP optimization (nearest-neighbor + 2-opt) ----
    const nnOrder = nearestNeighborOrder(origin, waypoints);
    const optimizedLocalOrder = twoOptImprove(origin, waypoints, nnOrder);
    const localOrderedWaypoints = optimizedLocalOrder.map(idx => waypoints[idx]);

    console.log("Local TSP order:", optimizedLocalOrder);

    // ---- Step 2: Try Google Routes API for polyline (with our order, no re-optimize) ----
    let polyline: string | null = null;
    let distanceMeters = 0;
    let duration = "0s";

    if (googleApiKey) {
      try {
        // Send waypoints in our optimized order WITHOUT asking Google to re-optimize
        const routeRequest: any = {
          origin: {
            location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
          },
          destination: {
            location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
          },
          travelMode: "DRIVE",
          optimizeWaypointOrder: false, // We already optimized locally
          routeModifiers: { avoidTolls: false, avoidHighways: false },
        };

        if (localOrderedWaypoints.length > 0) {
          routeRequest.intermediates = localOrderedWaypoints.map((wp: any) => ({
            location: { latLng: { latitude: wp.lat, longitude: wp.lng } },
          }));
        }

        const routeResponse = await fetch(
          "https://routes.googleapis.com/directions/v2:computeRoutes",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": googleApiKey,
              "X-Goog-FieldMask":
                "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
            },
            body: JSON.stringify(routeRequest),
          }
        );

        if (routeResponse.ok) {
          const routeData = await routeResponse.json();
          const route = routeData.routes?.[0];
          if (route) {
            polyline = route.polyline?.encodedPolyline ?? null;
            distanceMeters = route.distanceMeters ?? 0;
            duration = route.duration ?? "0s";
          }
        } else {
          console.error("Google Routes API error:", await routeResponse.text());
        }
      } catch (e) {
        console.error("Google Routes API fetch error:", e);
      }
    }

    // If no Google polyline, estimate distance from local order
    if (distanceMeters === 0) {
      let totalDist = haversine(origin, localOrderedWaypoints[0]);
      for (let i = 0; i < localOrderedWaypoints.length - 1; i++) {
        totalDist += haversine(localOrderedWaypoints[i], localOrderedWaypoints[i + 1]);
      }
      totalDist += haversine(localOrderedWaypoints[localOrderedWaypoints.length - 1], origin);
      distanceMeters = Math.round(totalDist * 1.3); // ~30% road factor
      const avgSpeedMs = 8.33; // ~30 km/h urban
      duration = `${Math.round(totalDist * 1.3 / avgSpeedMs)}s`;
    }

    const remaining = MONTHLY_LIMIT - (monthlyCount ?? 0) - 1;

    return new Response(
      JSON.stringify({
        optimized_order: localOrderedWaypoints.map((wp: any) => wp.id),
        duration,
        distance_meters: distanceMeters,
        polyline,
        remaining_this_month: remaining,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Optimize route error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
