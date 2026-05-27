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
      const flow = session.metadata?.flow;
      const stripeSubId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      const stripeCustomerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

      // ── Flujo nuevo: alta con trial 7 días + tarjeta obligatoria ──
      if (empresa_id && flow === "trial_signup" && stripeSubId) {
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const trialEndsAt = stripeSub.trial_end
          ? new Date(stripeSub.trial_end * 1000).toISOString()
          : null;
        const cpeUnix = stripeSub.items.data[0]?.current_period_end ?? stripeSub.trial_end;
        const currentPeriodEnd = cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null;
        const paymentMethodId = typeof stripeSub.default_payment_method === "string"
          ? stripeSub.default_payment_method
          : (stripeSub.default_payment_method as any)?.id ?? null;

        await supabase
          .from("subscriptions")
          .update({
            status: "trial",
            trial_ends_at: trialEndsAt,
            current_period_end: currentPeriodEnd,
            fecha_vencimiento: currentPeriodEnd?.slice(0, 10),
            acceso_bloqueado: false,
            stripe_subscription_id: stripeSubId,
            stripe_customer_id: stripeCustomerId ?? undefined,
            stripe_payment_method_id: paymentMethodId,
            cancel_at_period_end: false,
            terms_accepted_at: session.metadata?.accepted_terms_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", empresa_id);
        log("Trial signup completed (card on file)", { empresa_id, trialEndsAt, paymentMethodId });
      }
      // ── Flujo viejo: pago inmediato (upgrades) ──
      else if (empresa_id && session.payment_status === "paid") {
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

    // ── Sincroniza estado, cancel_at_period_end y fechas en cada cambio en Stripe ──
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      const empresa_id = sub.metadata?.empresa_id;
      if (empresa_id) {
        const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        const cpeUnix = (sub.items.data[0] as any)?.current_period_end;
        const cpe = cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null;
        const paymentMethodId = typeof sub.default_payment_method === "string"
          ? sub.default_payment_method
          : (sub.default_payment_method as any)?.id ?? null;

        let internalStatus: string | null = null;
        if (sub.status === "trialing") internalStatus = "trial";
        else if (sub.status === "active") internalStatus = "active";
        else if (sub.status === "past_due") internalStatus = "past_due";
        else if (sub.status === "canceled") internalStatus = "cancelled";
        else if (sub.status === "incomplete" || sub.status === "incomplete_expired") internalStatus = "pending_payment_method";

        const payload: any = {
          cancel_at_period_end: !!sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        };
        if (internalStatus) payload.status = internalStatus;
        if (trialEndsAt) payload.trial_ends_at = trialEndsAt;
        if (cpe) {
          payload.current_period_end = cpe;
          payload.fecha_vencimiento = cpe.slice(0, 10);
        }
        if (paymentMethodId) payload.stripe_payment_method_id = paymentMethodId;

        await supabase.from("subscriptions").update(payload).eq("empresa_id", empresa_id);
        log("Subscription synced", { empresa_id, status: internalStatus, cancel_at_period_end: sub.cancel_at_period_end });
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId = typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
      const stripeSubId = typeof (invoice as any).subscription === "string"
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

      let empresa_id: string | null = invoice.metadata?.empresa_id ?? null;
      if (!empresa_id && stripeSubId) {
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
        const mesesRaw = invoice.metadata?.meses;
        const meses = mesesRaw ? parseInt(mesesRaw, 10) : 0;
        const planIdMeta = invoice.metadata?.plan_id || null;
        const descPctMeta = invoice.metadata?.descuento_pct ? parseFloat(invoice.metadata.descuento_pct) : null;
        const descPermanente = invoice.metadata?.descuento_permanente === "1";
        const numUsuariosMeta = invoice.metadata?.num_usuarios ? parseInt(invoice.metadata.num_usuarios, 10) : null;

        let venc: string;
        if (meses > 0) {
          const { data: subRow } = await supabase
            .from("subscriptions")
            .select("current_period_end")
            .eq("empresa_id", empresa_id)
            .maybeSingle();
          const today = nowInMx();
          const currentEnd = subRow?.current_period_end ? new Date(subRow.current_period_end) : today;
          const base = currentEnd > today ? currentEnd : today;
          const extended = new Date(base);
          extended.setMonth(extended.getMonth() + meses);
          venc = extended.toISOString().slice(0, 10);
        } else {
          const cpe = stripeSubId
            ? (await stripe.subscriptions.retrieve(stripeSubId)).items.data[0]?.current_period_end
            : null;
          venc = cpe ? new Date(cpe * 1000).toISOString().slice(0, 10) : lastDayOfCurrentMonthMx();
        }

        const updatePayload: any = {
          status: "active",
          fecha_vencimiento: venc,
          acceso_bloqueado: false,
          current_period_end: venc,
          updated_at: new Date().toISOString(),
        };
        if (stripeCustomerId) updatePayload.stripe_customer_id = stripeCustomerId;
        if (planIdMeta) updatePayload.plan_id = planIdMeta;
        if (numUsuariosMeta) updatePayload.max_usuarios = numUsuariosMeta;
        if (descPermanente && descPctMeta !== null) {
          updatePayload.descuento_porcentaje = descPctMeta;
        } else if (descPctMeta !== null && !descPermanente) {
          updatePayload.descuento_porcentaje = 0;
        }

        await supabase
          .from("subscriptions")
          .update(updatePayload)
          .eq("empresa_id", empresa_id);

        if (invoice.id) {
          await supabase
            .from("facturas")
            .update({
              estado: "pagada",
              fecha_pago: new Date().toISOString(),
              stripe_payment_intent_id: typeof (invoice as any).payment_intent === "string" ? (invoice as any).payment_intent : null,
            })
            .eq("stripe_invoice_id", invoice.id);
        }

        log("Access renewed via invoice", { empresa_id, venc, meses, planIdMeta, descPermanente });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const empresa_id = sub.metadata?.empresa_id;
      if (empresa_id) {
        await supabase
          .from("subscriptions")
          .update({
            status: "cancelled",
            cancel_at_period_end: false,
            acceso_bloqueado: true,
            updated_at: new Date().toISOString(),
          })
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
