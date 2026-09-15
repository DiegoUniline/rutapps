import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Error desconocido";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function revokeAllSessions(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        `${supabaseUrl}/auth/v1/admin/users/${userId}/logout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ scope: "global" }),
        },
        7000,
      );
      if (resp.ok || resp.status === 204) return { ok: true };
      lastError = (await resp.text()) || `Auth respondió ${resp.status}`;
    } catch (error) {
      lastError = errorMessage(error);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return { ok: false, error: lastError || "No fue posible cerrar las sesiones" };
}

async function syncBillableUsers(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/manage-subscription`,
        {
          method: "POST",
          headers: {
            Authorization: authorization,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "sync_active_users" }),
        },
        9000,
      );
      const raw = await resp.text();
      let payload: any = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (resp.ok && !payload?.error) return { ok: true, data: payload };
      lastError = payload?.error || raw || `Stripe sync respondió ${resp.status}`;
    } catch (error) {
      lastError = errorMessage(error);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, error: lastError || "No fue posible sincronizar usuarios facturables" };
}

async function recordBillingSyncResult(
  adminClient: any,
  empresaId: string,
  prefix: string,
  result: { ok: boolean; error?: string },
) {
  const now = new Date().toISOString();
  if (result.ok) {
    await adminClient
      .from("subscriptions")
      .update({ stripe_sync_error: null, stripe_sync_error_at: null })
      .eq("empresa_id", empresaId);
    return;
  }

  await adminClient
    .from("subscriptions")
    .update({
      stripe_sync_error: `${prefix}:${result.error || "sync_failed"}`,
      stripe_sync_error_at: now,
    })
    .eq("empresa_id", empresaId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) return json({ error: "No autenticado" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  try {
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !callerId) return json({ error: "Sesión inválida" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const profileId = String(body?.profile_id || "");
    const force = body?.force === true;
    const motivo = typeof body?.motivo === "string" && body.motivo.trim()
      ? body.motivo.trim()
      : null;

    if (!profileId) return json({ error: "profile_id requerido" }, 400);
    if (action !== "archive" && action !== "reactivate") {
      return json({ error: "Acción no soportada" }, 400);
    }

    const [{ data: callerProfile }, { data: isSuperAdmin }] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, empresa_id, estado, archivado_en")
        .eq("user_id", callerId)
        .maybeSingle(),
      adminClient.rpc("is_super_admin", { p_user_id: callerId }),
    ]);

    if (!isSuperAdmin && (!callerProfile || callerProfile.estado !== "activo" || callerProfile.archivado_en)) {
      return json({ error: "Tu usuario no está activo" }, 403);
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, user_id, empresa_id, nombre, estado, archivado_en, archivado_por, archivado_motivo")
      .eq("id", profileId)
      .maybeSingle();

    if (targetError || !target) return json({ error: "Usuario no encontrado" }, 404);

    const { data: isEmpresaAdmin, error: adminCheckError } = await adminClient.rpc("is_empresa_admin", {
      p_user_id: callerId,
      p_empresa_id: target.empresa_id,
    });
    if (adminCheckError || (!isSuperAdmin && !isEmpresaAdmin)) {
      return json({ error: "No autorizado para administrar este usuario" }, 403);
    }

    if (target.user_id === callerId) {
      return json({ error: action === "archive" ? "No puedes archivar tu propio usuario" : "No puedes ejecutar esta acción sobre tu propio usuario" }, 400);
    }

    if (action === "archive") {
      const { data: archiveResult, error: archiveError } = await callerClient.rpc("archivar_usuario", {
        p_profile_id: profileId,
        p_motivo: motivo,
        p_force: force,
      });
      if (archiveError) return json({ error: archiveError.message }, 400);

      const { error: banError } = await adminClient.auth.admin.updateUserById(target.user_id, {
        ban_duration: "876000h",
      });

      if (banError) {
        if (!(archiveResult as any)?.already_archived) {
          await adminClient
            .from("profiles")
            .update({
              estado: target.estado,
              archivado_en: target.archivado_en,
              archivado_por: target.archivado_por,
              archivado_motivo: target.archivado_motivo,
            })
            .eq("id", profileId);
        }
        return json({ error: `No se pudo inhabilitar el acceso del usuario: ${banError.message}` }, 502);
      }

      const sessionResult = await revokeAllSessions(supabaseUrl, serviceRoleKey, target.user_id);
      const billingResult = await syncBillableUsers(supabaseUrl, anonKey, authorization);
      await recordBillingSyncResult(adminClient, target.empresa_id, "user-archive", billingResult);

      return json({
        ok: true,
        archived: true,
        already_archived: Boolean((archiveResult as any)?.already_archived),
        sessions_revoked: sessionResult.ok,
        session_warning: sessionResult.ok ? null : sessionResult.error,
        billing_synced: billingResult.ok,
        billing: billingResult.data || null,
        billing_warning: billingResult.ok ? null : billingResult.error,
      });
    }

    const previousArchive = {
      estado: target.estado,
      archivado_en: target.archivado_en,
      archivado_por: target.archivado_por,
      archivado_motivo: target.archivado_motivo,
    };

    const { data: reactivateResult, error: reactivateError } = await callerClient.rpc("reactivar_usuario", {
      p_profile_id: profileId,
    });
    if (reactivateError) return json({ error: reactivateError.message }, 400);

    const { error: unbanError } = await adminClient.auth.admin.updateUserById(target.user_id, {
      ban_duration: "none",
    });
    if (unbanError) {
      if (!(reactivateResult as any)?.already_active) {
        await adminClient
          .from("profiles")
          .update(previousArchive)
          .eq("id", profileId);
      }
      return json({ error: `No se pudo restaurar el acceso del usuario: ${unbanError.message}` }, 502);
    }

    const billingResult = await syncBillableUsers(supabaseUrl, anonKey, authorization);
    await recordBillingSyncResult(adminClient, target.empresa_id, "user-reactivate", billingResult);

    return json({
      ok: true,
      reactivated: true,
      already_active: Boolean((reactivateResult as any)?.already_active),
      billing_synced: billingResult.ok,
      billing: billingResult.data || null,
      billing_warning: billingResult.ok ? null : billingResult.error,
    });
  } catch (error) {
    console.error("user-lifecycle error", error);
    return json({ error: errorMessage(error) }, 500);
  }
});
