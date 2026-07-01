// Re-ancla suscripciones activas al día 1° 08:00 CDMX (14:00 UTC)
// Sin doble cobro: proration_behavior='none' + trial_end=nuevoAncla
// Uso: GET ?dryRun=true para previsualizar, luego sin dryRun para aplicar.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[REANCHOR] ${s}${d ? " " + JSON.stringify(d) : ""}`);

// Devuelve el próximo 1° del mes a las 14:00 UTC (=08:00 CDMX) posterior a `after`.
function nextAnchorUtc(after: Date): Date {
  const y = after.getUTCFullYear();
  const m = after.getUTCMonth();
  // Candidato: 1° del mes SIGUIENTE al mes de `after`
  let cand = new Date(Date.UTC(y, m + 1, 1, 14, 0, 0));
  // Si after < 1° actual 14:00 UTC, usamos ese
  const thisMonth1 = new Date(Date.UTC(y, m, 1, 14, 0, 0));
  if (after.getTime() < thisMonth1.getTime()) cand = thisMonth1;
  return cand;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "true";
    const limitParam = Number(url.searchParams.get("limit") ?? "500");

    // Auth: Super Admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData, error: uErr } = await sb.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (uErr || !userData.user) throw new Error("Auth failed");
    const { data: isSa } = await sb
      .from("super_admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!isSa) throw new Error("Solo super admin");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    const results: any[] = [];
    let processed = 0;
    let skipped = 0;
    let updated = 0;
    let errors = 0;

    // Recorre suscripciones activas + trialing
    for (const status of ["active", "trialing"] as const) {
      let startingAfter: string | undefined;
      // deno-lint-ignore no-constant-condition
      while (true) {
        const page = await stripe.subscriptions.list({
          status,
          limit: 100,
          starting_after: startingAfter,
        });
        for (const sub of page.data) {
          if (processed >= limitParam) break;
          processed++;
          try {
            const already = sub.metadata?.reanchored_cdmx_8am === "true";
            if (already) {
              skipped++;
              results.push({ id: sub.id, action: "skip_already_done" });
              continue;
            }
            const cpeSec = (sub as any).current_period_end as number | undefined;
            if (!cpeSec) {
              skipped++;
              results.push({ id: sub.id, action: "skip_no_period_end" });
              continue;
            }
            const cpe = new Date(cpeSec * 1000);
            if (cpe.getTime() <= Date.now()) {
              skipped++;
              results.push({ id: sub.id, action: "skip_expired" });
              continue;
            }
            const newAnchor = nextAnchorUtc(cpe);
            const diffMin = Math.abs(newAnchor.getTime() - cpe.getTime()) / 60000;
            if (diffMin < 10) {
              // Ya está alineado; solo marca metadata
              if (!dryRun) {
                await stripe.subscriptions.update(sub.id, {
                  metadata: { ...sub.metadata, reanchored_cdmx_8am: "true" },
                });
              }
              skipped++;
              results.push({ id: sub.id, action: "skip_already_aligned", cpe: cpe.toISOString() });
              continue;
            }
            const newAnchorSec = Math.floor(newAnchor.getTime() / 1000);
            const entry: any = {
              id: sub.id,
              customer: sub.customer,
              status,
              old_period_end: cpe.toISOString(),
              new_anchor: newAnchor.toISOString(),
              action: dryRun ? "would_reanchor" : "reanchored",
            };
            if (!dryRun) {
              await stripe.subscriptions.update(sub.id, {
                billing_cycle_anchor: newAnchorSec,
                proration_behavior: "none",
                trial_end: newAnchorSec,
                metadata: { ...sub.metadata, reanchored_cdmx_8am: "true" },
              });
              updated++;
              await sb.from("maintenance_log").insert({
                action: "reanchor_cdmx_8am",
                entity_type: "stripe_subscription",
                entity_id: sub.id,
                details: entry,
              });
            }
            results.push(entry);
          } catch (e) {
            errors++;
            results.push({
              id: sub.id,
              action: "error",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        if (!page.has_more || processed >= limitParam) break;
        startingAfter = page.data[page.data.length - 1].id;
      }
    }

    log("done", { processed, updated, skipped, errors, dryRun });
    return new Response(
      JSON.stringify({ dryRun, processed, updated, skipped, errors, results }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
