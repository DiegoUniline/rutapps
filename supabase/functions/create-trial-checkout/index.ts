// Crea sesión de Stripe Checkout para alta con prueba gratis de 7 días.
//
// ALINEACIÓN AL DÍA 1 DE CADA MES (fix 30-jun-2026):
// Para evitar ciclos desalineados (alta el 21 → renueva 21 → 21 cada mes),
// las altas MENSUALES usan ahora `mode: 'setup'`. Solo se captura la tarjeta;
// la suscripción la crea el webhook `stripe-webhook` con:
//   - trial_end = ahora + 7 días        (mantiene la prueba real)
//   - billing_cycle_anchor = 1° del mes siguiente al fin de trial (CDMX)
//   - proration_behavior = 'create_prorations'
// Resultado: 7 días de trial → cobro proporcional del día 8 al 1° del mes
// siguiente → mes completo cada día 1.
//
// Para SEMESTRAL/ANUAL no aplica alineación a día 1 (un solo cargo grande
// por adelantado), así que se mantiene el flujo viejo de `mode: 'subscription'`.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[CREATE-TRIAL-CHECKOUT] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY no configurado");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autenticado");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData.user?.email) throw new Error("No autenticado");

    const body = await req.json().catch(() => ({}));
    const { plan_id, quantity, accepted_terms = false, billing_period = "mensual" } = body;
    if (!plan_id) throw new Error("plan_id es requerido");
    if (!accepted_terms) throw new Error("Debes aceptar los términos del cobro automático");

    const PERIOD_CONFIG: Record<string, { months: number; discountPct: number }> = {
      mensual: { months: 1, discountPct: 0 },
      semestral: { months: 6, discountPct: 10 },
      anual: { months: 12, discountPct: 15 },
    };
    const periodCfg = PERIOD_CONFIG[billing_period] || PERIOD_CONFIG.mensual;
    const isMensual = billing_period === "mensual";

    const { data: profile } = await supabase
      .from("profiles").select("empresa_id").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa asociada");

    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id, nombre, periodo, meses, precio_por_usuario, precio_base, precio_extra_usuario, usuarios_incluidos, slug, stripe_price_id, stripe_price_id_extra")
      .eq("id", plan_id).eq("activo", true).maybeSingle();
    if (!plan) throw new Error("Plan no encontrado");
    if (!plan.stripe_price_id) throw new Error(`El plan ${plan.nombre} no tiene precio configurado en Stripe`);

    const isNewPlan = !!plan.slug;
    const minQty = isNewPlan ? Math.max(1, plan.usuarios_incluidos || 1) : 3;
    const requested = parseInt(String(quantity ?? minQty)) || minQty;
    const qty = Math.max(minQty, requested);
    const extraUsers = isNewPlan ? Math.max(0, qty - (plan.usuarios_incluidos || 0)) : 0;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Customer
    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const c = await stripe.customers.create({
        email: userData.user.email,
        metadata: { empresa_id: profile.empresa_id },
      });
      customerId = c.id;
    }

    const origin = req.headers.get("origin") || "https://rutapp.mx";

    // ─── Helper precio por periodo (solo aplica a semestral/anual) ───
    const getOrCreatePeriodPrice = async (basePriceId: string): Promise<string> => {
      if (periodCfg.months === 1 && periodCfg.discountPct === 0) return basePriceId;
      const lookupKey = `${basePriceId}_${billing_period}_v1`;
      const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
      if (existing.data.length > 0) return existing.data[0].id;
      const base = await stripe.prices.retrieve(basePriceId);
      const baseAmount = base.unit_amount || 0;
      const totalAmount = Math.round(baseAmount * periodCfg.months * (1 - periodCfg.discountPct / 100));
      const newPrice = await stripe.prices.create({
        currency: base.currency,
        product: base.product as string,
        unit_amount: totalAmount,
        recurring: { interval: "month", interval_count: periodCfg.months },
        lookup_key: lookupKey,
        nickname: `${billing_period} (${periodCfg.discountPct}% off)`,
      });
      return newPrice.id;
    };

    const commonMeta = {
      empresa_id: profile.empresa_id,
      plan_id: plan.id,
      plan_slug: plan.slug || "",
      num_usuarios: String(qty),
      billing_period,
      flow: isMensual ? "trial_signup_setup" : "trial_signup",
      accepted_terms_at: new Date().toISOString(),
    };

    let session: Stripe.Checkout.Session;

    if (isMensual) {
      // ─── MENSUAL: solo capturamos tarjeta. La suscripción se crea en el webhook
      //     con trial_end + billing_cycle_anchor (alineación a día 1).
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "setup",
        payment_method_types: ["card"],
        success_url: `${origin}/dashboard?trial=started`,
        cancel_url: `${origin}/completar-registro?canceled=1`,
        setup_intent_data: {
          metadata: commonMeta,
        },
        metadata: commonMeta,
      });
    } else {
      // ─── SEMESTRAL / ANUAL: flujo viejo con mode=subscription ───
      const lineItems: any[] = [];
      if (isNewPlan) {
        const mainPriceId = await getOrCreatePeriodPrice(plan.stripe_price_id);
        lineItems.push({ price: mainPriceId, quantity: 1 });
        if (extraUsers > 0 && plan.stripe_price_id_extra) {
          const extraPriceId = await getOrCreatePeriodPrice(plan.stripe_price_id_extra);
          lineItems.push({ price: extraPriceId, quantity: extraUsers });
        }
      } else {
        const mainPriceId = await getOrCreatePeriodPrice(plan.stripe_price_id);
        lineItems.push({ price: mainPriceId, quantity: qty });
      }

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_collection: "always",
        line_items: lineItems,
        subscription_data: {
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          metadata: { ...commonMeta, flow: "trial_signup" },
        },
        success_url: `${origin}/dashboard?trial=started`,
        cancel_url: `${origin}/completar-registro?canceled=1`,
        metadata: commonMeta,
      });
    }

    await supabase
      .from("subscriptions")
      .update({
        ultimo_checkout_session_id: session.id,
        terms_accepted_at: new Date().toISOString(),
        plan_id: plan.id,
        max_usuarios: qty,
        legacy_pricing: !isNewPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", profile.empresa_id);

    log("Trial checkout session created", { sessionId: session.id, mode: session.mode, isMensual });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[CREATE-TRIAL-CHECKOUT] ERROR:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
