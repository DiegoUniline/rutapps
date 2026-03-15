import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RUTAPP_PRODUCT_IDS = new Set([
  "prod_U9a56wjBGbKv4B",
  "prod_U9a6TsdjaGp99L",
  "prod_U9a7Ap6nbM6kPV",
]);

const GRACE_DAYS = 3;

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
    const results: any[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Get WhatsApp token
    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const waToken = waConfig?.api_token;

    // ─── STEP 1: Notify 1 day before billing (day 30/31 of month) ───
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() === 1) {
      // Tomorrow is the 1st — send pre-charge notifications
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, stripe_customer_id, stripe_subscription_id, status")
        .in("status", ["active", "trial"]);

      for (const sub of activeSubs || []) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id, nombre, telefono")
            .eq("empresa_id", sub.empresa_id)
            .limit(1)
            .maybeSingle();
          if (!profile) continue;

          const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
          const email = userData?.user?.email;
          if (!email) continue;

          const amount = sub.max_usuarios * 300;
          const amountFmt = `$${amount.toLocaleString("es-MX")} MXN`;

          // Send WhatsApp notification
          if (waToken && profile.telefono) {
            const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
            const msg = `🔔 *Aviso de cobro Rutapp*\n\nHola ${profile.nombre || ""},\n\nMañana *1 de ${getMonthName()}* se realizará tu cobro automático de *${amountFmt}* por ${sub.max_usuarios} usuario(s).\n\nSi necesitas actualizar tu método de pago, entra a:\n${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "")}/facturacion\n\n¡Gracias por confiar en Rutapp! 🚀`;

            await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": waToken },
              body: JSON.stringify({ action: "send-text", phone, message: msg }),
            }).catch((e) => console.error("WhatsApp pre-charge error:", e));
          }

          // Stripe sends email automatically when invoice is created
          // We create the invoice 1 day early so customer sees it
          if (sub.stripe_subscription_id) {
            // Stripe auto-billing handles this — the invoice is created automatically
            results.push({ sub_id: sub.id, action: "pre_notify", status: "sent" });
          }
        } catch (err) {
          console.error(`Pre-notify error for sub ${sub.id}:`, err);
          results.push({ sub_id: sub.id, action: "pre_notify", status: "error" });
        }
      }
    }

    // ─── STEP 2: Check yesterday's charges (if today is the 2nd) ───
    if (today.getDate() === 2 || today.getDate() === 1) {
      // Check recent Stripe invoices for RutApp products
      const recentInvoices = await stripe.invoices.list({
        limit: 100,
        created: { gte: Math.floor(new Date(today.getFullYear(), today.getMonth(), 1).getTime() / 1000) },
        expand: ["data.lines.data.price"],
      });

      for (const inv of recentInvoices.data) {
        // Only RutApp invoices
        if (!inv.lines?.data?.length) continue;
        const isRutapp = inv.lines.data.some((line: any) => {
          const pid = typeof line.price?.product === "string" ? line.price.product : line.price?.product?.id;
          return pid && RUTAPP_PRODUCT_IDS.has(pid);
        });
        if (!isRutapp) continue;

        const customerEmail = inv.customer_email;
        if (!customerEmail) continue;

        // Find the empresa
        const { data: allUsers } = await supabase.auth.admin.listUsers();
        const matchUser = allUsers?.users?.find((u: any) => u.email === customerEmail);
        if (!matchUser) continue;

        const { data: profile } = await supabase
          .from("profiles")
          .select("empresa_id, telefono, nombre")
          .eq("user_id", matchUser.id)
          .maybeSingle();
        if (!profile) continue;

        if (inv.status === "paid") {
          // ✅ Payment succeeded — confirm and update subscription
          await supabase
            .from("subscriptions")
            .update({
              status: "active",
              current_period_start: todayStr,
              current_period_end: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split("T")[0],
              updated_at: new Date().toISOString(),
            })
            .eq("empresa_id", profile.empresa_id);

          // Notify via WhatsApp
          if (waToken && profile.telefono) {
            const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
            const amountFmt = `$${(inv.amount_paid / 100).toLocaleString("es-MX")} MXN`;
            const msg = `✅ *Pago exitoso — Rutapp*\n\nHola ${profile.nombre || ""},\n\nTu pago de *${amountFmt}* se procesó correctamente.\n\nTu suscripción está activa hasta el *1 de ${getNextMonthName()}*.\n\n¡Gracias! 🎉`;

            await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": waToken },
              body: JSON.stringify({ action: "send-text", phone, message: msg }),
            }).catch((e) => console.error("WhatsApp confirm error:", e));
          }

          results.push({ email: customerEmail, action: "payment_confirmed", status: "ok" });
        } else if (inv.status === "open" || inv.status === "uncollectible") {
          // ❌ Payment failed
          await supabase
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("empresa_id", profile.empresa_id);

          if (waToken && profile.telefono) {
            const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
            const msg = `⚠️ *Cobro fallido — Rutapp*\n\nHola ${profile.nombre || ""},\n\nNo pudimos procesar tu pago. Tienes *${GRACE_DAYS} días* para actualizar tu método de pago o pagar manualmente.\n\n💳 Paga aquí:\n${inv.hosted_invoice_url || "https://rutapps.lovable.app/facturacion"}\n\nSi no regularizas, tu acceso será suspendido.`;

            await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": waToken },
              body: JSON.stringify({ action: "send-text", phone, message: msg }),
            }).catch((e) => console.error("WhatsApp failure error:", e));
          }

          results.push({ email: customerEmail, action: "payment_failed", status: "notified" });
        }
      }
    }

    // ─── STEP 3: Suspend after grace period ───
    const graceCutoff = new Date(today);
    graceCutoff.setDate(graceCutoff.getDate() - GRACE_DAYS);
    const graceCutoffStr = graceCutoff.toISOString();

    const { data: pastDueSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, updated_at")
      .eq("status", "past_due")
      .lt("updated_at", graceCutoffStr);

    for (const sub of pastDueSubs || []) {
      await supabase
        .from("subscriptions")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("id", sub.id);

      // Notify suspension
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, telefono, nombre")
        .eq("empresa_id", sub.empresa_id)
        .limit(1)
        .maybeSingle();

      if (waToken && profile?.telefono) {
        const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
        const msg = `🔴 *Cuenta suspendida — Rutapp*\n\nHola ${profile.nombre || ""},\n\nTu cuenta ha sido suspendida por falta de pago.\n\nPara reactivar tu acceso, realiza tu pago en:\nhttps://rutapps.lovable.app/facturacion\n\nSi tienes dudas, contáctanos.`;

        await fetch(WHATSAPI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-token": waToken },
          body: JSON.stringify({ action: "send-text", phone, message: msg }),
        }).catch((e) => console.error("WhatsApp suspend error:", e));
      }

      results.push({ sub_id: sub.id, action: "suspended" });
    }

    return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error billing-notify:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getMonthName() {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return months[new Date().getMonth() + 1] || months[0];
}

function getNextMonthName() {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const nextMonth = (new Date().getMonth() + 2) % 12;
  return months[nextMonth];
}
