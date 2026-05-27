// Crea una sesión de Stripe Checkout con:
// - Trial de 7 días
// - Tarjeta OBLIGATORIA al alta (payment_method_collection: 'always')
// - Si no hay tarjeta al terminar el trial, Stripe cancela la suscripción
// - El primer cobro ocurre el día 8 y NO es reembolsable
//
// Esta función reemplaza al create-checkout SÓLO para nuevas altas.
// El create-checkout original se mantiene para upgrades/cambios de plan.

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
    const { plan_id, quantity = 3, accepted_terms = false } = body;
    if (!plan_id) throw new Error("plan_id es requerido");
    if (!accepted_terms) throw new Error("Debes aceptar los términos del cobro automático");

    // Obtener empresa del usuario
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa asociada");

    // Obtener el plan elegido (Mensual / Semestral / Anual)
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id, nombre, periodo, meses, precio_por_usuario, stripe_price_id")
      .eq("id", plan_id)
      .eq("activo", true)
      .maybeSingle();
    if (!plan) throw new Error("Plan no encontrado");
    if (!plan.stripe_price_id) throw new Error(`El plan ${plan.nombre} no tiene precio configurado en Stripe`);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Buscar o crear customer en Stripe
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

    // Calcular billing_cycle_anchor = primer día del mes SIGUIENTE al fin del trial,
    // en zona horaria de México (UTC-6). Así Stripe cobra proporcional al terminar la prueba
    // y luego ancla todos los cobros al día 1 de cada mes.
    const trialEndMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const trialEndMx = new Date(new Date(trialEndMs).toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const anchorYear = trialEndMx.getMonth() === 11 ? trialEndMx.getFullYear() + 1 : trialEndMx.getFullYear();
    const anchorMonth = (trialEndMx.getMonth() + 1) % 12; // 0-indexed mes siguiente
    // Día 1 a las 00:00 hora México = 06:00 UTC
    const billingCycleAnchor = Math.floor(Date.UTC(anchorYear, anchorMonth, 1, 6, 0, 0) / 1000);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_collection: "always",
      line_items: [{ price: plan.stripe_price_id, quantity }],
      subscription_data: {
        trial_period_days: 7,
        billing_cycle_anchor: billingCycleAnchor,
        proration_behavior: "create_prorations",
        trial_settings: {
          end_behavior: { missing_payment_method: "cancel" },
        },
        metadata: {
          empresa_id: profile.empresa_id,
          plan_id: plan.id,
          flow: "trial_signup",
        },
      },
      success_url: `${origin}/dashboard?trial=started`,
      cancel_url: `${origin}/completar-registro?canceled=1`,
      metadata: {
        empresa_id: profile.empresa_id,
        plan_id: plan.id,
        flow: "trial_signup",
        accepted_terms_at: new Date().toISOString(),
      },
    });

    // Guardar referencia y aceptación de términos
    await supabase
      .from("subscriptions")
      .update({
        ultimo_checkout_session_id: session.id,
        terms_accepted_at: new Date().toISOString(),
        plan_id: plan.id,
        max_usuarios: quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", profile.empresa_id);

    log("Trial checkout session created", { sessionId: session.id, empresa_id: profile.empresa_id });

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
