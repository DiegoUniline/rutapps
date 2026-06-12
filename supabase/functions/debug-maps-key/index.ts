import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Temporary diagnostic: tests GOOGLE_MAPS_API_KEY against each Google API.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
  const results: Record<string, unknown> = {
    keyPresent: !!key,
    keyPrefix: key ? key.slice(0, 8) + '…' : null,
  };

  // 1. Routes API computeRoutes
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 19.4326, longitude: -99.1332 } } },
        destination: { location: { latLng: { latitude: 19.44, longitude: -99.14 } } },
        travelMode: 'DRIVE',
      }),
    });
    results.routesApi = { status: r.status, body: (await r.text()).slice(0, 500) };
  } catch (e) { results.routesApi = { error: String(e) }; }

  // 2. Legacy Directions API (what DirectionsService bills against)
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=19.4326,-99.1332&destination=19.44,-99.14&key=${key}`);
    const j = await r.json();
    results.directionsApi = { status: r.status, googleStatus: j.status, error_message: j.error_message ?? null };
  } catch (e) { results.directionsApi = { error: String(e) }; }

  // 3. Geocoding (sanity check of key itself)
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Mexico+City&key=${key}`);
    const j = await r.json();
    results.geocodingApi = { status: r.status, googleStatus: j.status, error_message: j.error_message ?? null };
  } catch (e) { results.geocodingApi = { error: String(e) }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
