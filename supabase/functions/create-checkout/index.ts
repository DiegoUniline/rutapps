import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Calculate proration: bill from today to the 1st of next month
    const now = new Date();
    const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    // Check for empresa discount
    let discounts: any[] = [];
    if (empresa_id) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("descuento_porcentaje")
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      
      const descuento = subData?.descuento_porcentaje || 0;
      if (descuento > 0) {
        // Create a Stripe coupon for this specific discount
        const coupon = await stripe.coupons.create({
          percent_off: descuento,
          duration: "forever",
          name: `Descuento ${descuento}% - ${empresa_id.slice(0, 8)}`,
        });
        discounts = [{ coupon: coupon.id }];
        console.log(`Applied ${descuento}% discount coupon: ${coupon.id}`);
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
