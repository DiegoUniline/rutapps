// Edge function: route-ors
// Calls OpenRouteService Directions API to get a road-following polyline
// for an ordered list of coordinates. No optimization — respects the order received.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

interface Body {
  coordinates: [number, number][]; // [lng, lat][] in visit order
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENROUTESERVICE_API_KEY no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;
    if (!Array.isArray(body?.coordinates) || body.coordinates.length < 2) {
      return new Response(JSON.stringify({ error: 'Se requieren al menos 2 coordenadas [lng,lat]' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ORS limit on free tier: 50 waypoints
    const coords = body.coordinates.slice(0, 50);

    const orsRes = await fetch(ORS_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      body: JSON.stringify({
        coordinates: coords,
        instructions: false,
      }),
    });

    if (!orsRes.ok) {
      const txt = await orsRes.text();
      console.error('ORS error', orsRes.status, txt);
      return new Response(JSON.stringify({ error: `ORS ${orsRes.status}`, detail: txt }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geojson = await orsRes.json();
    const feature = geojson?.features?.[0];
    const summary = feature?.properties?.summary ?? {};

    return new Response(
      JSON.stringify({
        geometry: feature?.geometry ?? null, // LineString GeoJSON
        distanceMeters: summary.distance ?? null,
        durationSeconds: summary.duration ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
