import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, hashPassword, signToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, email, password, nombre, contacto, telefono, direccion, ciudad, rfc } = await req.json();
    if (!slug || !email || !password || !nombre) return json({ error: "Campos requeridos" }, 400);
    if (String(password).length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("empresa_id, activa")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg || !cfg.activa) return json({ error: "Tienda no disponible" }, 404);

    const normalEmail = String(email).toLowerCase().trim().replace(/\s+/g, "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalEmail)) return json({ error: "Correo inválido" }, 400);
    const normalPhone = String(telefono ?? "").replace(/\D/g, "").slice(-10);

    // Ya tiene acceso a tienda.
    const { data: existing } = await supabase
      .from("tienda_clientes")
      .select("id, verificado")
      .eq("empresa_id", cfg.empresa_id)
      .eq("email", normalEmail)
      .maybeSingle();
    if (existing) {
      if (existing.verificado === false) return json({ error: "Tu acceso a esta tienda fue bloqueado." }, 403);
      return json({ error: "Este correo ya está registrado en esta tienda" }, 409);
    }

    // Si ya existe como cliente CRM, sólo crea su acceso: no requiere una nueva aprobación comercial.
    const { data: clienteExist } = await supabase
      .from("clientes")
      .select("id, telefono")
      .eq("empresa_id", cfg.empresa_id)
      .ilike("email", normalEmail)
      .limit(1)
      .maybeSingle();

    const password_hash = await hashPassword(String(password));
    if (clienteExist) {
      const { data: blockedByCli } = await supabase
        .from("tienda_clientes")
        .select("id, verificado")
        .eq("empresa_id", cfg.empresa_id)
        .eq("cliente_id", clienteExist.id)
        .maybeSingle();
      if (blockedByCli?.verificado === false) return json({ error: "Tu acceso a esta tienda fue bloqueado." }, 403);
      if (blockedByCli) await supabase.from("tienda_clientes").delete().eq("id", blockedByCli.id);

      const { data: tc, error: tcErr } = await supabase.from("tienda_clientes").insert({
        empresa_id: cfg.empresa_id,
        cliente_id: clienteExist.id,
        email: normalEmail,
        password_hash,
        telefono: telefono ?? clienteExist.telefono ?? null,
        verificado: true,
        ultimo_login: new Date().toISOString(),
      }).select("id").single();
      if (tcErr || !tc) return json({ error: "No se pudo registrar: " + (tcErr?.message ?? "") }, 500);

      const token = await signToken({
        empresa_id: cfg.empresa_id,
        cliente_id: clienteExist.id,
        tienda_cliente_id: tc.id,
        email: normalEmail,
      }, Deno.env.get("TIENDA_JWT_SECRET")!);
      return json({ token, email: normalEmail, existing_customer: true });
    }

    // Detecta posibles duplicados por teléfono/nombre, pero NO los enlaza automáticamente.
    let posible: any = null;
    if (normalPhone) {
      const { data } = await supabase.from("clientes")
        .select("id,nombre,telefono")
        .eq("empresa_id", cfg.empresa_id)
        .ilike("telefono", `%${normalPhone}%`)
        .limit(1).maybeSingle();
      posible = data ?? null;
    }
    if (!posible) {
      const { data } = await supabase.from("clientes")
        .select("id,nombre,telefono")
        .eq("empresa_id", cfg.empresa_id)
        .ilike("nombre", String(nombre).trim())
        .limit(1).maybeSingle();
      posible = data ?? null;
    }

    const requestPayload = {
      empresa_id: cfg.empresa_id,
      tienda_slug: slug,
      status: "pendiente",
      nombre: String(nombre).trim(),
      contacto: contacto ? String(contacto).trim() : null,
      telefono: telefono ? String(telefono).trim() : null,
      email: normalEmail,
      direccion: direccion ? String(direccion).trim() : null,
      ciudad: ciudad ? String(ciudad).trim() : null,
      rfc: rfc ? String(rfc).trim().toUpperCase() : null,
      password_hash,
      posible_cliente_id: posible?.id ?? null,
      posible_cliente_nombre: posible?.nombre ?? null,
      posible_motivo: posible ? (normalPhone && String(posible.telefono ?? "").replace(/\D/g, "").slice(-10) === normalPhone ? "telefono" : "nombre") : null,
      updated_at: new Date().toISOString(),
    };

    const { data: pending } = await supabase.from("tienda_solicitudes_cliente")
      .select("id")
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "pendiente")
      .ilike("email", normalEmail)
      .limit(1).maybeSingle();

    let requestId: string | null = null;
    if (pending) {
      const { data, error } = await supabase.from("tienda_solicitudes_cliente")
        .update(requestPayload).eq("id", pending.id).select("id").single();
      if (error) throw error; requestId = data?.id ?? pending.id;
    } else {
      const { data, error } = await supabase.from("tienda_solicitudes_cliente")
        .insert(requestPayload).select("id").single();
      if (error) throw error; requestId = data?.id ?? null;
    }

    return json({
      pending: true,
      request_id: requestId,
      email: normalEmail,
      possible_duplicate: posible ? { cliente_id: posible.id, nombre: posible.nombre } : null,
      message: "Solicitud enviada. La empresa revisará tus datos y habilitará tu cuenta.",
    }, 202);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
