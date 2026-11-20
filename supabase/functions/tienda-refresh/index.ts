// Renueva la sesión de la tienda en línea. La sesión NO se cierra por tiempo: un
// token con firma válida se renueva aunque ya haya vencido (el cliente pudo pasar
// meses sin entrar). Solo se rechaza (401 → la tienda cierra sesión) si la firma
// no es válida, la tienda ya no está activa o el cliente fue bloqueado/eliminado.
// Errores de base de datos responden 500 y la tienda conserva la sesión.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BLOCKED_HASH, corsHeaders, json, sesionVencida, signToken, verifyToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, token } = await req.json();
    if (!slug || !token) return sesionVencida();

    const secret = Deno.env.get("TIENDA_JWT_SECRET")!;
    const payload = await verifyToken(String(token), secret, { aceptarVencido: true });
    if (!payload) return sesionVencida();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cfg, error: cfgErr } = await supabase
      .from("tienda_config").select("empresa_id").eq("slug", slug).eq("activa", true).maybeSingle();
    if (cfgErr) return json({ error: cfgErr.message }, 500);
    if (!cfg || cfg.empresa_id !== payload.empresa_id) {
      return sesionVencida();
    }

    const { data: tc, error: tcErr } = await supabase
      .from("tienda_clientes")
      .select("id, cliente_id, email, verificado, password_hash")
      .eq("id", payload.tienda_cliente_id)
      .eq("empresa_id", payload.empresa_id)
      .maybeSingle();
    if (tcErr) return json({ error: tcErr.message }, 500);
    if (!tc || tc.verificado === false || tc.password_hash === BLOCKED_HASH) {
      return sesionVencida();
    }

    const nuevo = await signToken({
      empresa_id: payload.empresa_id,
      cliente_id: tc.cliente_id,
      tienda_cliente_id: tc.id,
      email: tc.email ?? payload.email,
    }, secret);

    return json({ token: nuevo, email: tc.email ?? payload.email });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
