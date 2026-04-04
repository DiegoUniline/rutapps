import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRACE_DAYS = 3;

const log = (step: string, details?: any) =>
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("No autenticado");

    const { price_id, quantity, empresa_id } = await req.json();
    if (!price_id || !quantity) throw new Error("price_id y quantity requeridos");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: userData.user.email,
        metadata: { empresa_id: empresa_id || "" },
      });
      customerId = newCustomer.id;
    }

    // ─── Determine grace period status ───
    let daysSinceExpiry = 0;
    let isWithinGrace = true;
    let monthlyPriceCentavos = 0;

    if (empresa_id) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end")
        .eq("empresa_id", empresa_id)
        .maybeSingle();

      if (subData) {
        const now = new Date();
        // Determine when access "expired" (trial end or period end)
        const expiryDate = subData.trial_ends_at
          ? new Date(subData.trial_ends_at)
          : subData.current_period_end
            ? new Date(subData.current_period_end)
            : null;

        if (expiryDate && expiryDate < now) {
          daysSinceExpiry = Math.floor((now.getTime() - expiryDate.getTime()) / 86400000);
          isWithinGrace = daysSinceExpiry <= GRACE_DAYS;
        }
      }

      // Get the price amount from Stripe
      try {
        const stripePrice = await stripe.prices.retrieve(price_id);
        monthlyPriceCentavos = stripePrice.unit_amount || 0;
      } catch {
        monthlyPriceCentavos = 30000; // fallback: $300 MXN
      }
    }

    log("Grace check", { daysSinceExpiry, isWithinGrace, monthlyPriceCentavos });

    // ─── Calculate billing ───
    const now = new Date();
    const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysToFirst = Math.ceil((nextFirst.getTime() - now.getTime()) / 86400000);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    if (isWithinGrace) {
      // WITHIN GRACE (day 1-3): Charge FULL month price.
      // Stripe will prorate from today to 1st (less than full month),
      // so we add an invoice item for the difference to reach the full price.
      const prorationCentavos = Math.round((monthlyPriceCentavos / daysInMonth) * daysToFirst);
      const surchargePerUser = monthlyPriceCentavos - prorationCentavos;

      if (surchargePerUser > 0) {
        // Get the product ID from the price
        const stripePrice = await stripe.prices.retrieve(price_id);
        const productId = typeof stripePrice.product === "string"
          ? stripePrice.product
          : (stripePrice.product as any)?.id;

        await stripe.invoiceItems.create({
          customer: customerId,
          amount: surchargePerUser * quantity,
          currency: "mxn",
          description: `Días de gracia incluidos (${GRACE_DAYS} días)`,
          metadata: { empresa_id: empresa_id || "", tipo: "gracia" },
        });
        log("Added grace surcharge", { surchargePerUser, total: surchargePerUser * quantity });
      }
    } else {
      // PAST GRACE (day 4+): Stripe prorates from today to 1st.
      // Add an invoice item for the 3 grace days that are owed.
      const dailyRateCentavos = Math.round(monthlyPriceCentavos / daysInMonth);
      const graceCharge = dailyRateCentavos * GRACE_DAYS * quantity;

      if (graceCharge > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: graceCharge,
          currency: "mxn",
          description: `Cargo por ${GRACE_DAYS} días de gracia`,
          metadata: { empresa_id: empresa_id || "", tipo: "gracia_adeudo" },
        });
        log("Added grace days charge", { dailyRate: dailyRateCentavos, graceCharge });
      }
    }

    // ─── Check for empresa discount ───
    let discounts: any[] = [];
    if (empresa_id) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("descuento_porcentaje")
        .eq("empresa_id", empresa_id)
        .maybeSingle();

      const descuento = subData?.descuento_porcentaje || 0;
      if (descuento > 0) {
        const coupon = await stripe.coupons.create({
          percent_off: descuento,
          duration: "forever",
          name: `Descuento ${descuento}% - ${empresa_id.slice(0, 8)}`,
        });
        discounts = [{ coupon: coupon.id }];
        log("Applied discount", { descuento, couponId: coupon.id });
      }
    }

    const origin = req.headers.get("origin") || "https://rutapp.mx";

    const sessionParams: any = {
      customer: customerId,
      line_items: [{ price: price_id, quantity }],
      mode: "subscription",
      subscription_data: {
        billing_cycle_anchor: Math.floor(nextFirst.getTime() / 1000),
        proration_behavior: "create_prorations",
        metadata: { empresa_id: empresa_id || "" },
      },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancelled`,
    };

    if (discounts.length > 0) {
      sessionParams.discounts = discounts;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    log("Checkout created", { sessionId: session.id, isWithinGrace, daysSinceExpiry });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error create-checkout:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
