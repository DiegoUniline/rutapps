import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "slug requerido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg, error } = await supabase
      .from("tienda_config")
      .select("id, empresa_id, slug, activa, nombre_tienda, banner_url, logo_url, color_primario, color_secundario, whatsapp_pedidos, lista_precios_default_id, permitir_invitados, mensaje_bienvenida, beneficios, usar_lista_cliente")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !cfg) return json({ error: "Tienda no encontrada" }, 404);
    if (!cfg.activa) return json({ error: "Esta tienda no está activa" }, 403);

    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre, logo_url, telefono, moneda")
      .eq("id", cfg.empresa_id)
      .maybeSingle();

    return json({ config: cfg, empresa });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
