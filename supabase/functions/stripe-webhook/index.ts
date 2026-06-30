import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { notifyBillingEvent } from "../_shared/billing-notify-utils.ts";

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

function getStripeId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function getSubPeriodEnd(sub: Stripe.Subscription): string | null {
  const itemEnd = (sub.items.data[0] as any)?.current_period_end;
  const subEnd = (sub as any)?.current_period_end;
  const unix = itemEnd ?? subEnd ?? sub.trial_end;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

function getInvoicePeriod(invoice: Stripe.Invoice): { inicio: string; fin: string } {
  const linePeriod = invoice.lines?.data?.[0]?.period;
  const start = linePeriod?.start ?? (invoice as any).period_start ?? invoice.created;
  const end = linePeriod?.end ?? (invoice as any).period_end ?? invoice.created;
  return {
    inicio: new Date(start * 1000).toISOString().slice(0, 10),
    fin: new Date(end * 1000).toISOString().slice(0, 10),
  };
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

      // ── Flujo nuevo MENSUAL: alta vía setup mode. Creamos sub aquí con
      //    trial_end + billing_cycle_anchor para alinear al día 1 (CDMX).
      if (empresa_id && flow === "trial_signup_setup" && session.mode === "setup") {
        const setupIntentId = typeof session.setup_intent === "string"
          ? session.setup_intent : session.setup_intent?.id;
        if (!setupIntentId) throw new Error("setup_intent ausente en session");
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId = typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method : setupIntent.payment_method?.id;
        if (!paymentMethodId || !stripeCustomerId) throw new Error("PM o customer ausente");

        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        const planSlug = session.metadata?.plan_slug || "";
        const planIdMeta = session.metadata?.plan_id;
        const qty = parseInt(session.metadata?.num_usuarios || "1", 10);
        const { data: planRow } = await supabase
          .from("subscription_plans")
          .select("usuarios_incluidos, stripe_price_id, stripe_price_id_extra")
          .eq("id", planIdMeta).maybeSingle();
        if (!planRow?.stripe_price_id) throw new Error("Plan sin stripe_price_id");

        const items: Stripe.SubscriptionCreateParams.Item[] = [];
        if (planSlug && planRow.stripe_price_id_extra) {
          items.push({ price: planRow.stripe_price_id, quantity: 1 });
          const extras = Math.max(0, qty - (planRow.usuarios_incluidos || 0));
          if (extras > 0) items.push({ price: planRow.stripe_price_id_extra, quantity: extras });
        } else {
          items.push({ price: planRow.stripe_price_id, quantity: qty });
        }

        // trial_end = ahora + 7 días
        const trialEndUnix = Math.floor(Date.now() / 1000) + 7 * 86400;
        // billing_cycle_anchor = 1° del mes siguiente al fin de trial, 00:00 CDMX
        const trialEndDate = new Date(trialEndUnix * 1000);
        const cdmxFmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: TZ, year: "numeric", month: "2-digit",
        }).formatToParts(trialEndDate);
        const trialYear = parseInt(cdmxFmt.find(p => p.type === "year")!.value, 10);
        const trialMonth = parseInt(cdmxFmt.find(p => p.type === "month")!.value, 10);
        // primer día del mes siguiente, 00:00 CDMX (= 06:00 UTC)
        const nextMonth = trialMonth === 12 ? 1 : trialMonth + 1;
        const nextYear = trialMonth === 12 ? trialYear + 1 : trialYear;
        const anchorIso = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T06:00:00.000Z`;
        const anchorUnix = Math.floor(new Date(anchorIso).getTime() / 1000);

        const newSub = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items,
          default_payment_method: paymentMethodId,
          trial_end: trialEndUnix,
          billing_cycle_anchor: anchorUnix,
          proration_behavior: "create_prorations",
          collection_method: "charge_automatically",
          metadata: {
            empresa_id,
            plan_id: planIdMeta || "",
            plan_slug: planSlug,
            num_usuarios: String(qty),
            billing_period: "mensual",
            flow: "trial_signup_setup",
            alignment: "first_of_month_cdmx",
          },
        });

        await supabase
          .from("subscriptions")
          .update({
            status: "trial",
            trial_ends_at: new Date(trialEndUnix * 1000).toISOString(),
            current_period_end: anchorIso,
            fecha_vencimiento: anchorIso.slice(0, 10),
            acceso_bloqueado: false,
            stripe_subscription_id: newSub.id,
            stripe_customer_id: stripeCustomerId,
            stripe_payment_method_id: paymentMethodId,
            cancel_at_period_end: false,
            terms_accepted_at: session.metadata?.accepted_terms_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", empresa_id);
        log("Trial signup (setup→sub) created", { empresa_id, subId: newSub.id, trialEndUnix, anchorUnix });
      }
      // ── Flujo viejo: semestral/anual con mode=subscription ──
      else if (empresa_id && flow === "trial_signup" && stripeSubId) {
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
        const stripeSub = stripeSubId ? await stripe.subscriptions.retrieve(stripeSubId) : null;
        const currentPeriodEnd = stripeSub ? getSubPeriodEnd(stripeSub) : null;
        const venc = currentPeriodEnd?.slice(0, 10) ?? lastDayOfCurrentMonthMx();
        const planIdMeta = session.metadata?.plan_id || stripeSub?.metadata?.plan_id || null;
        const numUsuariosMeta = session.metadata?.num_usuarios || stripeSub?.metadata?.num_usuarios || null;
        const paymentMethodId = stripeSub
          ? getStripeId(stripeSub.default_payment_method)
          : null;
        const updatePayload: any = {
          status: "active",
          fecha_vencimiento: venc,
          acceso_bloqueado: false,
          stripe_subscription_id: stripeSubId ?? undefined,
          stripe_customer_id: stripeCustomerId ?? undefined,
          current_period_end: currentPeriodEnd ?? venc,
          cancel_at_period_end: stripeSub?.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        };
        if (planIdMeta) updatePayload.plan_id = planIdMeta;
        if (numUsuariosMeta) updatePayload.max_usuarios = parseInt(numUsuariosMeta, 10);
        if (paymentMethodId) updatePayload.stripe_payment_method_id = paymentMethodId;
        const { error } = await supabase
          .from("subscriptions")
          .update(updatePayload)
          .eq("empresa_id", empresa_id);
        if (error) log("Update error", error);
        else log("Access granted via checkout", { empresa_id, venc, stripeSubId, planIdMeta, numUsuariosMeta });
      }
    }

    // ── Sincroniza estado, cancel_at_period_end y fechas en cada cambio en Stripe ──
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      const empresa_id = sub.metadata?.empresa_id;
      if (empresa_id) {
        const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        const cpe = getSubPeriodEnd(sub);
        const cpsUnix = (sub.items.data[0] as any)?.current_period_start ?? (sub as any)?.current_period_start;
        const cps = cpsUnix ? new Date(cpsUnix * 1000).toISOString().slice(0, 10) : null;
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
        if (cps) payload.current_period_start = cps;
        if (paymentMethodId) payload.stripe_payment_method_id = paymentMethodId;

        // Recompute max_usuarios from items: base (qty 1) + extras (qty N) OR legacy single item
        try {
          const { data: subRow } = await supabase
            .from("subscriptions")
            .select("plan_id")
            .eq("empresa_id", empresa_id)
            .maybeSingle();
          if (subRow?.plan_id) {
            const { data: planRow } = await supabase
              .from("subscription_plans")
              .select("slug, usuarios_incluidos, stripe_price_id, stripe_price_id_extra")
              .eq("id", subRow.plan_id)
              .maybeSingle();
            if (planRow?.slug && planRow.stripe_price_id_extra) {
              const baseItem = sub.items.data.find((it: any) => it.price?.id === planRow.stripe_price_id);
              const extraItem = sub.items.data.find((it: any) => it.price?.id === planRow.stripe_price_id_extra);
              const baseQty = baseItem ? 1 : 0;
              const extraQty = extraItem?.quantity || 0;
              if (baseItem) {
                payload.max_usuarios = (planRow.usuarios_incluidos || 0) + extraQty;
                payload.legacy_pricing = false;
              }
            } else {
              // legacy single-item
              const q = sub.items.data[0]?.quantity;
              if (typeof q === "number" && q > 0) payload.max_usuarios = q;
            }
          }
        } catch (e) {
          log("max_usuarios recompute skipped", (e as Error).message);
        }

        await supabase.from("subscriptions").update(payload).eq("empresa_id", empresa_id);
        log("Subscription synced", { empresa_id, status: internalStatus, cancel_at_period_end: sub.cancel_at_period_end, max_usuarios: payload.max_usuarios });
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
      let stripeSubForInvoice: Stripe.Subscription | null = null;
      if (!empresa_id && stripeSubId) {
        const { data } = await supabase
          .from("subscriptions")
          .select("empresa_id")
          .eq("stripe_subscription_id", stripeSubId)
          .maybeSingle();
        empresa_id = data?.empresa_id ?? null;
      }
      if (!empresa_id && stripeSubId) {
        stripeSubForInvoice = await stripe.subscriptions.retrieve(stripeSubId);
        empresa_id = stripeSubForInvoice.metadata?.empresa_id ?? null;
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
        const subMetadata = stripeSubForInvoice?.metadata ?? {};
        const mesesRaw = invoice.metadata?.meses;
        const meses = mesesRaw ? parseInt(mesesRaw, 10) : 0;
        const planIdMeta = invoice.metadata?.plan_id || subMetadata.plan_id || null;
        const descPctMeta = invoice.metadata?.descuento_pct ? parseFloat(invoice.metadata.descuento_pct) : null;
        const descPermanente = invoice.metadata?.descuento_permanente === "1";
        const numUsuariosMetaRaw = invoice.metadata?.num_usuarios || subMetadata.num_usuarios || null;
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("id, current_period_end, max_usuarios, plan_id")
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        const numUsuariosMeta = numUsuariosMetaRaw ? parseInt(numUsuariosMetaRaw, 10) : (subRow?.max_usuarios ?? null);

        let venc: string;
        if (meses > 0) {
          const today = nowInMx();
          const currentEnd = subRow?.current_period_end ? new Date(subRow.current_period_end) : today;
          const base = currentEnd > today ? currentEnd : today;
          const extended = new Date(base);
          extended.setMonth(extended.getMonth() + meses);
          venc = extended.toISOString().slice(0, 10);
        } else {
          if (!stripeSubForInvoice && stripeSubId) {
            stripeSubForInvoice = await stripe.subscriptions.retrieve(stripeSubId);
          }
          const cpe = stripeSubForInvoice ? getSubPeriodEnd(stripeSubForInvoice) : null;
          venc = cpe ? cpe.slice(0, 10) : lastDayOfCurrentMonthMx();
        }

        const periodoFromInvoice = getInvoicePeriod(invoice);
        const updatePayload: any = {
          status: "active",
          fecha_vencimiento: venc,
          acceso_bloqueado: false,
          current_period_start: periodoFromInvoice.inicio,
          current_period_end: stripeSubForInvoice ? getSubPeriodEnd(stripeSubForInvoice) ?? venc : venc,
          updated_at: new Date().toISOString(),
        };
        if (stripeCustomerId) updatePayload.stripe_customer_id = stripeCustomerId;
        if (stripeSubId) updatePayload.stripe_subscription_id = stripeSubId;
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
          const { count } = await supabase
            .from("facturas")
            .select("id", { count: "exact", head: true })
            .eq("stripe_invoice_id", invoice.id);

          if (!count) {
            const periodo = getInvoicePeriod(invoice);
            const total = (invoice.total ?? invoice.amount_paid ?? invoice.amount_due ?? 0) / 100;
            await supabase.from("facturas").insert({
              empresa_id,
              suscripcion_id: subRow?.id ?? null,
              periodo_inicio: periodo.inicio,
              periodo_fin: periodo.fin,
              num_usuarios: numUsuariosMeta ?? 1,
              precio_unitario: numUsuariosMeta ? total / numUsuariosMeta : total,
              subtotal: total,
              total,
              estado: "pagada",
              fecha_emision: invoice.created ? new Date(invoice.created * 1000).toISOString() : new Date().toISOString(),
              fecha_pago: new Date().toISOString(),
              stripe_invoice_id: invoice.id,
              es_prorrateo: false,
            });
          }

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

        // ── Notify client + admins (real-time, per attempt) ──
        try {
          const { data: waConfig } = await supabase
            .from("whatsapp_config")
            .select("api_token")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          const { data: empresaRow } = await supabase
            .from("empresas").select("nombre").eq("id", empresa_id).maybeSingle();
          const { data: profileRow } = await supabase
            .from("profiles").select("user_id, nombre, telefono")
            .eq("empresa_id", empresa_id).limit(1).maybeSingle();
          let clienteEmail = invoice.customer_email || "";
          let clienteNombre = profileRow?.nombre || "";
          let clienteTelefono = profileRow?.telefono || "";
          if (!clienteEmail && profileRow?.user_id) {
            const { data: u } = await supabase.auth.admin.getUserById(profileRow.user_id);
            clienteEmail = u?.user?.email || "";
          }
          const todayMx = new Date().toLocaleDateString("es-MX", { timeZone: TZ });
          await notifyBillingEvent(supabase, waConfig?.api_token, {
            evento: "cobro_exitoso",
            empresa: empresaRow?.nombre || "",
            clienteNombre,
            clienteEmail,
            clienteTelefono,
            monto: `$${((invoice.amount_paid ?? invoice.total ?? 0) / 100).toLocaleString("es-MX")} MXN`,
            amountCents: invoice.amount_paid ?? invoice.total ?? 0,
            numUsuarios: numUsuariosMeta ?? undefined,
            folio: (invoice as any).number || null,
            invoiceUrl: invoice.hosted_invoice_url || null,
            fecha: todayMx,
            fechaVigencia: venc,
            idempotencyKey: `inv-${invoice.id}-paid-${event.id}`,
          });
        } catch (e) {
          console.error("[STRIPE-WEBHOOK] Client/admin notify (success) failed:", e);
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
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
          .from("subscriptions").select("empresa_id")
          .eq("stripe_subscription_id", stripeSubId).maybeSingle();
        empresa_id = data?.empresa_id ?? null;
      }
      if (!empresa_id && stripeCustomerId) {
        const { data } = await supabase
          .from("subscriptions").select("empresa_id")
          .eq("stripe_customer_id", stripeCustomerId).maybeSingle();
        empresa_id = data?.empresa_id ?? null;
      }

      if (empresa_id) {
        try {
          const { data: waConfig } = await supabase
            .from("whatsapp_config").select("api_token")
            .order("created_at", { ascending: true }).limit(1).maybeSingle();
          const { data: empresaRow } = await supabase
            .from("empresas").select("nombre").eq("id", empresa_id).maybeSingle();
          const { data: profileRow } = await supabase
            .from("profiles").select("user_id, nombre, telefono")
            .eq("empresa_id", empresa_id).limit(1).maybeSingle();
          let clienteEmail = invoice.customer_email || "";
          let clienteNombre = profileRow?.nombre || "";
          let clienteTelefono = profileRow?.telefono || "";
          if (!clienteEmail && profileRow?.user_id) {
            const u = await supabase.auth.admin.getUserById(profileRow.user_id);
            clienteEmail = u.data?.user?.email || "";
          }
          const intento = invoice.attempt_count ?? undefined;
          const lastErr =
            (invoice as any).last_finalization_error?.message ||
            (invoice as any).last_payment_error?.message ||
            `Stripe status: ${invoice.status}`;
          const todayMx = new Date().toLocaleDateString("es-MX", { timeZone: TZ });

          await notifyBillingEvent(supabase, waConfig?.api_token, {
            evento: "cobro_fallido",
            empresa: empresaRow?.nombre || "",
            clienteNombre,
            clienteEmail,
            clienteTelefono,
            monto: `$${((invoice.amount_due ?? 0) / 100).toLocaleString("es-MX")} MXN`,
            amountCents: invoice.amount_due ?? 0,
            folio: (invoice as any).number || null,
            invoiceUrl: invoice.hosted_invoice_url || null,
            enlacePago: invoice.hosted_invoice_url || null,
            fecha: todayMx,
            intento,
            detalle: lastErr,
            idempotencyKey: `inv-${invoice.id}-failed-${event.id}`,
          });
          log("Payment failed notified", { empresa_id, intento, invoice: invoice.id });
        } catch (e) {
          console.error("[STRIPE-WEBHOOK] Client/admin notify (failed) error:", e);
        }
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
