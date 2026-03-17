import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    log("ERROR", "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("No signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: any) {
    log("Signature verification failed", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  log("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      // ── Checkout completed → activate subscription ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const empresaId = session.metadata?.empresa_id ||
          (await getEmpresaFromCustomer(stripe, supabase, customerId));

        if (!empresaId) { log("No empresa_id for checkout"); break; }

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = stripeSub.items.data[0]?.price?.id;
        const qty = stripeSub.items.data[0]?.quantity || 3;

        await supabase.from("subscriptions").update({
          status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          max_usuarios: qty,
          current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("empresa_id", empresaId);

        log("Subscription activated", { empresaId, subscriptionId });
        break;
      }

      // ── Invoice paid → renew period ──
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription : invoice.subscription.id;

        const stripeSub = await stripe.subscriptions.retrieve(subId);

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, empresa_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (sub) {
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", sub.id);
          log("Invoice paid → subscription renewed", { subId, empresaId: sub.empresa_id });
        }
        break;
      }

      // ── Payment failed → mark past_due ──
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription : invoice.subscription.id;

        await supabase.from("subscriptions").update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", subId);

        log("Payment failed → past_due", { subId });
        break;
      }

      // ── Subscription deleted / cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from("subscriptions").update({
          status: "suspended",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub.id);

        log("Subscription deleted → suspended", { subId: sub.id });
        break;
      }

      // ── Subscription updated (plan change, qty change) ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        const qty = sub.items.data[0]?.quantity || 3;

        const statusMap: Record<string, string> = {
          active: "active",
          past_due: "past_due",
          canceled: "suspended",
          unpaid: "past_due",
          trialing: "trial",
        };

        await supabase.from("subscriptions").update({
          status: statusMap[sub.status] || sub.status,
          stripe_price_id: priceId,
          max_usuarios: qty,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub.id);

        log("Subscription updated", { subId: sub.id, status: sub.status, qty });
        break;
      }

      default:
        log("Unhandled event type", event.type);
    }
  } catch (err: any) {
    log("ERROR processing event", { type: event.type, error: err.message });
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Helper: find empresa_id from Stripe customer email
async function getEmpresaFromCustomer(
  stripe: Stripe,
  supabase: any,
  customerId: string
): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const email = (customer as Stripe.Customer).email;
    if (!email) return null;

    // Find user by email → profile → empresa_id
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find((u: any) => u.email === email);
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", user.id)
      .maybeSingle();

    return profile?.empresa_id || null;
  } catch {
    return null;
  }
}
