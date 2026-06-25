import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, hashPassword } from "../_shared/tiendaAuth.ts";

// Admin endpoint to manage tienda customer logins.
// Model: ALL clientes of the empresa have access by default.
// Admin can BLOCK a specific cliente (creates/updates a tienda_clientes row with verificado=false).
// Admin can RESET PASSWORD only for clientes that have already self-registered.

const BLOCKED_HASH = "BLOCKED$NO_LOGIN";

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

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    const { data: profile } = await admin
      .from("profiles")
      .select("empresa_id, super_admin_override_empresa_id")
      .eq("id", userId)
      .maybeSingle();

    let empresaId: string | null =
      (profile as any)?.super_admin_override_empresa_id ?? profile?.empresa_id ?? null;

    if (!empresaId) {
      const { data: sa } = await admin
        .from("super_admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (sa && body.empresa_id) empresaId = String(body.empresa_id);
    }

    if (!empresaId) return json({ error: "Sin empresa" }, 403);

    if (action === "list") {
      const search = (body.search ?? "").toString().trim();
      let cq = admin
        .from("clientes")
        .select("id, nombre, email, telefono")
        .eq("empresa_id", empresaId)
        .order("nombre")
        .limit(2000);
      if (search) cq = cq.or(`nombre.ilike.%${search}%,email.ilike.%${search}%`);
      const { data: clientes, error: cErr } = await cq;
      if (cErr) return json({ error: cErr.message }, 500);

      const ids = (clientes ?? []).map((c: any) => c.id);
      const { data: accesos } = ids.length
        ? await admin
            .from("tienda_clientes")
            .select("id, cliente_id, email, telefono, verificado, ultimo_login, password_hash, created_at")
            .eq("empresa_id", empresaId)
            .in("cliente_id", ids)
        : { data: [] as any[] };
      const byCli: Record<string, any> = {};
      (accesos ?? []).forEach((a: any) => { byCli[a.cliente_id] = a; });

      const items = (clientes ?? []).map((c: any) => {
        const a = byCli[c.id];
        const registrado = !!a && a.password_hash !== BLOCKED_HASH;
        const bloqueado = !!a && a.verificado === false;
        return {
          cliente_id: c.id,
          cliente_nombre: c.nombre,
          cliente_email: c.email,
          cliente_telefono: c.telefono,
          acceso: a
            ? {
                id: a.id,
                email: a.email,
                telefono: a.telefono,
                verificado: a.verificado,
                ultimo_login: a.ultimo_login,
                created_at: a.created_at,
                registrado,
              }
            : null,
          bloqueado,
        };
      });
      return json({ items });
    }

    if (action === "block") {
      const { cliente_id } = body;
      if (!cliente_id) return json({ error: "cliente_id requerido" }, 400);
      const { data: cli } = await admin
        .from("clientes")
        .select("id, empresa_id, email, telefono")
        .eq("id", cliente_id)
        .maybeSingle();
      if (!cli || cli.empresa_id !== empresaId) return json({ error: "Cliente no encontrado" }, 404);

      const { data: existing } = await admin
        .from("tienda_clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("cliente_id", cliente_id)
        .maybeSingle();

      if (existing) {
        const { error } = await admin
          .from("tienda_clientes")
          .update({ verificado: false })
          .eq("id", existing.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const placeholderEmail = (cli.email && String(cli.email).toLowerCase().trim()) || `blocked-${cliente_id}@no-login.local`;
        const { error } = await admin.from("tienda_clientes").insert({
          empresa_id: empresaId,
          cliente_id: cli.id,
          email: placeholderEmail,
          password_hash: BLOCKED_HASH,
          telefono: cli.telefono ?? null,
          verificado: false,
        });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    if (action === "unblock") {
      const { cliente_id } = body;
      if (!cliente_id) return json({ error: "cliente_id requerido" }, 400);
      const { data: tc } = await admin
        .from("tienda_clientes")
        .select("id, password_hash")
        .eq("empresa_id", empresaId)
        .eq("cliente_id", cliente_id)
        .maybeSingle();
      if (!tc) return json({ ok: true }); // ya tenía acceso por defecto
      if (tc.password_hash === BLOCKED_HASH) {
        // Was just a block marker → remove so the cliente can self-register normally
        const { error } = await admin.from("tienda_clientes").delete().eq("id", tc.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin
          .from("tienda_clientes")
          .update({ verificado: true })
          .eq("id", tc.id);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const { tienda_cliente_id, password_nuevo } = body;
      if (!tienda_cliente_id || !password_nuevo || String(password_nuevo).length < 6) {
        return json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
      }
      const { data: tc } = await admin
        .from("tienda_clientes")
        .select("id, empresa_id, password_hash")
        .eq("id", tienda_cliente_id)
        .maybeSingle();
      if (!tc || tc.empresa_id !== empresaId) return json({ error: "No encontrado" }, 404);
      if (tc.password_hash === BLOCKED_HASH) return json({ error: "Este cliente no se ha registrado todavía" }, 400);

      const password_hash = await hashPassword(password_nuevo);
      const { error } = await admin
        .from("tienda_clientes")
        .update({ password_hash })
        .eq("id", tienda_cliente_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Acción no soportada" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
