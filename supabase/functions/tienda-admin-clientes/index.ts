import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, hashPassword } from "../_shared/tiendaAuth.ts";

// Admin endpoint to manage tienda customer logins.
// Auth: Bearer = caller's Supabase JWT (user must belong to empresa_id from their profile).
// Actions: list, reset_password, create_login, deactivate, activate

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "No autorizado" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: uErr } = await admin.auth.getUser(jwt);
    if (uErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);
    const userId = userData.user.id;

    const { data: profile } = await admin
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.empresa_id) return json({ error: "Sin empresa" }, 403);
    const empresaId = profile.empresa_id;

    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      const search = (body.search ?? "").toString().trim();
      let q = admin
        .from("tienda_clientes")
        .select("id, cliente_id, email, telefono, verificado, ultimo_login, created_at, clientes(nombre)")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (search) q = q.ilike("email", `%${search}%`);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ items: data ?? [] });
    }

    if (action === "reset_password") {
      const { tienda_cliente_id, password_nuevo } = body;
      if (!tienda_cliente_id || !password_nuevo || String(password_nuevo).length < 6) {
        return json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
      }
      // Ensure record belongs to this empresa
      const { data: tc } = await admin
        .from("tienda_clientes")
        .select("id, empresa_id")
        .eq("id", tienda_cliente_id)
        .maybeSingle();
      if (!tc || tc.empresa_id !== empresaId) return json({ error: "No encontrado" }, 404);

      const password_hash = await hashPassword(password_nuevo);
      const { error } = await admin
        .from("tienda_clientes")
        .update({ password_hash })
        .eq("id", tienda_cliente_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "create_login") {
      const { cliente_id, email, password } = body;
      if (!cliente_id || !email || !password || String(password).length < 6) {
        return json({ error: "Cliente, correo y contraseña (mín. 6) son obligatorios" }, 400);
      }
      const normalEmail = String(email).toLowerCase().trim();
      const { data: cli } = await admin
        .from("clientes")
        .select("id, empresa_id, nombre, telefono")
        .eq("id", cliente_id)
        .maybeSingle();
      if (!cli || cli.empresa_id !== empresaId) return json({ error: "Cliente no encontrado" }, 404);

      const { data: exists } = await admin
        .from("tienda_clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("email", normalEmail)
        .maybeSingle();
      if (exists) return json({ error: "Ese correo ya tiene acceso" }, 409);

      const password_hash = await hashPassword(password);
      const { error } = await admin.from("tienda_clientes").insert({
        empresa_id: empresaId,
        cliente_id: cli.id,
        email: normalEmail,
        password_hash,
        telefono: cli.telefono ?? null,
        verificado: true,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "deactivate" || action === "activate") {
      const { tienda_cliente_id } = body;
      const { data: tc } = await admin
        .from("tienda_clientes")
        .select("id, empresa_id")
        .eq("id", tienda_cliente_id)
        .maybeSingle();
      if (!tc || tc.empresa_id !== empresaId) return json({ error: "No encontrado" }, 404);
      const { error } = await admin
        .from("tienda_clientes")
        .update({ verificado: action === "activate" })
        .eq("id", tienda_cliente_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "buscar_clientes") {
      const search = (body.search ?? "").toString().trim();
      if (search.length < 2) return json({ items: [] });
      const { data, error } = await admin
        .from("clientes")
        .select("id, nombre, email, telefono")
        .eq("empresa_id", empresaId)
        .or(`nombre.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(20);
      if (error) return json({ error: error.message }, 500);
      return json({ items: data ?? [] });
    }

    return json({ error: "Acción no soportada" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
