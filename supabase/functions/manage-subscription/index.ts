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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No autenticado");

    const { action, new_quantity } = await req.json();

    // Get user's empresa
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    // Get subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id, stripe_customer_id, max_usuarios")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();
    if (!sub) throw new Error("Sin suscripción");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const { action, new_quantity, new_price_id } = await req.json();

    // Get user's empresa
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    // Get subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id, stripe_customer_id, max_usuarios")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();
    if (!sub) throw new Error("Sin suscripción");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (action === "update_quantity") {
      const qty = parseInt(new_quantity);
      if (!qty || qty < 3) throw new Error("Mínimo 3 usuarios");

      if (sub.stripe_subscription_id) {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        const itemId = stripeSub.items.data[0]?.id;
        if (!itemId) throw new Error("No subscription item found");

        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: itemId, quantity: qty }],
          proration_behavior: "create_prorations",
        });
      }

      await supabase
        .from("subscriptions")
        .update({ max_usuarios: qty, updated_at: new Date().toISOString() })
        .eq("id", sub.id);

      return new Response(JSON.stringify({ success: true, max_usuarios: qty }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "change_plan") {
      if (!new_price_id) throw new Error("new_price_id requerido");
      if (!sub.stripe_subscription_id) throw new Error("No hay suscripción activa en Stripe para cambiar");

      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const itemId = stripeSub.items.data[0]?.id;
      if (!itemId) throw new Error("No subscription item found");

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: itemId, price: new_price_id }],
        proration_behavior: "create_prorations",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Acción no válida");
  } catch (error) {
    console.error("Error manage-subscription:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
