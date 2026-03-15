import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_MAPS_API_KEY no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
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
      (ur: any) => ur.roles?.es_sistema === true || ur.roles?.nombre?.toLowerCase() === "admin"
    );

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden optimizar rutas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get request body
    const { waypoints, dia_filtro } = await req.json();

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return new Response(
        JSON.stringify({ error: "Se necesitan al menos 2 clientes con GPS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Log usage
    await supabase.from("optimizacion_rutas_log").insert({
      empresa_id: profile.empresa_id,
      user_id: userId,
      dia_filtro: dia_filtro || null,
      clientes_count: waypoints.length,
    });

    // Call Google Routes API - Compute Routes with waypoint optimization
    // Use the first waypoint as origin, last as destination, rest as intermediates
    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediates = waypoints.slice(1, -1);

    const routeRequest: any = {
      origin: {
        location: {
          latLng: { latitude: origin.lat, longitude: origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destination.lat, longitude: destination.lng },
        },
      },
      travelMode: "DRIVE",
      optimizeWaypointOrder: true,
    };

    if (intermediates.length > 0) {
      routeRequest.intermediates = intermediates.map((wp: any) => ({
        location: {
          latLng: { latitude: wp.lat, longitude: wp.lng },
        },
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
            "routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify(routeRequest),
      }
    );

    if (!routeResponse.ok) {
      const errorBody = await routeResponse.text();
      console.error("Google Routes API error:", errorBody);
      return new Response(
        JSON.stringify({
          error: `Error de Google Routes API (${routeResponse.status})`,
          details: errorBody,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const routeData = await routeResponse.json();
    const route = routeData.routes?.[0];

    if (!route) {
      return new Response(
        JSON.stringify({ error: "No se pudo calcular la ruta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build optimized order: origin + reordered intermediates + destination
    const optimizedIndexes = route.optimizedIntermediateWaypointIndex ?? [];
    const optimizedOrder: number[] = [0]; // origin is first
    for (const idx of optimizedIndexes) {
      optimizedOrder.push(idx + 1); // +1 because intermediates start at index 1
    }
    optimizedOrder.push(waypoints.length - 1); // destination is last

    // Map back to client IDs in optimized order
    const optimizedWaypoints = optimizedOrder.map((idx) => waypoints[idx]);

    return new Response(
      JSON.stringify({
        optimized_order: optimizedWaypoints.map((wp: any) => wp.id),
        duration: route.duration,
        distance_meters: route.distanceMeters,
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
