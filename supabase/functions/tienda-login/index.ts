import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyPassword, hashPassword, signToken } from "../_shared/tiendaAuth.ts";

const DEFAULT_PASSWORD = "123456";
const BLOCKED_HASH = "BLOCKED$NO_LOGIN";

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

    let { data: tc } = await supabase
      .from("tienda_clientes")
      .select("id, cliente_id, password_hash, verificado")
      .eq("empresa_id", cfg.empresa_id)
      .eq("email", normalEmail)
      .maybeSingle();

    // Auto-provision: every cliente of the empresa has access by default with password "123456"
    if (!tc) {
      const { data: cli } = await supabase
        .from("clientes")
        .select("id, email, telefono")
        .eq("empresa_id", cfg.empresa_id)
        .ilike("email", normalEmail)
        .limit(1)
        .maybeSingle();
      if (!cli) return json({ error: "Correo o contraseña incorrectos" }, 401);

      const { data: blocked } = await supabase
        .from("tienda_clientes")
        .select("id, verificado, password_hash")
        .eq("empresa_id", cfg.empresa_id)
        .eq("cliente_id", cli.id)
        .maybeSingle();
      if (blocked && (blocked.verificado === false || blocked.password_hash === BLOCKED_HASH)) {
        return json({ error: "Tu acceso a esta tienda fue bloqueado. Contacta al proveedor." }, 403);
      }

      if (password !== DEFAULT_PASSWORD) {
        return json({ error: "Correo o contraseña incorrectos" }, 401);
      }

      const password_hash = await hashPassword(DEFAULT_PASSWORD);
      const { data: inserted, error: insErr } = await supabase
        .from("tienda_clientes")
        .insert({
          empresa_id: cfg.empresa_id,
          cliente_id: cli.id,
          email: normalEmail,
          password_hash,
          telefono: cli.telefono ?? null,
          verificado: true,
        })
        .select("id, cliente_id, password_hash, verificado")
        .single();
      if (insErr) return json({ error: insErr.message }, 500);
      tc = inserted;
    }

    if (tc.verificado === false || tc.password_hash === BLOCKED_HASH) {
      return json({ error: "Tu acceso a esta tienda fue bloqueado. Contacta al proveedor." }, 403);
    }

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
