import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, signToken, verifyToken } from "../_shared/tiendaAuth.ts";

const BLOCKED_HASH = "BLOCKED$NO_LOGIN";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido", code: "method_not_allowed" }, 405);

  try {
    const { slug, token } = await req.json();
    if (!slug || !token) {
      return json({ error: "Inicia sesión nuevamente.", code: "session_expired" }, 401);
    }

    const secret = Deno.env.get("TIENDA_JWT_SECRET");
    if (!secret) return json({ error: "La tienda no está configurada correctamente.", code: "server_config" }, 500);

    const payload = await verifyToken(String(token), secret);
    if (!payload) return json({ error: "Tu sesión venció. Inicia sesión nuevamente.", code: "session_expired" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: config, error: configError }, { data: tiendaCliente, error: accountError }] = await Promise.all([
      supabase
        .from("tienda_config")
        .select("empresa_id, activa")
        .eq("slug", String(slug))
        .maybeSingle(),
      supabase
        .from("tienda_clientes")
        .select("id, empresa_id, cliente_id, email, verificado, password_hash")
        .eq("id", payload.tienda_cliente_id)
        .maybeSingle(),
    ]);
    if (configError || accountError) throw configError ?? accountError;

    const { data: cliente, error: clientError } = await supabase
      .from("clientes")
      .select("id, status")
      .eq("id", payload.cliente_id)
      .eq("empresa_id", payload.empresa_id)
      .maybeSingle();
    if (clientError) throw clientError;

    const validAccount = config?.activa === true
      && config.empresa_id === payload.empresa_id
      && tiendaCliente?.empresa_id === payload.empresa_id
      && tiendaCliente?.cliente_id === payload.cliente_id
      && tiendaCliente?.verificado === true
      && tiendaCliente?.password_hash !== BLOCKED_HASH
      && cliente?.status === "activo";

    if (!validAccount) {
      return json({
        error: "Tu acceso ya no está activo. Contacta a tu proveedor.",
        code: "session_expired",
      }, 401);
    }

    const renewedToken = await signToken({
      empresa_id: payload.empresa_id,
      cliente_id: payload.cliente_id,
      tienda_cliente_id: payload.tienda_cliente_id,
      email: tiendaCliente.email,
    }, secret);

    return json({ token: renewedToken, email: tiendaCliente.email });
  } catch {
    return json({ error: "No fue posible renovar la sesión.", code: "session_refresh_failed" }, 500);
  }
});
