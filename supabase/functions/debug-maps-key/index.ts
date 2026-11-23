import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Temporary diagnostic: tests GOOGLE_MAPS_API_KEY against each Google API.
// Seguridad fase 1 (auditoría 2026-11-23): era pública (verify_jwt=false), mostraba el prefijo
// de la llave y gastaba cuota de Google. Retirada: responde 410 sin tocar la llave. El código
// de abajo queda solo como referencia; para borrarla del proyecto se pide CONFIRMO aparte.
const RETIRADA = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (RETIRADA) {
    return new Response(JSON.stringify({ error: 'Función retirada' }), {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
