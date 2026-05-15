import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_DOMAIN = "sandbox.rutapp.mx";

function randomToken(len = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1) Authenticate caller (must be an active partner) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userRes.user.id;

    const { data: partner } = await admin
      .from("partners")
      .select("id, ref_slug, nombre, email, estado, sandbox_empresa_id")
      .eq("user_id", callerId)
      .eq("estado", "activo")
      .maybeSingle();

    if (!partner) {
      return new Response(JSON.stringify({ error: "No eres partner activo" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2) Resolve sandbox empresa (create if missing) ──
    let sandboxEmail: string | null = null;
    let sandboxUserId: string | null = null;

    if (partner.sandbox_empresa_id) {
      const { data: emp } = await admin
        .from("empresas")
        .select("id, owner_user_id, email")
        .eq("id", partner.sandbox_empresa_id)
        .maybeSingle();
      if (emp?.owner_user_id) {
        sandboxUserId = emp.owner_user_id;
        sandboxEmail = emp.email;
      }
    }

    if (!sandboxUserId) {
      // Create fresh sandbox auth user + empresa
      const sandboxNombre = `Sandbox de ${partner.nombre}`;
      sandboxEmail = `sandbox-${partner.ref_slug}-${randomToken(4)}@${SANDBOX_DOMAIN}`;
      const password = `Sbx!${randomToken(16)}`;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: sandboxEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: `${partner.nombre} (Sandbox)`,
          empresa_nombre: sandboxNombre,
          is_partner_sandbox: true,
        },
      });
      if (createErr) throw createErr;
      sandboxUserId = created.user!.id;

      // Wait for handle_new_user trigger to create empresa/profile
      let eid: string | null = null;
      for (let i = 0; i < 30; i++) {
        const { data: profile } = await admin
          .from("profiles")
          .select("empresa_id")
          .eq("user_id", sandboxUserId)
          .maybeSingle();
        if (profile?.empresa_id) { eid = profile.empresa_id; break; }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!eid) throw new Error("No se pudo provisionar el sandbox");

      // Mark empresa as sandbox
      await admin.from("empresas").update({
        nombre: sandboxNombre,
        is_partner_sandbox: true,
        partner_owner_id: partner.id,
        rfc: "XAXX010101000",
        razon_social: sandboxNombre,
      }).eq("id", eid);

      // Manual active subscription (no billing)
      await admin.from("subscriptions").update({
        es_manual: true,
        acceso_bloqueado: false,
        status: "active",
        updated_at: new Date().toISOString(),
      }).eq("empresa_id", eid);

      // Save linkage on partner
      await admin.from("partners")
        .update({ sandbox_empresa_id: eid })
        .eq("id", partner.id);
    }

    // ── 3) Generate magic sign-in link ──
    const origin = req.headers.get("origin") ?? "https://rutapp.mx";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: sandboxEmail!,
      options: { redirectTo: `${origin}/dashboard` },
    });
    if (linkErr) throw linkErr;

    return new Response(
      JSON.stringify({
        action_link: linkData.properties?.action_link,
        sandbox_email: sandboxEmail,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("partner-sandbox-login error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
