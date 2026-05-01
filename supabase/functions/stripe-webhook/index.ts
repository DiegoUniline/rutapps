import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const TZ = "America/Mexico_City";

const log = (step: string, details?: any) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

function nowInMx(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: TZ });
  return new Date(s);
}

function lastDayOfCurrentMonthMx(): string {
  const now = nowInMx();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Missing config", { status: 500, headers: corsHeaders });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400, headers: corsHeaders });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("[STRIPE-WEBHOOK] Signature verification failed:", err.message);
    return new Response(`Bad signature: ${err.message}`, { status: 400, headers: corsHeaders });
  }

  log("Event received", { type: event.type, id: event.id });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const empresa_id = session.metadata?.empresa_id;
      const stripeSubId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      const stripeCustomerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

      if (empresa_id && session.payment_status === "paid") {
        const venc = lastDayOfCurrentMonthMx();
        const { error } = await supabase
          .from("subscriptions")
          .update({
            status: "active",
            fecha_vencimiento: venc,
            acceso_bloqueado: false,
            stripe_subscription_id: stripeSubId ?? undefined,
            stripe_customer_id: stripeCustomerId ?? undefined,
            current_period_end: venc,
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", empresa_id);
        if (error) log("Update error", error);
        else log("Access granted via checkout", { empresa_id, venc });
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId = typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
      const stripeSubId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;

      // Find empresa via stripe_subscription_id or stripe_customer_id
      let empresa_id: string | null = null;
      if (stripeSubId) {
        const { data } = await supabase
          .from("subscriptions")
          .select("empresa_id")
          .eq("stripe_subscription_id", stripeSubId)
          .maybeSingle();
        empresa_id = data?.empresa_id ?? null;
      }
      if (!empresa_id && stripeCustomerId) {
        const { data } = await supabase
          .from("subscriptions")
          .select("empresa_id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();
        empresa_id = data?.empresa_id ?? null;
      }

      if (empresa_id) {
        const venc = lastDayOfCurrentMonthMx();
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            fecha_vencimiento: venc,
            acceso_bloqueado: false,
            current_period_end: venc,
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", empresa_id);
        log("Access renewed via invoice", { empresa_id, venc });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const empresa_id = sub.metadata?.empresa_id;
      if (empresa_id) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("empresa_id", empresa_id);
        log("Subscription cancelled", { empresa_id });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[STRIPE-WEBHOOK] Handler error:", error);
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
