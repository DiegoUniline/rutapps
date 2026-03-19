import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return new Response(JSON.stringify({ error: "Token requerido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get lista_precios by share_token
    const { data: lista, error: listaErr } = await supabase
      .from("lista_precios")
      .select("id, nombre, empresa_id, tarifa_id, share_activo")
      .eq("share_token", token)
      .eq("activa", true)
      .single();

    if (listaErr || !lista) return new Response(JSON.stringify({ error: "Catálogo no encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!lista.share_activo) return new Response(JSON.stringify({ error: "Catálogo desactivado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 2. Get empresa info
    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre, logo_url, telefono, moneda")
      .eq("id", lista.empresa_id)
      .single();

    // 3. Get price lines
    const { data: lineas } = await supabase
      .from("lista_precios_lineas")
      .select("producto_id, precio")
      .eq("lista_precio_id", lista.id);

    const precioMap = new Map((lineas ?? []).map((l: any) => [l.producto_id, l.precio]));
    const productoIds = [...precioMap.keys()];

    if (productoIds.length === 0) {
      return new Response(JSON.stringify({
        empresa,
        lista_nombre: lista.nombre,
        productos: [],
        categorias: [],
        marcas: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Get products
    const { data: productos } = await supabase
      .from("productos")
      .select("id, nombre, descripcion, sku, categoria, marca, imagen_url, unidad_venta, activo")
      .eq("empresa_id", lista.empresa_id)
      .eq("activo", true)
      .in("id", productoIds);

    const enriched = (productos ?? []).map((p: any) => ({
      ...p,
      precio: precioMap.get(p.id) ?? 0,
    })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

    // 5. Unique categories/brands
    const categorias = [...new Set(enriched.map((p: any) => p.categoria).filter(Boolean))].sort();
    const marcas = [...new Set(enriched.map((p: any) => p.marca).filter(Boolean))].sort();

    return new Response(JSON.stringify({
      empresa,
      lista_nombre: lista.nombre,
      productos: enriched,
      categorias,
      marcas,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
