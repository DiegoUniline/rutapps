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
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, stripe_subscription_id, stripe_price_id, plan_id, descuento_porcentaje")
        .in("status", ["active"]);

      log("Active subs to invoice", { count: activeSubs?.length || 0 });

      for (const sub of activeSubs || []) {
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
        const subtotal = precioUnitario * qty;
        const descuento = sub.descuento_porcentaje || 0;
        const total = Math.round(subtotal * (1 - descuento / 100) * 100) / 100;

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
            estado: sub.stripe_subscription_id ? "procesando" : "pendiente",
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

        // WhatsApp notification
        if (sub.stripe_subscription_id) {
          await sendWhatsApp(supabase, sub.empresa_id,
            `¡Hola! 👋\nTe informamos que hoy se generó tu factura de *${mesActual}* para *${empresaNombre}*.\n📋 *Factura:* ${numFactura}\n💰 *Monto:* $${total.toLocaleString()} MXN\n📦 *Plan:* ${qty} usuarios\n💳 El cobro se procesará automáticamente a tu tarjeta registrada.\nSi tu pago no se procesa, tienes *${DIAS_GRACIA} días de gracia*.`
          );
        } else {
          const fechaLimite = new Date(now.getTime() + DIAS_GRACIA * 86400000).toLocaleDateString("es-MX");
          await sendWhatsApp(supabase, sub.empresa_id,
            `¡Hola! 👋\nSe ha generado tu factura de *${mesActual}* para *${empresaNombre}*.\n📋 *Factura:* ${numFactura}\n💰 *Monto:* $${total.toLocaleString()} MXN\n📅 *Fecha límite:* ${fechaLimite}\nTienes *${DIAS_GRACIA} días de gracia* para realizar tu pago.`
          );
        }

        log("Invoice generated", { empresa: sub.empresa_id, total, numFactura });
      }
    }

    // ═══ PART 2: Enforce grace period (daily) ═══
    // Check subs in grace/past_due status
    const { data: graceSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, current_period_end, status")
      .in("status", ["past_due", "gracia"]);

    for (const sub of graceSubs || []) {
      const endDate = sub.current_period_end ? new Date(sub.current_period_end) : null;
      if (!endDate) continue;

      const daysPastDue = Math.floor((now.getTime() - endDate.getTime()) / 86400000);

      if (daysPastDue >= DIAS_GRACIA) {
        // Suspend
        await supabase
          .from("subscriptions")
          .update({ status: "suspended", updated_at: now.toISOString() })
          .eq("id", sub.id);

        const { data: empresa } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();

        await sendWhatsApp(supabase, sub.empresa_id,
          `¡Hola! ⚠️\nLa suscripción de *${empresa?.nombre || "tu empresa"}* ha sido *suspendida*.\n🔒 Tu acceso ha sido restringido temporalmente.\nPara reactivar:\n1️⃣ Abre la app → *Mi Suscripción*\n2️⃣ Actualiza tu método de pago\n3️⃣ Tu acceso se restaurará al instante ✅\nTus datos están seguros. 🔐`
        );

        log("Subscription suspended", { empresa: sub.empresa_id, daysPastDue });
      } else {
        // Send daily grace reminder
        const diasRestantes = DIAS_GRACIA - daysPastDue;

        const { data: empresa } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();

        await sendWhatsApp(supabase, sub.empresa_id,
          `¡Hola! 👋\nTe recordamos que el pago de *${empresa?.nombre || "tu empresa"}* aún está pendiente.\n⏳ Te quedan *${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}* de gracia antes de la suspensión.\n💳 Actualiza tu método de pago para evitar interrupciones.`
        );

        // Update status to gracia if not already
        if (sub.status !== "gracia") {
          await supabase
            .from("subscriptions")
            .update({ status: "gracia", updated_at: now.toISOString() })
            .eq("id", sub.id);
        }

        log("Grace reminder sent", { empresa: sub.empresa_id, diasRestantes });
      }
    }

    // ═══ PART 3: Trial expiration check (daily) ═══
    const { data: trialSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at")
      .eq("status", "trial")
      .not("trial_ends_at", "is", null);

    for (const sub of trialSubs || []) {
      const trialEnd = new Date(sub.trial_ends_at);
      const daysPastTrial = Math.floor((now.getTime() - trialEnd.getTime()) / 86400000);

      if (daysPastTrial >= DIAS_GRACIA) {
        await supabase
          .from("subscriptions")
          .update({ status: "suspended", updated_at: now.toISOString() })
          .eq("id", sub.id);

        log("Trial suspended", { empresa: sub.empresa_id, daysPastTrial });
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
