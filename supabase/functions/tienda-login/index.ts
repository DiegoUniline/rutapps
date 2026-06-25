import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyPassword, signToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, email, password } = await req.json();
    if (!slug || !email || !password) return json({ error: "Campos requeridos" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("empresa_id")
      .eq("slug", slug)
      .eq("activa", true)
      .maybeSingle();
    if (!cfg) return json({ error: "Tienda no disponible" }, 404);

    const normalEmail = String(email).toLowerCase().trim();
    const { data: tc } = await supabase
      .from("tienda_clientes")
      .select("id, cliente_id, password_hash")
      .eq("empresa_id", cfg.empresa_id)
      .eq("email", normalEmail)
      .maybeSingle();
    if (!tc) return json({ error: "Correo o contraseña incorrectos" }, 401);

    const ok = await verifyPassword(password, tc.password_hash);
    if (!ok) return json({ error: "Correo o contraseña incorrectos" }, 401);

    await supabase.from("tienda_clientes").update({ ultimo_login: new Date().toISOString() }).eq("id", tc.id);

    const secret = Deno.env.get("TIENDA_JWT_SECRET")!;
    const token = await signToken({
      empresa_id: cfg.empresa_id,
      cliente_id: tc.cliente_id,
      tienda_cliente_id: tc.id,
      email: normalEmail,
    }, secret);

    return json({ token, email: normalEmail });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
