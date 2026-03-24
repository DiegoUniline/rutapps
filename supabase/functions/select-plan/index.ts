import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[SELECT-PLAN] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const FACTURACION_URL = "https://rutapp.mx/mi-suscripcion";

/* ─── Send WhatsApp text ─── */
async function sendWA(waToken: string, phone: string, message: string): Promise<boolean> {
  try {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
    const res = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": waToken },
      body: JSON.stringify({ action: "send-text", phone: cleanPhone, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ─── Send billing email ─── */
async function sendEmail(supabase: any, to: string, subject: string, html: string) {
  try {
    await supabase.from("billing_notifications").insert({
      customer_email: to,
      channel: "email",
      tipo: "factura_pendiente",
      mensaje: subject,
      status: "logged",
    });
    // Also try billing-notify-email for actual delivery
    await supabase.functions.invoke("billing-notify-email", {
      body: { to, empresa: "", plan: subject, amount: 0, url: "" },
    }).catch(() => {});
  } catch { /* silent */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { plan_id, num_usuarios } = await req.json();
    if (!plan_id) throw new Error("plan_id requerido");

    const qty = Math.max(3, parseInt(num_usuarios) || 3);
    const origin = req.headers.get("origin") || "https://rutapps.lovable.app";

    // Get user's empresa
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id, nombre, telefono")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    // Get plan details
    const { data: plan, error: planErr } = await supabase
      .from("planes")
      .select("*")
      .eq("id", plan_id)
      .eq("activo", true)
      .single();
    if (planErr || !plan) throw new Error("Plan no encontrado o inactivo");

    log("Plan selected", { plan: plan.nombre, qty, empresa: profile.empresa_id });

    // Calculate proration
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    const diaActual = now.getDate();
    const diasRestantes = diasEnMes - diaActual + 1;
    const esProrrateo = diaActual !== 1;

    const precioUnitario = plan.precio_base_mes;
    const subtotal = precioUnitario * qty;
    const total = esProrrateo
      ? Math.round((subtotal / diasEnMes) * diasRestantes * 100) / 100
      : subtotal;

    const periodoInicio = now.toISOString().slice(0, 10);
    const primeroDeSiguiente = new Date(year, month + 1, 1);
    const periodoFin = new Date(primeroDeSiguiente.getTime() - 86400000).toISOString().slice(0, 10);

    log("Proration calculated", { diasEnMes, diaActual, diasRestantes, esProrrateo, subtotal, total });

    const subUpdatePayload: Record<string, any> = {
      plan_id: plan.id,
      status: "pendiente_pago",
      max_usuarios: qty,
      es_manual: true,
      updated_at: new Date().toISOString(),
    };
    if (plan.stripe_price_id) subUpdatePayload.stripe_price_id = plan.stripe_price_id;

    const { error: subErr } = await supabase
      .from("subscriptions")
      .update(subUpdatePayload)
      .eq("empresa_id", profile.empresa_id);

    if (subErr) log("Sub update error", subErr);

    // Delete previous pending invoices for this empresa
    await supabase
      .from("facturas")
      .delete()
      .eq("empresa_id", profile.empresa_id)
      .eq("estado", "pendiente");

    // Get subscription id
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();

    // Create new invoice
    const { data: factura, error: facErr } = await supabase
      .from("facturas")
      .insert({
        empresa_id: profile.empresa_id,
        suscripcion_id: sub?.id || null,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        num_usuarios: qty,
        precio_unitario: precioUnitario,
        subtotal,
        total,
        estado: "pendiente",
        es_prorrateo: esProrrateo,
        fecha_vencimiento: new Date(now.getTime() + 3 * 86400000).toISOString(),
      })
      .select()
      .single();

    if (facErr) {
      log("Invoice creation error", facErr);
      throw new Error("Error creando factura");
    }

    log("Invoice created", { facturaId: factura.id, total, esProrrateo });

    // ═══════════════════════════════════════════════
    // SEND NOTIFICATIONS: WA + Email with payment link
    // ═══════════════════════════════════════════════
    let stripeCheckoutUrl = "";

    // Generate Stripe checkout URL if plan has stripe_price_id
    if (plan.stripe_price_id) {
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

          // Find or create Stripe customer
          const email = userData.user.email!;
          const customers = await stripe.customers.list({ email, limit: 1 });
          let customerId: string;
          if (customers.data.length > 0) {
            customerId = customers.data[0].id;
          } else {
            const nc = await stripe.customers.create({
              email,
              metadata: { empresa_id: profile.empresa_id },
            });
            customerId = nc.id;
          }

          const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const session = await stripe.checkout.sessions.create({
            customer: customerId,
            line_items: [{ price: plan.stripe_price_id, quantity: qty }],
            mode: "subscription",
            subscription_data: {
              billing_cycle_anchor: Math.floor(nextFirst.getTime() / 1000),
              proration_behavior: "create_prorations",
              metadata: { empresa_id: profile.empresa_id },
            },
            success_url: `${origin}/dashboard?checkout=success`,
            cancel_url: `${origin}/mi-suscripcion?checkout=cancelled`,
          });
          stripeCheckoutUrl = session.url || "";
          log("Stripe checkout URL generated", { url: stripeCheckoutUrl.slice(0, 60) });
        }
      } catch (e) {
        log("Stripe checkout URL generation error (non-blocking)", (e as Error).message);
      }
    }

    // Get empresa name
    const { data: empresaData } = await supabase
      .from("empresas")
      .select("nombre")
      .eq("id", profile.empresa_id)
      .maybeSingle();
    const empresaNombre = empresaData?.nombre || "tu empresa";

    const payLink = stripeCheckoutUrl || FACTURACION_URL;
    const numFactura = factura.numero_factura || "N/A";
    const fechaLimite = new Date(now.getTime() + 3 * 86400000).toLocaleDateString("es-MX");

    // ─── WhatsApp notification ───
    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (waConfig?.api_token && profile.telefono) {
      const waMsg = [
        `💳 *Nueva factura generada — Rutapp*\n`,
        `Hola ${profile.nombre || ""}`,
        `de *${empresaNombre}*,\n`,
        `Se ha generado tu factura:`,
        `📋 *Factura:* ${numFactura}`,
        `📦 *Plan:* ${plan.nombre} — ${qty} usuarios`,
        `💰 *Monto:* $${total.toLocaleString()} MXN`,
        esProrrateo ? `📅 *Prorrateo:* ${diasRestantes} días restantes del mes` : "",
        `📅 *Fecha límite:* ${fechaLimite}\n`,
        `Puedes pagar con tarjeta desde aquí:`,
        `👉 ${payLink}\n`,
        `O desde la app → *Mi Suscripción* → *Pagar*\n`,
        `¡Gracias por confiar en Rutapp! 🚀`,
      ].filter(Boolean).join("\n");

      const sent = await sendWA(waConfig.api_token, profile.telefono, waMsg);
      log("WhatsApp notification", { sent, phone: profile.telefono });

      // Log to billing_notifications
      try {
        await supabase.from("billing_notifications").insert({
          customer_email: userData.user.email || "",
          customer_phone: profile.telefono.replace(/[\s\-\(\)]/g, ""),
          channel: "whatsapp",
          tipo: "factura_pendiente",
          mensaje: waMsg,
          monto_centavos: Math.round(total * 100),
          status: sent ? "sent" : "error",
        });
      } catch { /* silent */ }
    }

    // ─── Email notification ───
    if (userData.user.email) {
      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:24px 32px;">
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">💳 Factura pendiente de pago</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding-bottom:16px;font-size:16px;color:#111827;">
        Hola <strong>${profile.nombre || empresaNombre}</strong>,
      </td></tr>
      <tr><td style="padding-bottom:20px;font-size:14px;color:#374151;">
        Se ha generado una nueva factura para tu suscripci&oacute;n en Rutapp:
      </td></tr>
      <tr><td style="padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">Factura:</td>
              <td style="font-size:14px;font-weight:600;color:#111827;text-align:right;">${numFactura}</td></tr>
          <tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">Plan:</td>
              <td style="font-size:14px;font-weight:600;color:#111827;text-align:right;">${plan.nombre} &mdash; ${qty} usuarios</td></tr>
          <tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">Periodo:</td>
              <td style="font-size:14px;font-weight:600;color:#111827;text-align:right;">${periodoInicio} al ${periodoFin}</td></tr>
          ${esProrrateo ? `<tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">Prorrateo:</td>
              <td style="font-size:14px;font-weight:600;color:#f59e0b;text-align:right;">${diasRestantes} d&iacute;as</td></tr>` : ""}
          <tr><td style="font-size:13px;color:#6b7280;padding:8px 0 4px;border-top:1px solid #e5e7eb;">Total:</td>
              <td style="font-size:18px;font-weight:700;color:#111827;text-align:right;border-top:1px solid #e5e7eb;padding-top:8px;">$${total.toLocaleString()} MXN</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 0;font-size:13px;color:#f59e0b;font-weight:600;">
        ⏳ Fecha l&iacute;mite de pago: ${fechaLimite}
      </td></tr>
      <tr><td style="padding:16px 0;text-align:center;">
        <a href="${payLink}" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#ffffff;font-weight:600;font-size:16px;border-radius:8px;text-decoration:none;">Pagar ahora</a>
      </td></tr>
      <tr><td style="padding:8px 0;text-align:center;font-size:12px;color:#9ca3af;">
        Tambi&eacute;n puedes pagar desde la app &rarr; Mi Suscripci&oacute;n &rarr; Pagar
      </td></tr>
      <tr><td style="padding:24px 0 0;font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;margin-top:24px;">
        &iexcl;Gracias por confiar en Rutapp! 🚀<br>
        <span style="font-size:12px;">Este es un mensaje autom&aacute;tico, no responder.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

      // Send via billing-notify-email
      try {
        await supabase.functions.invoke("billing-notify-email", {
          body: {
            to: userData.user.email,
            empresa: empresaNombre,
            plan: `${plan.nombre} — ${qty} usuarios`,
            amount: total,
            url: payLink,
          },
        });
        log("Email notification sent", { email: userData.user.email });
      } catch (e) {
        log("Email notification error (non-blocking)", (e as Error).message);
      }

      // Log email notification
      try {
        await supabase.from("billing_notifications").insert({
          customer_email: userData.user.email,
          channel: "email",
          tipo: "factura_pendiente",
          mensaje: `Factura ${numFactura} — $${total} MXN — ${plan.nombre}`,
          monto_centavos: Math.round(total * 100),
          status: "sent",
        });
      } catch { /* silent */ }
    }

    return new Response(JSON.stringify({
      success: true,
      factura: {
        id: factura.id,
        numero: factura.numero_factura,
        total,
        subtotal,
        es_prorrateo: esProrrateo,
        dias_restantes: diasRestantes,
        dias_en_mes: diasEnMes,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        plan_nombre: plan.nombre,
        num_usuarios: qty,
        precio_unitario: precioUnitario,
      },
      checkout_url: stripeCheckoutUrl || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log("ERROR", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
