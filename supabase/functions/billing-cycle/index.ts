import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[BILLING-CYCLE] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

const DIAS_GRACIA = 3;

async function sendWhatsApp(supabase: any, empresaId: string, message: string) {
  try {
    // Get empresa phone from profiles (owner)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("telefono")
      .eq("empresa_id", empresaId)
      .not("telefono", "is", null)
      .limit(1);

    const phone = profiles?.[0]?.telefono;
    if (!phone) return;

    await supabase.functions.invoke("whatsapp-sender", {
      body: { action: "send_text", empresa_id: empresaId, phone, message },
    });
  } catch (e) {
    log("WhatsApp send failed (non-blocking)", { empresaId, error: (e as Error).message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const isFirstOfMonth = now.getDate() === 1;

    log("Cycle started", { today, isFirstOfMonth });

    // ═══ PART 1: Generate monthly invoices (day 1) ═══
    if (isFirstOfMonth) {
      // Include active, past_due, gracia, and expired trial subs
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, stripe_subscription_id, stripe_price_id, plan_id, descuento_porcentaje, status, trial_ends_at")
        .in("status", ["active", "past_due", "gracia", "trial"]);

      // Filter: active subs always, others only if trial already ended
      const subsToInvoice = (activeSubs || []).filter(s => {
        if (s.status === "active") return true;
        if (s.status === "trial") {
          return s.trial_ends_at && new Date(s.trial_ends_at) <= now;
        }
        return true; // past_due, gracia
      });

      log("Subs to invoice", { count: subsToInvoice.length });

      for (const sub of subsToInvoice) {
        // Skip if Stripe handles this subscription — Stripe emits the renewal invoice
        // automatically and the webhook (invoice.created/paid) syncs it into `facturas`.
        // Generating it here too would duplicate.
        if (sub.stripe_subscription_id) {
          log("Skipped (Stripe handles billing)", { empresa: sub.empresa_id, stripeSub: sub.stripe_subscription_id });
          continue;
        }

        // Skip if pending invoice already exists for this period
        const { data: existingInv } = await supabase
          .from("facturas")
          .select("id")
          .eq("suscripcion_id", sub.id)
          .eq("periodo_inicio", today)
          .in("estado", ["pendiente", "procesando"])
          .limit(1);
        if (existingInv && existingInv.length > 0) {
          log("Skipped (existing invoice)", { empresa: sub.empresa_id });
          continue;
        }

        // Get plan price
        let precioUnitario = 300; // default
        if (sub.plan_id) {
          const { data: plan } = await supabase
            .from("planes")
            .select("precio_base_mes")
            .eq("id", sub.plan_id)
            .single();
          if (plan) precioUnitario = plan.precio_base_mes;
        }

        const qty = sub.max_usuarios || 3;
        let descuento = sub.descuento_porcentaje || 0;

        // ─── Check active coupon ───
        const { data: cuponUso } = await supabase
          .from("cupon_usos")
          .select("id, meses_restantes, cupon_id, cupones:cupon_id(descuento_pct, acumulable)")
          .eq("empresa_id", sub.empresa_id)
          .order("aplicado_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let cuponDescuento = 0;
        if (cuponUso && (cuponUso.meses_restantes === null || cuponUso.meses_restantes > 0)) {
          const cupon = cuponUso.cupones as any;
          if (cupon) {
            cuponDescuento = cupon.descuento_pct || 0;
            if (cupon.acumulable) {
              descuento = Math.min(100, descuento + cuponDescuento);
            } else {
              descuento = Math.max(descuento, cuponDescuento);
            }
          }

          // Decrement meses_restantes
          if (cuponUso.meses_restantes !== null) {
            const newMeses = cuponUso.meses_restantes - 1;
            await supabase.from("cupon_usos").update({ meses_restantes: newMeses }).eq("id", cuponUso.id);

            // If coupon expired, recalculate subscription discount without it
            if (newMeses <= 0 && cupon?.acumulable) {
              const baseDiscount = sub.descuento_porcentaje || 0;
              await supabase.from("subscriptions").update({ descuento_porcentaje: baseDiscount }).eq("id", sub.id);
            }
          }
          log("Coupon applied", { empresa: sub.empresa_id, cuponDescuento, totalDescuento: descuento, mesesRestantes: cuponUso.meses_restantes });
        }

        // Round per-user price to whole peso to avoid fractional totals
        const precioConDescuento = descuento > 0
          ? Math.round(precioUnitario * (1 - descuento / 100))
          : precioUnitario;
        const subtotal = precioUnitario * qty;
        const total = precioConDescuento * qty;

        const mesActual = now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
        const periodoFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

        // Create invoice
        const { data: factura } = await supabase
          .from("facturas")
          .insert({
            empresa_id: sub.empresa_id,
            suscripcion_id: sub.id,
            periodo_inicio: today,
            periodo_fin: periodoFin,
            num_usuarios: qty,
            precio_unitario: precioUnitario,
            descuento_porcentaje: descuento,
            subtotal,
            total,
            estado: "pendiente",
            es_prorrateo: false,
            fecha_vencimiento: new Date(now.getTime() + DIAS_GRACIA * 86400000).toISOString(),
          })
          .select("numero_factura")
          .single();

        // Get empresa name
        const { data: empresa } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();

        const empresaNombre = empresa?.nombre || "tu empresa";
        const numFactura = factura?.numero_factura || "N/A";

        // WhatsApp notification (only manual/OpenPay subs reach this point)
        const fechaLimite = new Date(now.getTime() + DIAS_GRACIA * 86400000).toLocaleDateString("es-MX");
        await sendWhatsApp(supabase, sub.empresa_id,
          `¡Hola! 👋\nSe ha generado tu factura de *${mesActual}* para *${empresaNombre}*.\n📋 *Factura:* ${numFactura}\n💰 *Monto:* $${total.toLocaleString()} MXN\n📅 *Fecha límite:* ${fechaLimite}\nTienes *${DIAS_GRACIA} días de gracia* para realizar tu pago.`
        );

        log("Invoice generated", { empresa: sub.empresa_id, total, numFactura });
      }
    }

    // ═══ PART 2: Enforce grace period (daily) ═══
    // Check subs in grace/past_due status
    const { data: graceSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, current_period_end, status, stripe_subscription_id, trial_ends_at")
      .in("status", ["past_due", "gracia"]);

    for (const sub of graceSubs || []) {
      // Determine if this is a trial-origin user (never paid)
      const isTrialOrigin = !sub.stripe_subscription_id;

      // For trial-origin users, use trial_ends_at as the reference date
      const refDate = isTrialOrigin && sub.trial_ends_at
        ? new Date(sub.trial_ends_at)
        : sub.current_period_end ? new Date(sub.current_period_end) : null;
      if (!refDate) continue;

      const daysPastDue = Math.floor((now.getTime() - refDate.getTime()) / 86400000);

      const { data: empresa } = await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", sub.empresa_id)
        .single();

      const empresaNombre = empresa?.nombre || "tu empresa";

      if (daysPastDue >= DIAS_GRACIA) {
        // Suspend
        await supabase
          .from("subscriptions")
          .update({ status: "suspended", updated_at: now.toISOString() })
          .eq("id", sub.id);

        if (isTrialOrigin) {
          // Never paid → trial suspension message
          await sendWhatsApp(supabase, sub.empresa_id,
            `👋 *Te extrañamos en Rutapp*\n\nHola, tu periodo de prueba de *${empresaNombre}* terminó y tu acceso ha sido pausado temporalmente.\n\nPero no te preocupes, *todos tus datos están guardados*. Solo activa tu plan y todo estará como lo dejaste:\n\n💳 *Activar mi plan:* https://rutapps.lovable.app/facturacion\n\n📺 Descubre todo lo que Rutapp puede hacer por tu negocio: https://www.youtube.com/@RutAppMx\n\n¿Tienes dudas? Escríbenos, con gusto te ayudamos. 😊`
          );
        } else {
          // Was paying → account suspended message
          await sendWhatsApp(supabase, sub.empresa_id,
            `⚠️ *Suscripción suspendida — Rutapp*\n\nHola, la suscripción de *${empresaNombre}* ha sido *suspendida* por falta de pago.\n\n🔒 Tu acceso ha sido restringido temporalmente.\nPara reactivar:\n1️⃣ Abre la app → *Mi Suscripción*\n2️⃣ Actualiza tu método de pago\n3️⃣ Tu acceso se restaurará al instante ✅\n\nTus datos están seguros. 🔐`
          );
        }

        log("Subscription suspended", { empresa: sub.empresa_id, daysPastDue, isTrialOrigin });
      } else {
        // Send daily grace reminder
        const diasRestantes = DIAS_GRACIA - daysPastDue;

        if (isTrialOrigin) {
          await sendWhatsApp(supabase, sub.empresa_id,
            `👋 *Tu prueba de Rutapp terminó*\n\nHola, el periodo de prueba de *${empresaNombre}* ha finalizado.\n\n⏳ Te quedan *${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}* antes de que tu acceso sea pausado.\n\n💳 Activa tu plan ahora: https://rutapps.lovable.app/facturacion\n\nTus datos están seguros y listos para cuando actives. 😊`
          );
        } else {
          await sendWhatsApp(supabase, sub.empresa_id,
            `¡Hola! 👋\nTe recordamos que el pago de *${empresaNombre}* aún está pendiente.\n⏳ Te quedan *${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}* de gracia antes de la suspensión.\n💳 Actualiza tu método de pago para evitar interrupciones.`
          );
        }

        // Update status to gracia if not already
        if (sub.status !== "gracia") {
          await supabase
            .from("subscriptions")
            .update({ status: "gracia", updated_at: now.toISOString() })
            .eq("id", sub.id);
        }

        log("Grace reminder sent", { empresa: sub.empresa_id, diasRestantes, isTrialOrigin });
      }
    }

    // ═══ PART 3: Trial expiration check (daily) ═══
    // Move expired trials to past_due so Part 2 handles grace + messaging
    const { data: trialSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at")
      .eq("status", "trial")
      .not("trial_ends_at", "is", null);

    for (const sub of trialSubs || []) {
      const trialEnd = new Date(sub.trial_ends_at);
      if (now >= trialEnd) {
        // Move to past_due — Part 2 will handle grace period and messaging
        await supabase
          .from("subscriptions")
          .update({ status: "past_due", updated_at: now.toISOString() })
          .eq("id", sub.id);

        log("Trial expired → past_due", { empresa: sub.empresa_id });
      }
    }

    // ═══ PART 4: Process scheduled retries (daily) ═══
    if (stripe) {
      const { data: retries } = await supabase
        .from("cobro_reintentos")
        .select("id, factura_id, empresa_id, stripe_invoice_id, intento_num, facturas:factura_id(stripe_invoice_id, total)")
        .eq("estado", "pendiente")
        .lte("proxima_fecha", today);

      log("Retries to process", { count: retries?.length || 0 });

      for (const retry of retries || []) {
        const stripeInvId = retry.stripe_invoice_id || (retry.facturas as any)?.stripe_invoice_id;
        if (!stripeInvId) {
          await supabase.from("cobro_reintentos")
            .update({ estado: "fallido", ultimo_error: "Sin stripe_invoice_id", procesado_at: now.toISOString() })
            .eq("id", retry.id);
          continue;
        }

        try {
          // Attempt to pay the invoice using the customer's default payment method
          const paid = await stripe.invoices.pay(stripeInvId);
          log("Retry payment attempt", { retryId: retry.id, invoiceId: stripeInvId, status: paid.status });

          if (paid.status === "paid") {
            await supabase.from("cobro_reintentos")
              .update({ estado: "exitoso", procesado_at: now.toISOString() })
              .eq("id", retry.id);
            // invoice.paid webhook will handle factura update + WhatsApp
          } else {
            // Still not paid — schedule next retry if any remaining
            await scheduleNextRetry(supabase, retry, "Pago no completado", now);
          }
        } catch (e) {
          const msg = (e as Error).message;
          log("Retry failed", { retryId: retry.id, error: msg });
          await scheduleNextRetry(supabase, retry, msg, now);
        }
      }
    }

    log("Cycle completed");

    return new Response(JSON.stringify({ success: true, timestamp: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log("ERROR", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
