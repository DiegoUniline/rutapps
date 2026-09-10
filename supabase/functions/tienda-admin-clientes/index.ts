import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, hashPassword } from "../_shared/tiendaAuth.ts";

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
    const action = String(body.action ?? "");

    const { data: profile } = await admin
      .from("profiles")
      .select("empresa_id, super_admin_override_empresa_id")
      .eq("id", userId)
      .maybeSingle();

    let empresaId: string | null = (profile as any)?.super_admin_override_empresa_id ?? profile?.empresa_id ?? null;
    if (!empresaId) {
      const { data: sa } = await admin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (sa && body.empresa_id) empresaId = String(body.empresa_id);
    }
    if (!empresaId) return json({ error: "Sin empresa" }, 403);

    // ---------- SOLICITUDES DE NUEVOS CLIENTES ----------
    if (action === "requests") {
      const status = String(body.status ?? "pendiente");
      let q = admin.from("tienda_solicitudes_cliente")
        .select("id,status,nombre,contacto,telefono,email,direccion,ciudad,rfc,lista_precio_id,vendedor_id,zona_id,credito,limite_credito,dias_credito,notas_revision,posible_cliente_id,posible_cliente_nombre,posible_motivo,cliente_id,revisado_at,created_at")
        .eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(500);
      if (status !== "todos") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ items: data ?? [] });
    }

    if (action === "request_options") {
      const [listas, vendedores, zonas] = await Promise.all([
        admin.from("lista_precios").select("id,nombre").eq("empresa_id", empresaId).order("nombre"),
        admin.from("profiles").select("id,nombre").eq("empresa_id", empresaId).eq("estado", "activo").order("nombre"),
        admin.from("zonas").select("id,nombre").eq("empresa_id", empresaId).eq("activo", true).order("nombre"),
      ]);
      return json({ listas: listas.data ?? [], vendedores: vendedores.data ?? [], zonas: zonas.data ?? [] });
    }

    if (action === "reject_request") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id requerido" }, 400);
      const { data: sol } = await admin.from("tienda_solicitudes_cliente").select("id,status").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
      if (!sol) return json({ error: "Solicitud no encontrada" }, 404);
      if (sol.status === "aprobada") return json({ error: "Una solicitud aprobada no puede rechazarse" }, 409);
      const { error } = await admin.from("tienda_solicitudes_cliente").update({ status: "rechazada", notas_revision: body.notas_revision ?? null, revisado_por: userId, revisado_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "approve_request") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id requerido" }, 400);
      const { data: sol, error: sErr } = await admin.from("tienda_solicitudes_cliente").select("*").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
      if (sErr) return json({ error: sErr.message }, 500);
      if (!sol) return json({ error: "Solicitud no encontrada" }, 404);
      if (sol.status === "aprobada" && sol.cliente_id) return json({ ok: true, cliente_id: sol.cliente_id, already_approved: true });
      if (sol.status === "rechazada") return json({ error: "La solicitud está rechazada" }, 409);

      const nombre = String(body.nombre ?? sol.nombre ?? "").trim();
      const email = String(body.email ?? sol.email ?? "").toLowerCase().trim();
      if (!nombre || !email) return json({ error: "Nombre y correo son obligatorios" }, 400);

      const listaPrecioId = body.lista_precio_id ? String(body.lista_precio_id) : null;
      const vendedorId = body.vendedor_id ? String(body.vendedor_id) : null;
      const zonaId = body.zona_id ? String(body.zona_id) : null;

      if (listaPrecioId) {
        const { data } = await admin.from("lista_precios").select("id").eq("id", listaPrecioId).eq("empresa_id", empresaId).maybeSingle();
        if (!data) return json({ error: "Lista de precios inválida" }, 400);
      }
      if (vendedorId) {
        const { data } = await admin.from("profiles").select("id").eq("id", vendedorId).eq("empresa_id", empresaId).maybeSingle();
        if (!data) return json({ error: "Vendedor inválido" }, 400);
      }
      if (zonaId) {
        const { data } = await admin.from("zonas").select("id").eq("id", zonaId).eq("empresa_id", empresaId).maybeSingle();
        if (!data) return json({ error: "Zona inválida" }, 400);
      }

      let clienteId: string | null = null;
      const usarExistente = !!body.usar_cliente_existente && !!sol.posible_cliente_id;
      if (usarExistente) {
        const { data: existingCli } = await admin.from("clientes").select("id").eq("id", sol.posible_cliente_id).eq("empresa_id", empresaId).maybeSingle();
        if (!existingCli) return json({ error: "El cliente sugerido ya no existe" }, 404);
        clienteId = existingCli.id;
      }

      if (!clienteId) {
        const { data: byEmail } = await admin.from("clientes").select("id").eq("empresa_id", empresaId).ilike("email", email).limit(1).maybeSingle();
        clienteId = byEmail?.id ?? null;
      }

      const clientePayload: any = {
        nombre,
        contacto: body.contacto ?? sol.contacto ?? null,
        telefono: body.telefono ?? sol.telefono ?? null,
        email,
        direccion: body.direccion ?? sol.direccion ?? null,
        lista_precio_id: listaPrecioId,
        vendedor_id: vendedorId,
        zona_id: zonaId,
        credito: !!body.credito,
        limite_credito: Number(body.limite_credito ?? 0) || 0,
        dias_credito: Math.max(0, Number(body.dias_credito ?? 0) || 0),
        status: "activo",
      };

      if (clienteId) {
        const { error } = await admin.from("clientes").update(clientePayload).eq("id", clienteId).eq("empresa_id", empresaId);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { data: created, error } = await admin.from("clientes").insert({ ...clientePayload, empresa_id: empresaId }).select("id").single();
        if (error || !created) return json({ error: "No se pudo crear el cliente: " + (error?.message ?? "") }, 500);
        clienteId = created.id;
      }

      const { data: currentAccess } = await admin.from("tienda_clientes")
        .select("id,verificado,password_hash").eq("empresa_id", empresaId).eq("cliente_id", clienteId).maybeSingle();
      if (currentAccess?.verificado === false && currentAccess.password_hash === BLOCKED_HASH) return json({ error: "Este cliente está bloqueado en la tienda. Restáuralo primero." }, 409);

      if (currentAccess) {
        const { error } = await admin.from("tienda_clientes").update({ email, telefono: clientePayload.telefono, password_hash: sol.password_hash, verificado: true }).eq("id", currentAccess.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("tienda_clientes").insert({ empresa_id: empresaId, cliente_id: clienteId, email, telefono: clientePayload.telefono, password_hash: sol.password_hash, verificado: true });
        if (error) return json({ error: error.message }, 500);
      }

      const { error: finishErr } = await admin.from("tienda_solicitudes_cliente").update({
        status: "aprobada", cliente_id: clienteId, nombre, contacto: clientePayload.contacto, telefono: clientePayload.telefono, email,
        direccion: clientePayload.direccion, lista_precio_id: listaPrecioId, vendedor_id: vendedorId, zona_id: zonaId,
        credito: clientePayload.credito, limite_credito: clientePayload.limite_credito, dias_credito: clientePayload.dias_credito,
        notas_revision: body.notas_revision ?? null, revisado_por: userId, revisado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (finishErr) return json({ error: finishErr.message }, 500);
      return json({ ok: true, cliente_id: clienteId });
    }

    // ---------- CLIENTES YA EXISTENTES ----------
    if (action === "list") {
      const search = (body.search ?? "").toString().trim();
      let cq = admin.from("clientes").select("id, nombre, email, telefono").eq("empresa_id", empresaId).order("nombre").limit(2000);
      if (search) cq = cq.or(`nombre.ilike.%${search}%,email.ilike.%${search}%`);
      const { data: clientes, error: cErr } = await cq;
      if (cErr) return json({ error: cErr.message }, 500);

      const ids = (clientes ?? []).map((c: any) => c.id);
      const { data: accesos } = ids.length
        ? await admin.from("tienda_clientes").select("id, cliente_id, email, telefono, verificado, ultimo_login, password_hash, created_at").eq("empresa_id", empresaId).in("cliente_id", ids)
        : { data: [] as any[] };
      const byCli: Record<string, any> = {};
      (accesos ?? []).forEach((a: any) => { byCli[a.cliente_id] = a; });
      return json({ items: (clientes ?? []).map((c: any) => {
        const a = byCli[c.id];
        const registrado = !!a && a.password_hash !== BLOCKED_HASH;
        const bloqueado = !!a && a.verificado === false;
        return { cliente_id: c.id, cliente_nombre: c.nombre, cliente_email: c.email, cliente_telefono: c.telefono,
          acceso: a ? { id: a.id, email: a.email, telefono: a.telefono, verificado: a.verificado, ultimo_login: a.ultimo_login, created_at: a.created_at, registrado } : null,
          bloqueado };
      }) });
    }

    if (action === "block") {
      const { cliente_id } = body;
      if (!cliente_id) return json({ error: "cliente_id requerido" }, 400);
      const { data: cli } = await admin.from("clientes").select("id, empresa_id, email, telefono").eq("id", cliente_id).maybeSingle();
      if (!cli || cli.empresa_id !== empresaId) return json({ error: "Cliente no encontrado" }, 404);
      const { data: existing } = await admin.from("tienda_clientes").select("id").eq("empresa_id", empresaId).eq("cliente_id", cliente_id).maybeSingle();
      if (existing) {
        const { error } = await admin.from("tienda_clientes").update({ verificado: false }).eq("id", existing.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const placeholderEmail = (cli.email && String(cli.email).toLowerCase().trim()) || `blocked-${cliente_id}@no-login.local`;
        const { error } = await admin.from("tienda_clientes").insert({ empresa_id: empresaId, cliente_id: cli.id, email: placeholderEmail, password_hash: BLOCKED_HASH, telefono: cli.telefono ?? null, verificado: false });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    if (action === "unblock") {
      const { cliente_id } = body;
      if (!cliente_id) return json({ error: "cliente_id requerido" }, 400);
      const { data: tc } = await admin.from("tienda_clientes").select("id, password_hash").eq("empresa_id", empresaId).eq("cliente_id", cliente_id).maybeSingle();
      if (!tc) return json({ ok: true });
      if (tc.password_hash === BLOCKED_HASH) {
        const { error } = await admin.from("tienda_clientes").delete().eq("id", tc.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("tienda_clientes").update({ verificado: true }).eq("id", tc.id);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    if (action === "reset_password" || action === "set_password") {
      const { tienda_cliente_id, cliente_id, password_nuevo } = body;
      if (!password_nuevo || String(password_nuevo).length < 6) return json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
      const password_hash = await hashPassword(password_nuevo);
      if (tienda_cliente_id) {
        const { data: tc } = await admin.from("tienda_clientes").select("id, empresa_id").eq("id", tienda_cliente_id).maybeSingle();
        if (!tc || tc.empresa_id !== empresaId) return json({ error: "No encontrado" }, 404);
        const { error } = await admin.from("tienda_clientes").update({ password_hash, verificado: true }).eq("id", tienda_cliente_id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      if (!cliente_id) return json({ error: "cliente_id requerido" }, 400);
      const { data: cli } = await admin.from("clientes").select("id, empresa_id, email, telefono").eq("id", cliente_id).maybeSingle();
      if (!cli || cli.empresa_id !== empresaId) return json({ error: "Cliente no encontrado" }, 404);
      if (!cli.email) return json({ error: "Este cliente no tiene correo. Agrégalo primero en su ficha." }, 400);
      const emailNorm = String(cli.email).toLowerCase().trim();
      const { data: existing } = await admin.from("tienda_clientes").select("id").eq("empresa_id", empresaId).eq("cliente_id", cli.id).maybeSingle();
      if (existing) {
        const { error } = await admin.from("tienda_clientes").update({ password_hash, email: emailNorm, telefono: cli.telefono ?? null, verificado: true }).eq("id", existing.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("tienda_clientes").insert({ empresa_id: empresaId, cliente_id: cli.id, email: emailNorm, password_hash, telefono: cli.telefono ?? null, verificado: true });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    return json({ error: "Acción no soportada" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
