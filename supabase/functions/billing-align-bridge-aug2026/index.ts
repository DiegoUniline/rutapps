// Alinea 7 suscripciones que quedaron desfasadas tras un bug del flujo
// `create-trial-checkout`. Cada una se renovaría mid-julio (9, 11, 15, 21, 24,
// 26, 27) cobrando un mes completo desalineado del día 1.
//
// Reglas:
//  - NO se reembolsa, NO se da crédito, NO se cobra antes de tiempo.
//  - El día exacto en que vence el ciclo actual (en CDMX), se genera UNA
//    invoice puente proporcional desde ese día hasta el 1-ago-2026 00:00 CDMX,
//    se cobra automáticamente y se re-ancla la suscripción a esa fecha vía
//    trial_end (proration_behavior:'none').
//  - El cron corre 00:05 CDMX (06:05 UTC) para adelantarse a la renovación
//    automática de Stripe. Si Stripe ya generó la renovación completa antes,
//    se marca error para revisión manual.
//
// Modo invocación:
//   POST { "mode": "dry_run" | "execute", "force_sub_ids"?: ["sub_..."] }
//   - dry_run (default): no toca Stripe, sólo reporta cálculo.
//   - execute: ejecuta los cobros para subs que vencen HOY en CDMX
//     (o las que vengan en force_sub_ids para pruebas en sandbox).
//
// Idempotencia: busca invoice con metadata.reason = REASON antes de crear.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REASON = "billing_alignment_bridge_to_august_2026";
const ANCHOR_UNIX = 1785592800; // 2026-08-01 08:00 America/Mexico_City (= 14:00 UTC)
const JULY_DAYS = 31;

// Whitelist EXACTA: solo estas 7 suscripciones pueden ser procesadas.
// Cualquier sub fuera de esta lista es ignorada.
const AFFECTED: Array<{ sub_id: string; empresa_id: string; nombre: string; expected_period_end_iso: string }> = [
  { sub_id: "sub_1Te27lCUpJnsv7ilZSPPmH7N", empresa_id: "49d2b8d2-0bc3-492c-8fda-8431a47e1996", nombre: "GLOBAL TRADE LOGISTICS", expected_period_end_iso: "2026-07-09" },
  { sub_id: "sub_1TeblaCUpJnsv7ilc5hqy9F3", empresa_id: "9b252503-4e7a-4249-a439-72e42996dfe7", nombre: "Innovaciones SSB",        expected_period_end_iso: "2026-07-11" },
  { sub_id: "sub_1TgA5GCUpJnsv7ilRIEHXIAc", empresa_id: "27d242e0-c142-4f55-8edb-fb8c6f9873f1", nombre: "Dulces Jersey",           expected_period_end_iso: "2026-07-15" },
  { sub_id: "sub_1TiN6zCUpJnsv7ilLPDqoeX0", empresa_id: "c93b497a-8261-43cf-a6b7-181afb9ca974", nombre: "Lácteos García Díaz",     expected_period_end_iso: "2026-07-21" },
  { sub_id: "sub_1TjNbbCUpJnsv7ilfs80Jiw4", empresa_id: "f63d7fab-13c4-4252-9ea5-1464bf355b20", nombre: "Distribuidora San Juan",  expected_period_end_iso: "2026-07-24" },
  { sub_id: "sub_1Tk3LcCUpJnsv7ilm51V4Cp0", empresa_id: "5d2d9498-9d9c-4686-a89b-7ee920a99d88", nombre: "GPO ABARROTERO GAMA",     expected_period_end_iso: "2026-07-26" },
  { sub_id: "sub_1TkPpLCUpJnsv7ildIpBtUsq", empresa_id: "4702632d-ba92-4266-a0e3-231da3115ed5", nombre: "Tostadas Ricamilpa",      expected_period_end_iso: "2026-07-27" },
];

const log = (step: string, details?: unknown) =>
  console.log(`[BRIDGE-AUG-2026] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

// Devuelve la fecha actual (YYYY-MM-DD) en America/Mexico_City.
function todayCDMX(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

function monthlyTotalCents(sub: Stripe.Subscription): number {
  let total = 0;
  for (const item of sub.items.data) {
    const amt = item.price?.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    total += amt * qty;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── AUTH GUARD ───
    // Acepta 2 formas de invocación:
    //  a) Header `x-internal-secret: <BILLING_BRIDGE_INTERNAL_SECRET>` (cron interno)
    //  b) Bearer JWT de un super admin (invocación manual desde el panel)
    const internalSecret = Deno.env.get("BILLING_BRIDGE_INTERNAL_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    let authorized = !!(internalSecret && providedSecret && providedSecret === internalSecret);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    if (!authorized) {
      const authHeader = req.headers.get("Authorization") || "";
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { data: claimsData } = await supabase.auth.getClaims(token);
        const email = (claimsData?.claims as any)?.email?.toLowerCase();
        if (email === "diego.leon@uniline.mx") authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY no configurado");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.json().catch(() => ({}));
    const mode: "dry_run" | "execute" = body?.mode === "execute" ? "execute" : "dry_run";
    const forceSubIds: string[] = Array.isArray(body?.force_sub_ids) ? body.force_sub_ids : [];


    const today = todayCDMX(); // YYYY-MM-DD
    log("Run start", { mode, today, forceSubIds });

    // Determinar candidatas: las que vencen HOY (CDMX), o las forzadas explícitamente.
    const candidates = AFFECTED.filter((row) =>
      forceSubIds.length > 0
        ? forceSubIds.includes(row.sub_id)
        : row.expected_period_end_iso === today
    );

    const report: any[] = [];

    for (const row of candidates) {
      const r: any = { empresa: row.nombre, sub_id: row.sub_id, empresa_id: row.empresa_id };
      try {
        const sub = await stripe.subscriptions.retrieve(row.sub_id, { expand: ["items.data.price"] });
        r.stripe_status = sub.status;
        r.customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const cpeUnix = (sub.items.data[0] as any)?.current_period_end ?? (sub as any).current_period_end;
        r.current_period_end_unix = cpeUnix;
        r.current_period_end_iso = cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null;

        if (!cpeUnix) { r.skip = "sub sin current_period_end"; report.push(r); continue; }
        if (cpeUnix >= ANCHOR_UNIX) { r.skip = "ya alineado al 1-ago o posterior"; report.push(r); continue; }

        // Días puente: del current_period_end al 1-ago-2026 00:00 CDMX
        const diffSec = ANCHOR_UNIX - cpeUnix;
        const days = Math.max(1, Math.round(diffSec / 86400));
        const monthly = monthlyTotalCents(sub);
        const amount = Math.round((monthly / JULY_DAYS) * days);
        r.dias_puente = days;
        r.monthly_total_cents = monthly;
        r.bridge_amount_cents = amount;
        r.bridge_amount_mxn = (amount / 100).toFixed(2);

        // ─── Idempotencia: ¿ya existe invoice puente? ───
        const existing = await stripe.invoices.search({
          query: `metadata['reason']:'${REASON}' AND subscription:'${row.sub_id}'`,
          limit: 5,
        });
        if (existing.data.length > 0) {
          r.skip = "invoice puente ya existe";
          r.existing_invoice_ids = existing.data.map((i) => i.id);
          report.push(r); continue;
        }

        // ─── Detectar carrera con renovación automática de Stripe ───
        // Si ya hay una invoice de renovación reciente (subscription_cycle) con
        // total > bridge_amount, abortar y marcar revisión manual.
        const recentInvoices = await stripe.invoices.list({
          subscription: row.sub_id,
          limit: 5,
        });
        const autoRenewal = recentInvoices.data.find((i) =>
          (i.billing_reason === "subscription_cycle" || i.billing_reason === "subscription_create") &&
          (i.created * 1000) > Date.now() - 24 * 3600 * 1000 &&
          (i.total ?? 0) > amount * 1.5
        );
        if (autoRenewal) {
          r.skip = `Stripe ya generó invoice de renovación ${autoRenewal.id} — REVISIÓN MANUAL`;
          r.needs_manual_review = true;
          report.push(r); continue;
        }

        if (mode === "dry_run") {
          r.action = "DRY_RUN — no se cobró";
          report.push(r); continue;
        }

        // ─── EXECUTE ───
        // 1) Guardar snapshot del current_period_end original (auditoría)
        await supabase.from("billing_notifications").insert({
          empresa_id: row.empresa_id,
          tipo: REASON + "_snapshot",
          payload: {
            sub_id: row.sub_id,
            original_current_period_end: r.current_period_end_iso,
            original_current_period_end_unix: cpeUnix,
            monthly_total_cents: monthly,
            bridge_days: days,
            bridge_amount_cents: amount,
            target_anchor: "2026-08-01T08:00:00-06:00",
          },
        });

        // 2) Crear invoice item puente
        const item = await stripe.invoiceItems.create({
          customer: r.customer,
          amount,
          currency: sub.currency,
          description: `Ajuste alineación ciclo a 1-ago-2026 (${days} días puente)`,
          metadata: {
            reason: REASON,
            empresa_id: row.empresa_id,
            subscription_id: row.sub_id,
            period_start_unix: String(cpeUnix),
            period_end_unix: String(ANCHOR_UNIX),
          },
        });
        r.invoice_item_id = item.id;

        // 3) Crear invoice (sin subscription para que no se mezcle con renovación)
        let invoice = await stripe.invoices.create({
          customer: r.customer,
          auto_advance: false,
          collection_method: "charge_automatically",
          description: `Cargo puente proporcional ${days} días (${r.current_period_end_iso?.slice(0,10)} → 2026-08-01)`,
          metadata: {
            reason: REASON,
            empresa_id: row.empresa_id,
            subscription_id: row.sub_id,
            period_start: r.current_period_end_iso ?? "",
            period_end: "2026-08-01",
            days: String(days),
          },
        });
        r.invoice_id = invoice.id;

        // 4) Finalizar y pagar
        invoice = await stripe.invoices.finalizeInvoice(invoice.id);
        invoice = await stripe.invoices.pay(invoice.id);
        r.invoice_status = invoice.status;
        r.payment_intent = typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id;

        if (invoice.status !== "paid") {
          r.error = `Invoice ${invoice.id} no quedó pagada (status=${invoice.status})`;
          await supabase.from("billing_notifications").insert({
            empresa_id: row.empresa_id,
            tipo: REASON + "_payment_failed",
            payload: r,
          });
          report.push(r); continue;
        }

        // 5) Re-anclar suscripción al 1-ago: trial_end fuerza pausa hasta esa fecha,
        //    sin generar prorrateo (proration_behavior: 'none').
        const updatedSub = await stripe.subscriptions.update(row.sub_id, {
          trial_end: ANCHOR_UNIX,
          proration_behavior: "none",
          metadata: {
            ...(sub.metadata ?? {}),
            bridge_applied_at: new Date().toISOString(),
            bridge_invoice: invoice.id,
            original_current_period_end_unix: String(cpeUnix),
          },
        });
        r.new_trial_end_unix = updatedSub.trial_end;
        r.new_current_period_end_unix =
          (updatedSub.items.data[0] as any)?.current_period_end ?? (updatedSub as any).current_period_end;

        // 6) Sincronizar DB local
        await supabase
          .from("subscriptions")
          .update({
            current_period_end: "2026-08-01T14:00:00Z",
            fecha_vencimiento: "2026-08-01",
            trial_ends_at: "2026-08-01T14:00:00Z",
            status: "active",
            acceso_bloqueado: false,
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", row.empresa_id);

        // 7) Auditoría final
        await supabase.from("billing_notifications").insert({
          empresa_id: row.empresa_id,
          tipo: REASON,
          payload: r,
        });

        r.action = "EXECUTED ✓";
        log("Bridge applied", r);
      } catch (e: any) {
        r.error = e?.message || String(e);
        log("ERROR in row", { row: row.nombre, error: r.error });
      }
      report.push(r);
    }

    return new Response(
      JSON.stringify({ mode, today_cdmx: today, candidates: candidates.length, report }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[BRIDGE-AUG-2026] FATAL:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
