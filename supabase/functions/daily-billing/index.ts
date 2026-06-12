import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Mexico_City";

const log = (step: string, details?: any) =>
  console.log(`[DAILY-BILLING] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

function nowInMx(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: TZ });
  return new Date(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  let authorized = !!(cronSecret && provided && provided === cronSecret);
  if (!authorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: claims } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
        if (claims?.claims?.sub) {
          const { data: isSA } = await sb.rpc("is_super_admin", { p_user_id: claims.claims.sub });
          if (isSA) authorized = true;
        }
      } catch (_) { /* noop */ }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const now = nowInMx();
    const today = now.toISOString().slice(0, 10);
    const dayOfMonth = now.getDate();

    log("Cron started", { today, dayOfMonth });

    const result: Record<string, any> = { today, dayOfMonth };

    // ── Bloquear empresas con facturas pendientes vencidas (3 días de gracia) ──
    // Regla: si una empresa tiene UNA factura pendiente/procesando/past_due cuya
    // fecha de vencimiento ya pasó (o cuya fecha_emision + 3 días ya pasó si
    // fecha_vencimiento es NULL), debe bloquearse. Esto se evalúa SIEMPRE,
    // no solo a partir del día 4 del mes — un cobro puede emitirse en cualquier día.
    {
      // 1) Backfill defensivo: cualquier factura pendiente sin fecha_vencimiento
      //    recibe fecha_emision + 3 días.
      const { data: sinVenc } = await supabase
        .from("facturas")
        .select("id, fecha_emision")
        .in("estado", ["pendiente", "procesando", "past_due"])
        .is("fecha_vencimiento", null);
      for (const f of sinVenc || []) {
        const emi = f.fecha_emision ? new Date(f.fecha_emision) : new Date();
        const venc = new Date(emi.getTime() + 3 * 86400000).toISOString();
        await supabase.from("facturas").update({ fecha_vencimiento: venc }).eq("id", f.id);
      }
      if ((sinVenc?.length || 0) > 0) log("Backfilled fecha_vencimiento", { count: sinVenc!.length });

      // 2) Buscar facturas pendientes ya vencidas → candidatos a bloqueo.
      const { data: vencidas } = await supabase
        .from("facturas")
        .select("empresa_id, numero_factura, fecha_vencimiento, estado")
        .in("estado", ["pendiente", "procesando", "past_due"])
        .lt("fecha_vencimiento", new Date().toISOString());

      const empresasConVencidas = Array.from(
        new Set((vencidas || []).map((f: any) => f.empresa_id).filter(Boolean))
      );

      const idsBloqueables: string[] = [];
      for (const empresaId of empresasConVencidas) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("acceso_bloqueado, es_manual, status")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        if (!sub) continue;
        if (sub.es_manual) continue;          // pagos manuales — no automatizar bloqueo
        if (sub.acceso_bloqueado) continue;   // ya bloqueada
        idsBloqueables.push(empresaId);
      }

      if (idsBloqueables.length > 0) {
        const { error: errUpd } = await supabase
          .from("subscriptions")
          .update({ acceso_bloqueado: true, status: "past_due", updated_at: new Date().toISOString() })
          .in("empresa_id", idsBloqueables);
        if (errUpd) log("Block update error", errUpd);
        else log("Blocked (factura vencida)", { count: idsBloqueables.length, ids: idsBloqueables });
      }
      result.blocked_count = idsBloqueables.length;
      result.empresas_con_facturas_vencidas = empresasConVencidas.length;
    }

    // ── DÍA 1: Reset acceso_bloqueado para que entren los días 1-3 de gracia ──
    if (dayOfMonth === 1) {
      const { data: trialing } = await supabase
        .from("subscriptions")
        .select("empresa_id")
        .eq("acceso_bloqueado", true)
        .neq("es_manual", true);

      const ids = (trialing || []).map((s: any) => s.empresa_id);
      if (ids.length > 0) {
        await supabase
          .from("subscriptions")
          .update({ acceso_bloqueado: false, updated_at: new Date().toISOString() })
          .in("empresa_id", ids);
        log("Grace period reset", { count: ids.length });
      }
      result.unblocked_for_grace = ids.length;
    }

    // ── Marcar trials vencidos como past_due (el cobro se hace al usuario al iniciar checkout) ──
    const { data: trialsExpired } = await supabase
      .from("subscriptions")
      .select("empresa_id, trial_ends_at")
      .eq("status", "trial")
      .lt("trial_ends_at", new Date().toISOString());

    if (trialsExpired && trialsExpired.length > 0) {
      const ids = trialsExpired.map((s: any) => s.empresa_id);
      await supabase
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .in("empresa_id", ids);
      log("Trials expired -> past_due", { count: ids.length });
      result.trials_expired = ids.length;
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[DAILY-BILLING] ERROR:", error);
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
