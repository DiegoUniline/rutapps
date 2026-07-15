// billing-realign-to-month-start
// Cobra el prorrateo faltante hasta el ÚLTIMO DÍA del mes en curso (CDMX) a
// las suscripciones desfasadas y las re-ancla al 1° del mes siguiente 08:00
// CDMX (14:00 UTC), para que a partir de ahí todas cobren el día 1° normal.
//
// Uso:
//   POST { dryRun: true }                             -> preview de TODAS las desfasadas
//   POST { dryRun: true, subscription_ids: ["..."] }  -> preview de las indicadas
//   POST { dryRun: false, subscription_ids: ["..."] } -> ejecuta
//
// Requiere: super admin (Bearer JWT) o CRON_SECRET.
// Seguridad: si `payment_behavior=error_if_incomplete` rechaza el cobro,
//            Stripe NO cambia el ancla y devolvemos el error sin escribir nada.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const log = (s: string, d?: unknown) =>
  console.log(`[REALIGN] ${s}${d ? " " + JSON.stringify(d) : ""}`);

const TZ_MX = "America/Mexico_City";

function nowInMx(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: TZ_MX }));
}

// Último día del mes de `d` en CDMX (fecha 23:59:59 CDMX).
function lastDayOfMonthMx(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Próximo 1° del mes a las 08:00 CDMX (14:00 UTC).
function nextFirstOfMonthAnchorUtc(after: Date): Date {
  return new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth() + 1, 1, 14, 0, 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // AuthN: Super Admin o CRON_SECRET
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret");
    let authorized = !!(cronSecret && providedSecret && providedSecret === cronSecret);
    let actorId = "cron";
    if (!authorized) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No auth header");
      const { data: userData, error: uErr } = await sb.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (uErr || !userData.user) throw new Error("Auth failed");
      const { data: isSA } = await sb
        .from("super_admins")
        .select("user_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!isSA) throw new Error("Solo super admin");
      authorized = true;
      actorId = userData.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dryRun !== false; // default TRUE
    const subIds: string[] | undefined = Array.isArray(body.subscription_ids)
      ? body.subscription_ids
      : undefined;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    // Traer candidatos: subs activas con stripe_subscription_id cuyo
    // current_period_end NO es el último día del mes de hoy en CDMX.
    const mxNow = nowInMx();
    const lastDayThisMonth = lastDayOfMonthMx(mxNow);
    const nextAnchor = nextFirstOfMonthAnchorUtc(mxNow);
    const nextAnchorSec = Math.floor(nextAnchor.getTime() / 1000);

    let query = sb
      .from("subscriptions")
      .select(
        "id, empresa_id, status, current_period_end, max_usuarios, plan_id, stripe_subscription_id, stripe_customer_id, legacy_pricing",
      )
      .eq("status", "active")
      .not("stripe_subscription_id", "is", null);
    if (subIds && subIds.length) query = query.in("id", subIds);

    const { data: subs, error: sErr } = await query;
    if (sErr) throw sErr;

    const results: any[] = [];
    let processed = 0;
    let previewed = 0;
    let executed = 0;
    let skipped = 0;
    let errors = 0;

    for (const sub of subs || []) {
      processed++;
      const cpe = sub.current_period_end ? new Date(sub.current_period_end) : null;
      // Filtro clave: si no se pasaron IDs específicos, solo tomamos las
      // desfasadas (cierran antes del último día del mes en CDMX) o Dulces
      // Jersey-style (cierra 31 pero última factura cobra menos, veremos aparte).
      if (!subIds || !subIds.length) {
        if (!cpe) { skipped++; continue; }
        // Alineada si termina >= último día del mes en CDMX (o después)
        const alignedThisMonth =
          cpe.getUTCFullYear() === lastDayThisMonth.getFullYear() &&
          cpe.getUTCMonth() === lastDayThisMonth.getMonth() &&
          cpe.getUTCDate() >= lastDayThisMonth.getDate();
        if (alignedThisMonth) { skipped++; continue; }
        // También excluimos semestrales/anuales (cpe > 45 días adelante)
        const daysAhead = (cpe.getTime() - mxNow.getTime()) / 86400000;
        if (daysAhead > 45) { skipped++; continue; }
      }

      try {
        // Traer datos del plan para poder calcular prorrateo mostrable.
        let planRow: any = null;
        if (sub.plan_id) {
          const { data: sp } = await sb
            .from("subscription_plans")
            .select(
              "slug, nombre, precio_base, precio_extra_usuario, precio_por_usuario, usuarios_incluidos, stripe_price_id, stripe_price_id_extra",
            )
            .eq("id", sub.plan_id)
            .maybeSingle();
          planRow = sp;
        }

        const qty = sub.max_usuarios || 1;
        const isNewPlan = !!planRow?.slug && sub.legacy_pricing !== true;
        const extras = isNewPlan
          ? Math.max(0, qty - (planRow?.usuarios_incluidos || 0))
          : 0;
        const monthlyTotal = isNewPlan
          ? Number(planRow?.precio_base || 0) + extras * Number(planRow?.precio_extra_usuario || 0)
          : Number(planRow?.precio_por_usuario || 300) * qty;

        // Punto de partida del prorrateo: máx(último cobro efectivo, hoy)
        // Para simplicidad usamos max(cpe, hoy) y el fin es el último día del mes
        // en CDMX. Stripe calculará el prorrateo real internamente con
        // create_prorations/always_invoice, así que lo que ponemos aquí es solo
        // preview. La verdad final la da la factura de Stripe.
        const startProrate = cpe && cpe > mxNow ? cpe : mxNow;
        const daysInMonth = new Date(mxNow.getFullYear(), mxNow.getMonth() + 1, 0).getDate();
        const rawDays = Math.ceil(
          (lastDayThisMonth.getTime() - startProrate.getTime()) / 86400000,
        );
        const prorateDays = Math.max(0, rawDays);
        const previewProrateAmount =
          Math.round((monthlyTotal * prorateDays / daysInMonth) * 100) / 100;

        const entry: any = {
          subscription_id: sub.id,
          empresa_id: sub.empresa_id,
          plan: planRow?.nombre || null,
          users: qty,
          monthly_total: monthlyTotal,
          current_period_end: cpe?.toISOString().slice(0, 10) || null,
          prorate_from: startProrate.toISOString().slice(0, 10),
          prorate_to: lastDayThisMonth.toISOString().slice(0, 10),
          prorate_days_preview: prorateDays,
          prorate_amount_preview: previewProrateAmount,
          new_anchor_utc: nextAnchor.toISOString(),
          new_anchor_cdmx: "1° del mes 08:00",
        };

        if (dryRun) {
          entry.action = "would_realign";
          previewed++;
          results.push(entry);
          continue;
        }

        // EJECUTAR: re-anclar en Stripe con factura prorrateada inmediata.
        // proration_behavior:'always_invoice' + payment_behavior:'error_if_incomplete'
        // => si la tarjeta falla, Stripe rechaza el update, nada cambia.
        try {
          const updated = await stripe.subscriptions.update(sub.stripe_subscription_id!, {
            billing_cycle_anchor: nextAnchorSec,
            proration_behavior: "always_invoice",
            payment_behavior: "error_if_incomplete",
            metadata: { realigned_to_month_start: "true", realigned_at: mxNow.toISOString() },
          });

          // Sub quedó anclada. Actualizamos local: current_period_end = nuevo ancla,
          // current_period_start = ahora.
          await sb
            .from("subscriptions")
            .update({
              current_period_start: mxNow.toISOString(),
              current_period_end: nextAnchor.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);

          // Registrar factura interna de prorrateo (solo referencia; Stripe
          // ya cobró). Marcada como pagada.
          const periodo_inicio = startProrate.toISOString().slice(0, 10);
          const periodo_fin = lastDayThisMonth.toISOString().slice(0, 10);
          await sb.from("facturas").insert({
            empresa_id: sub.empresa_id,
            suscripcion_id: sub.id,
            periodo_inicio,
            periodo_fin,
            num_usuarios: qty,
            precio_unitario: qty > 0 ? Math.round((previewProrateAmount / qty) * 100) / 100 : 0,
            subtotal: previewProrateAmount,
            total: previewProrateAmount,
            estado: "pagada",
            es_prorrateo: true,
            fecha_pago: new Date().toISOString(),
            concepto: `Prorrateo alineación fin de mes (${periodo_inicio} → ${periodo_fin})`,
          });

          await sb.from("maintenance_log").insert({
            ejecutado_por: actorId === "cron" ? null : actorId,
            tablas_procesadas: ["subscriptions", "stripe_subscription", "facturas"],
            notas: `realign_to_month_start ${sub.id} empresa=${sub.empresa_id} prorateAprox=$${previewProrateAmount} anchor=${nextAnchor.toISOString()}`,
          });

          entry.action = "realigned";
          entry.stripe_status = updated.status;
          executed++;
          results.push(entry);
        } catch (stripeErr: any) {
          errors++;
          const msg = stripeErr?.raw?.message || stripeErr?.message || String(stripeErr);
          entry.action = "error";
          entry.error = msg;
          entry.hint =
            "Stripe rechazó el cobro/ancla (probable tarjeta rechazada). Nada se modificó.";
          results.push(entry);
          await sb.from("maintenance_log").insert({
            ejecutado_por: actorId === "cron" ? null : actorId,
            tablas_procesadas: ["stripe_subscription"],
            notas: `realign_ERROR ${sub.id}: ${msg}`,
          });
        }
      } catch (e) {
        errors++;
        results.push({
          subscription_id: sub.id,
          action: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    log("done", { dryRun, processed, previewed, executed, skipped, errors });
    return new Response(
      JSON.stringify(
        { dryRun, processed, previewed, executed, skipped, errors, results },
        null,
        2,
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
