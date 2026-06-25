import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "token requerido" }, 401);
    const payload = await verifyToken(token, Deno.env.get("TIENDA_JWT_SECRET")!);
    if (!payload) return json({ error: "Sesión expirada" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, folio, fecha, status, total, saldo_pendiente, origen")
      .eq("empresa_id", payload.empresa_id)
      .eq("cliente_id", payload.cliente_id)
      .order("fecha", { ascending: false })
      .limit(100);

    return json({ pedidos: ventas ?? [] });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
