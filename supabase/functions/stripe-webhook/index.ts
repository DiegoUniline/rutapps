import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

// ── Normalize period dates to 1st of month boundaries ──
// All billing cycles run 1st → 1st. Stripe may return dates like Apr 30 instead of May 1.
function normalizePeriodStart(ts: number): string {
  const d = new Date(ts * 1000);
  // Snap to the 1st of the same month
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function normalizePeriodEnd(ts: number): string {
  const d = new Date(ts * 1000);
  // Snap to the 1st of the next month
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}

// ── Stripe error codes → Spanish ──
const errorMap: Record<string, string> = {
  card_declined: "Tu tarjeta fue rechazada por el banco",
  insufficient_funds: "Fondos insuficientes en la tarjeta",
  expired_card: "Tu tarjeta está vencida",
  incorrect_cvc: "El código de seguridad (CVC) es incorrecto",
  processing_error: "Error temporal al procesar el pago",
  lost_card: "La tarjeta fue reportada como perdida",
  stolen_card: "La tarjeta fue reportada como robada",
  generic_decline: "El banco rechazó la transacción",
  authentication_required: "Se requiere autenticación adicional (3D Secure)",
  payment_intent_payment_attempt_failed: "No se pudo completar el cobro",
};

function getErrorMessage(code?: string): string {
  return errorMap[code || ""] || "Error al procesar el pago";
}

// ── WhatsApp helper (with billing_notifications logging) ──
async function sendWhatsApp(supabase: any, empresaId: string, message: string, tipo: string = "webhook", email?: string, monto_centavos?: number) {
  let phone: string | null = null;
  let customerEmail = email || "";
  let status = "sent";

  try {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("telefono, user_id")
      .eq("empresa_id", empresaId)
      .not("telefono", "is", null)
      .limit(1);
    phone = profiles?.[0]?.telefono;
    if (!phone) { status = "error"; return; }

    // Get email if not provided
    if (!customerEmail && profiles?.[0]?.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(profiles[0].user_id);
      customerEmail = userData?.user?.email || "";
    }

    const res = await supabase.functions.invoke("whatsapp-sender", {
      body: { action: "send_text", empresa_id: empresaId, phone, message },
    });
    if (res.error) status = "error";
  } catch (e) {
    status = "error";
    log("WhatsApp non-blocking error", (e as Error).message);
  } finally {
    // Always log to billing_notifications
    try {
      await supabase.from("billing_notifications").insert({
        customer_email: customerEmail,
        customer_phone: phone || "",
        channel: "whatsapp",
        tipo,
        mensaje: message,
        monto_centavos: monto_centavos || 0,
        status,
      });
    } catch { /* silent */ }
  }
}

// ── Find empresa from Stripe customer ──
async function getEmpresaFromCustomer(
  stripe: Stripe, supabase: any, customerId: string
): Promise<{ empresaId: string | null; empresaNombre: string | null }> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return { empresaId: null, empresaNombre: null };
    const email = (customer as Stripe.Customer).email;
    if (!email) return { empresaId: null, empresaNombre: null };

    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find((u: any) => u.email === email);
    if (!user) return { empresaId: null, empresaNombre: null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.empresa_id) return { empresaId: null, empresaNombre: null };

    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre")
      .eq("id", profile.empresa_id)
      .single();

    return { empresaId: profile.empresa_id, empresaNombre: empresa?.nombre || null };
  } catch {
    return { empresaId: null, empresaNombre: null };
  }
}

async function getEmpresaByStripeSubId(supabase: any, stripeSubId: string) {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("empresa_id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  if (!sub?.empresa_id) return { empresaId: null, empresaNombre: null };
  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre")
    .eq("id", sub.empresa_id)
    .single();
  return { empresaId: sub.empresa_id, empresaNombre: empresa?.nombre || null };
}

async function getEmpresaByStripeCustomerId(supabase: any, customerId: string) {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("empresa_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!sub?.empresa_id) return { empresaId: null, empresaNombre: null };
  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre")
    .eq("id", sub.empresa_id)
    .single();
  return { empresaId: sub.empresa_id, empresaNombre: empresa?.nombre || null };
}

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
          (await getEmpresaFromCustomer(stripe, supabase, customerId)).empresaId;

        if (!empresaId) { log("No empresa_id for checkout"); break; }

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const item0 = stripeSub.items.data[0];
        const priceId = item0?.price?.id;
        const qty = item0?.quantity || 3;

        // In Stripe API 2025-08-27.basil, period dates are on items, not top-level
        const periodStart = (item0 as any)?.current_period_start ?? (stripeSub as any).current_period_start;
        const periodEnd = (item0 as any)?.current_period_end ?? (stripeSub as any).current_period_end;

        const updateData: Record<string, any> = {
          status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          max_usuarios: qty,
          updated_at: new Date().toISOString(),
        };
        if (periodStart) updateData.current_period_start = normalizePeriodStart(periodStart);
        if (periodEnd) updateData.current_period_end = normalizePeriodEnd(periodEnd);

        await supabase.from("subscriptions").update(updateData).eq("empresa_id", empresaId);

        // Mark pending invoices as paid
        await supabase.from("facturas")
          .update({ estado: "pagada", fecha_pago: new Date().toISOString() })
          .eq("empresa_id", empresaId)
          .in("estado", ["pendiente", "procesando"]);

        // WhatsApp — always show 1st of next month
        const { data: empresa } = await supabase.from("empresas").select("nombre").eq("id", empresaId).single();
        const proximoCobro = periodEnd ? new Date(normalizePeriodEnd(periodEnd)).toLocaleDateString("es-MX") : "el 1ro del siguiente mes";
        await sendWhatsApp(supabase, empresaId,
          `¡Hola! 🎉\nTu suscripción de *${empresa?.nombre || "tu empresa"}* ha sido *activada* exitosamente.\n✅ *Usuarios:* ${qty}\n📅 *Próximo cobro:* ${proximoCobro}\nGracias por confiar en *Uniline*. ¡Sigue creciendo tu negocio! 🚀`,
          "cobro_exitoso"
        );

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
        const item0 = stripeSub.items.data[0];
        const periodStart = (item0 as any)?.current_period_start ?? (stripeSub as any).current_period_start;
        const periodEnd = (item0 as any)?.current_period_end ?? (stripeSub as any).current_period_end;
        const { empresaId, empresaNombre } = await getEmpresaByStripeSubId(supabase, subId);

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, empresa_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (sub) {
          const updateData: Record<string, any> = {
            status: "active",
            updated_at: new Date().toISOString(),
          };
          if (periodStart) updateData.current_period_start = normalizePeriodStart(periodStart);
            if (periodEnd) updateData.current_period_end = normalizePeriodEnd(periodEnd);

          await supabase.from("subscriptions").update(updateData).eq("id", sub.id);

          // Update factura
          if (invoice.id) {
            await supabase.from("facturas")
              .update({ estado: "pagada", fecha_pago: new Date().toISOString(), stripe_invoice_id: invoice.id })
              .eq("empresa_id", sub.empresa_id)
              .eq("estado", "procesando");
          }

          // WhatsApp — always show 1st of next month
          const monto = invoice.amount_paid ? (invoice.amount_paid / 100).toLocaleString() : "N/A";
          const proximoCobro = periodEnd ? new Date(normalizePeriodEnd(periodEnd)).toLocaleDateString("es-MX") : "el 1ro del siguiente mes";
          await sendWhatsApp(supabase, sub.empresa_id,
            `¡Hola! 🎉\nTu pago de suscripción de *${empresaNombre || "tu empresa"}* se procesó correctamente.\n✅ *Monto cobrado:* $${monto} MXN\n📅 *Próximo cobro:* ${proximoCobro}\nGracias por confiar en *Uniline*. ¡Sigue creciendo tu negocio! 🚀`
          );

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

      // ── Charge failed → WhatsApp notification ──
      case "charge.failed": {
        const charge = event.data.object as Stripe.Charge;
        const customerId = charge.customer as string;
        if (!customerId) break;

        const { empresaId, empresaNombre } = await getEmpresaByStripeCustomerId(supabase, customerId);
        if (!empresaId) break;

        const errorCode = charge.failure_code || "generic_decline";
        const errorMsg = getErrorMessage(errorCode);
        const monto = (charge.amount / 100).toLocaleString();
        const moneda = (charge.currency || "mxn").toUpperCase();

        await sendWhatsApp(supabase, empresaId,
          `¡Hola! 👋\nNo pudimos procesar tu pago de suscripción para *${empresaNombre || "tu empresa"}*.\n💰 *Monto:* $${monto} ${moneda}\n❌ *Motivo:* ${errorMsg}\n🔄 *¿Qué puedes hacer?*\n1️⃣ Verifica que tu tarjeta tenga fondos\n2️⃣ Actualiza tu método de pago desde la app\n3️⃣ Si persiste, contacta a tu banco`
        );

        log("Charge failed → WhatsApp sent", { empresaId, errorCode });
        break;
      }

      // ── Subscription deleted / cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from("subscriptions").update({
          status: "suspended",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub.id);

        const { empresaId, empresaNombre } = await getEmpresaByStripeSubId(supabase, sub.id);
        if (empresaId) {
          await sendWhatsApp(supabase, empresaId,
            `¡Hola! ⚠️\nLa suscripción de *${empresaNombre || "tu empresa"}* ha sido *suspendida*.\n🔒 Tu acceso ha sido restringido temporalmente.\nPara reactivar:\n1️⃣ Abre la app → *Mi Suscripción*\n2️⃣ Actualiza tu método de pago\n3️⃣ Tu acceso se restaurará al instante ✅\nTus datos están seguros. 🔐`
          );
        }

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

        const item0 = sub.items.data[0];
        const periodStart = (item0 as any)?.current_period_start ?? (sub as any).current_period_start;
        const periodEnd = (item0 as any)?.current_period_end ?? (sub as any).current_period_end;

        const updateData: Record<string, any> = {
          status: statusMap[sub.status] || sub.status,
          max_usuarios: qty,
          updated_at: new Date().toISOString(),
        };
        if (periodStart) updateData.current_period_start = normalizePeriodStart(periodStart);
        if (periodEnd) updateData.current_period_end = normalizePeriodEnd(periodEnd);

        await supabase.from("subscriptions").update(updateData).eq("stripe_subscription_id", sub.id);

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
