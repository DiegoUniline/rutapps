import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyPassword, hashPassword, verifyToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { token, password_actual, password_nuevo } = await req.json();
    if (!token || !password_actual || !password_nuevo) return json({ error: "Faltan campos" }, 400);
    if (String(password_nuevo).length < 6) return json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);

    const payload = await verifyToken(token, Deno.env.get("TIENDA_JWT_SECRET")!);
    if (!payload) return json({ error: "Sesión expirada" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tc } = await supabase
      .from("tienda_clientes")
      .select("id, password_hash")
      .eq("id", payload.tienda_cliente_id)
      .maybeSingle();
    if (!tc) return json({ error: "Cuenta no encontrada" }, 404);

    const ok = await verifyPassword(password_actual, tc.password_hash);
    if (!ok) return json({ error: "Tu contraseña actual no es correcta" }, 401);

    const new_hash = await hashPassword(password_nuevo);
    const { error } = await supabase
      .from("tienda_clientes")
      .update({ password_hash: new_hash })
      .eq("id", tc.id);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
