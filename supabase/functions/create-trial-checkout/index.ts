// Crea sesión de Stripe Checkout para alta con prueba gratis de 7 días.
//
// REGLA ÚNICA DE CALENDARIO PARA TODOS LOS PERIODOS:
// mensual, semestral y anual capturan primero la tarjeta con mode='setup'.
// El webhook crea después la suscripción con:
//   - trial_end = ahora + 7 días
//   - billing_cycle_anchor = día 1 del mes siguiente al fin del trial (CDMX)
//   - proration_behavior = 'create_prorations'
//
// Resultado:
// alta → 7 días gratis → prorrateo desde fin de trial hasta fin de mes →
// periodo completo (1/6/12 meses) a partir del día 1.
// Nunca se debe anclar un semestre/año al día en que terminó la prueba.

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

    const validBillingPeriods = new Set(["mensual", "semestral", "anual"]);
    if (!validBillingPeriods.has(billing_period)) {
      throw new Error("Periodo de cobro inválido");
    }

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

    const commonMeta = {
      empresa_id: profile.empresa_id,
      plan_id: plan.id,
      plan_slug: plan.slug || "",
      num_usuarios: String(qty),
      billing_period,
      flow: "trial_signup_setup",
      accepted_terms_at: new Date().toISOString(),
    };

    // Todos los periodos usan setup mode. Así evitamos que Stripe cobre
    // un semestre/año completo al terminar el trial en una fecha intermedia.
    // La suscripción recurrente se crea en stripe-webhook y se ancla al día 1.
    const session = await stripe.checkout.sessions.create({
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

    log("Trial checkout session created", { sessionId: session.id, mode: session.mode, billing_period });

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
