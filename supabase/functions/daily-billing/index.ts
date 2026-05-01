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

    // ── DÍA 4+: Bloquear empresas sin pago confirmado ──
    if (dayOfMonth >= 4) {
      const { data: bloqueables, error: errSelect } = await supabase
        .from("subscriptions")
        .select("empresa_id, fecha_vencimiento, status, es_manual")
        .neq("es_manual", true)
        .eq("acceso_bloqueado", false)
        .or(`fecha_vencimiento.lt.${today},fecha_vencimiento.is.null`)
        .neq("status", "trial");

      if (errSelect) log("Select error", errSelect);

      const ids = (bloqueables || []).map((s: any) => s.empresa_id);
      if (ids.length > 0) {
        const { error: errUpd } = await supabase
          .from("subscriptions")
          .update({ acceso_bloqueado: true, status: "past_due", updated_at: new Date().toISOString() })
          .in("empresa_id", ids);
        if (errUpd) log("Block update error", errUpd);
        else log("Blocked", { count: ids.length, ids });
      }
      result.blocked_count = ids.length;
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
