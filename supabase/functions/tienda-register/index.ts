import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, hashPassword, signToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, email, password, nombre, telefono } = await req.json();
    if (!slug || !email || !password || !nombre) return json({ error: "Campos requeridos" }, 400);
    if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

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

    const normalEmail = String(email).toLowerCase().trim();

    // Check existing tienda_clientes by email
    const { data: existing } = await supabase
      .from("tienda_clientes")
      .select("id, verificado, password_hash")
      .eq("empresa_id", cfg.empresa_id)
      .eq("email", normalEmail)
      .maybeSingle();
    if (existing) {
      if (existing.verificado === false) return json({ error: "Tu acceso a esta tienda fue bloqueado." }, 403);
      return json({ error: "Este correo ya está registrado en esta tienda" }, 409);
    }

    // Find or create cliente in CRM
    let clienteId: string | null = null;
    const { data: clienteExist } = await supabase
      .from("clientes")
      .select("id")
      .eq("empresa_id", cfg.empresa_id)
      .ilike("email", normalEmail)
      .maybeSingle();
    if (clienteExist) {
      clienteId = clienteExist.id;
    } else {
      const { data: nuevoCli, error: cliErr } = await supabase
        .from("clientes")
        .insert({
          empresa_id: cfg.empresa_id,
          nombre,
          email: normalEmail,
          telefono: telefono ?? null,
          status: "activo",
        })
        .select("id")
        .single();
      if (cliErr || !nuevoCli) return json({ error: "No se pudo crear el cliente: " + (cliErr?.message ?? "") }, 500);
      clienteId = nuevoCli.id;
    }

    // If this cliente was blocked (by cliente_id), reject
    const { data: blockedByCli } = await supabase
      .from("tienda_clientes")
      .select("id, verificado")
      .eq("empresa_id", cfg.empresa_id)
      .eq("cliente_id", clienteId!)
      .maybeSingle();
    if (blockedByCli && blockedByCli.verificado === false) {
      return json({ error: "Tu acceso a esta tienda fue bloqueado." }, 403);
    }
    // If a placeholder block row existed but somehow verificado=true (shouldn't), remove it before insert to avoid unique conflict
    if (blockedByCli) {
      await supabase.from("tienda_clientes").delete().eq("id", blockedByCli.id);
    }

    const password_hash = await hashPassword(password);
    const { data: tc, error: tcErr } = await supabase
      .from("tienda_clientes")
      .insert({
        empresa_id: cfg.empresa_id,
        cliente_id: clienteId,
        email: normalEmail,
        password_hash,
        telefono: telefono ?? null,
        verificado: true,
        ultimo_login: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (tcErr || !tc) return json({ error: "No se pudo registrar: " + (tcErr?.message ?? "") }, 500);

    const secret = Deno.env.get("TIENDA_JWT_SECRET")!;
    const token = await signToken({
      empresa_id: cfg.empresa_id,
      cliente_id: clienteId!,
      tienda_cliente_id: tc.id,
      email: normalEmail,
    }, secret);

    return json({ token, email: normalEmail });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
