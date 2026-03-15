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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find subscriptions ending tomorrow (trial or active)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Trial subscriptions ending tomorrow
    const { data: trialSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, stripe_customer_id, stripe_subscription_id, status, trial_ends_at")
      .eq("status", "trial")
      .gte("trial_ends_at", `${tomorrowStr}T00:00:00`)
      .lt("trial_ends_at", `${tomorrowStr}T23:59:59`);

    // Active subscriptions ending tomorrow
    const { data: activeSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, stripe_customer_id, stripe_subscription_id, status, current_period_end")
      .eq("status", "active")
      .eq("current_period_end", tomorrowStr);

    const allSubs = [...(trialSubs || []), ...(activeSubs || [])];
    const results: any[] = [];

    for (const sub of allSubs) {
      try {
        // Get empresa email via profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, nombre")
          .eq("empresa_id", sub.empresa_id)
          .limit(1)
          .maybeSingle();

        if (!profile) continue;

        const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
        if (!userData?.user?.email) continue;

        const email = userData.user.email;

        // Find or create Stripe customer
        let customerId = sub.stripe_customer_id;
        if (!customerId) {
          const customers = await stripe.customers.list({ email, limit: 1 });
          if (customers.data.length > 0) {
            customerId = customers.data[0].id;
          } else {
            const customer = await stripe.customers.create({ email, name: profile.nombre || email });
            customerId = customer.id;
          }
          // Save customer id
          await supabase.from("subscriptions").update({ stripe_customer_id: customerId }).eq("id", sub.id);
        }

        // Check if there's already an open invoice for this customer
        const existingInvoices = await stripe.invoices.list({
          customer: customerId,
          status: "open",
          limit: 1,
        });

        if (existingInvoices.data.length > 0) {
          results.push({ sub_id: sub.id, status: "skipped", reason: "open invoice exists" });
          continue;
        }

        // Get the plan price
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("precio_por_usuario, nombre, stripe_price_id")
          .eq("activo", true)
          .order("meses", { ascending: true })
          .limit(1)
          .maybeSingle();

        // Create invoice item + invoice
        const invoice = await stripe.invoices.create({
          customer: customerId,
          collection_method: "send_invoice",
          days_until_due: 1,
          auto_advance: true,
        });

        const amount = plan ? Math.round(plan.precio_por_usuario * 100) : 30000; // default $300 MXN
        const description = sub.status === "trial"
          ? "Suscripción Rutapp - Fin de prueba gratuita"
          : `Renovación Rutapp - ${plan?.nombre || "Mensual"}`;

        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount,
          currency: "mxn",
          description,
        });

        // Finalize invoice so it can be paid
        await stripe.invoices.finalizeInvoice(invoice.id);

        results.push({ sub_id: sub.id, invoice_id: invoice.id, status: "created" });
      } catch (err) {
        console.error(`Error processing sub ${sub.id}:`, err);
        results.push({ sub_id: sub.id, status: "error", error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ processed: allSubs.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error create-invoice-reminder:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
