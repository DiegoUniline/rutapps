// Sirve UNA cotización pública por su token secreto (token_publico), con
// service-role, filtrando en el servidor. Reemplaza el acceso directo de `anon`
// a la tabla `cotizaciones`, que estaba abierto con RLS USING(true) y permitía
// que cualquiera leyera las cotizaciones de TODAS las empresas.
//
// Seguridad: no requiere sesión (es público), pero SOLO devuelve la cotización
// cuyo token exacto se envía. El token es no-adivinable, así que no se puede
// enumerar ni leer en bloque (que era la fuga).

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Token requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cot } = await supabase
      .from("cotizaciones")
      .select("*")
      .eq("token_publico", token)
      .maybeSingle();

    if (!cot) {
      return new Response(JSON.stringify({ error: "No se encontró la cotización" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: lineas }, { data: empresa }, { data: cliente }] = await Promise.all([
      supabase.from("cotizacion_lineas").select("*").eq("cotizacion_id", cot.id).order("orden"),
      supabase.from("empresas")
        .select("nombre, telefono, email, direccion, ciudad, estado, rfc, logo_url, moneda")
        .eq("id", cot.empresa_id).maybeSingle(),
      cot.cliente_id
        ? supabase.from("clientes").select("nombre, telefono, rfc, direccion").eq("id", cot.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return new Response(
      JSON.stringify({ cotizacion: cot, lineas: lineas ?? [], empresa: empresa ?? null, cliente: cliente ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
