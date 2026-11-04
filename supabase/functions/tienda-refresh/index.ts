// Renueva la sesión de la tienda en línea (sesión deslizante): mientras el cliente siga
// entrando, su sesión no vence. Solo renueva si el token es válido, la tienda sigue
// activa y el cliente no fue bloqueado; si no, responde 401 y el front cierra sesión.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, signToken, verifyToken } from "../_shared/tiendaAuth.ts";

const BLOCKED_HASH = "BLOCKED$NO_LOGIN";
const TTL_SEGUNDOS = 60 * 60 * 24 * 90; // 90 días sin entrar → vence

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, token } = await req.json();
    if (!slug || !token) return json({ error: "Sesión expirada", code: "sesion_expirada" }, 401);

    const secret = Deno.env.get("TIENDA_JWT_SECRET")!;
    const payload = await verifyToken(String(token), secret);
    if (!payload) return json({ error: "Sesión expirada", code: "sesion_expirada" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cfg, error: cfgErr } = await supabase
      .from("tienda_config").select("empresa_id").eq("slug", slug).eq("activa", true).maybeSingle();
    if (cfgErr) return json({ error: cfgErr.message }, 500);
    if (!cfg || cfg.empresa_id !== payload.empresa_id) {
      return json({ error: "Sesión expirada", code: "sesion_expirada" }, 401);
    }

    const { data: tc, error: tcErr } = await supabase
      .from("tienda_clientes")
      .select("id, cliente_id, email, verificado, password_hash")
      .eq("id", payload.tienda_cliente_id)
      .eq("empresa_id", payload.empresa_id)
      .maybeSingle();
    if (tcErr) return json({ error: tcErr.message }, 500);
    if (!tc || tc.verificado === false || tc.password_hash === BLOCKED_HASH) {
      return json({ error: "Sesión expirada", code: "sesion_expirada" }, 401);
    }

    const nuevo = await signToken({
      empresa_id: payload.empresa_id,
      cliente_id: tc.cliente_id,
      tienda_cliente_id: tc.id,
      email: tc.email ?? payload.email,
    }, secret, TTL_SEGUNDOS);

    return json({ token: nuevo, email: tc.email ?? payload.email });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
