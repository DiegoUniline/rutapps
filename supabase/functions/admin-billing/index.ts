import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// RutApp Stripe product IDs
const RUTAPP_PRODUCT_IDS = new Set([
  "prod_U9a56wjBGbKv4B", // Mensual
  "prod_U9a6TsdjaGp99L", // Semestral
  "prod_U9a7Ap6nbM6kPV", // Anual
]);

function getProductId(product: unknown): string | null {
  if (!product) return null;
  if (typeof product === "string") return product;
  if (typeof product === "object" && product !== null && "id" in product) {
    const id = (product as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function isRutappSubscription(sub: any): boolean {
  return (sub?.items?.data || []).some((item: any) => {
    const productId = getProductId(item?.price?.product);
    return productId ? RUTAPP_PRODUCT_IDS.has(productId) : false;
  });
}

function isRutappInvoice(inv: any): boolean {
  if (!inv?.lines?.data?.length) return false;
  return inv.lines.data.some((line: any) => {
    const productId = getProductId(line?.price?.product);
    return productId ? RUTAPP_PRODUCT_IDS.has(productId) : false;
  });
}

function getCustomerId(customer: unknown): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && customer !== null && "id" in customer) {
    const id = (customer as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

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

    // Verify super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No autenticado");

    const { data: sa } = await supabase
      .from("super_admins")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!sa) throw new Error("No autorizado — solo super admin");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (action === "list_all_invoices") {
      const invoices = await stripe.invoices.list({
        limit: 100,
        expand: ["data.lines.data.price"],
      });

      const rutappInvoices = invoices.data.filter(isRutappInvoice);
      const mapped = rutappInvoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount_due: inv.amount_due,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        due_date: inv.due_date,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        customer_email: inv.customer_email,
        description: inv.lines?.data?.[0]?.description || "Suscripción Rutapp",
      }));

      return new Response(JSON.stringify({ invoices: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_customers") {
      const [subsList, invoicesList] = await Promise.all([
        stripe.subscriptions.list({ limit: 100, status: "all" }),
        stripe.invoices.list({ limit: 100, expand: ["data.lines.data.price"] }),
      ]);

      const customerIds = new Set<string>();
      subsList.data.filter(isRutappSubscription).forEach((sub) => {
        const customerId = getCustomerId(sub.customer);
        if (customerId) customerIds.add(customerId);
      });
      invoicesList.data.filter(isRutappInvoice).forEach((inv) => {
        const customerId = getCustomerId(inv.customer);
        if (customerId) customerIds.add(customerId);
      });

      const customerRecords = await Promise.all(
        [...customerIds].slice(0, 100).map((id) => stripe.customers.retrieve(id))
      );

      const mapped = customerRecords
        .filter((c: any) => !c?.deleted)
        .map((c: any) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          created: c.created,
        }));

      return new Response(JSON.stringify({ customers: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_subscriptions") {
      const subs = await stripe.subscriptions.list({ limit: 100, status: "all" });
      const rutappSubs = subs.data.filter(isRutappSubscription);

      const mapped = rutappSubs.map((s) => {
        const firstRutappItem = s.items.data.find((item) => {
          const productId = getProductId(item.price?.product);
          return productId ? RUTAPP_PRODUCT_IDS.has(productId) : false;
        });

        return {
          id: s.id,
          status: s.status,
          customer: s.customer,
          current_period_end: s.current_period_end,
          quantity: firstRutappItem?.quantity || 0,
          plan_amount: firstRutappItem?.price?.unit_amount || 0,
          product_id: firstRutappItem?.price?.product || null,
        };
      });

      return new Response(JSON.stringify({ subscriptions: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "dashboard_stats") {
      const [balance, invoicesList, subsList] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.invoices.list({ limit: 100, expand: ["data.lines.data.price"] }),
        stripe.subscriptions.list({ limit: 100, status: "all" }),
      ]);

      const rutappInvoices = invoicesList.data.filter(isRutappInvoice);
      const rutappSubs = subsList.data.filter(isRutappSubscription);

      const mxnBalance = balance.available.find((b) => b.currency === "mxn")?.amount || 0;
      const pendingMxn = balance.pending.find((b) => b.currency === "mxn")?.amount || 0;

      const totalInvoiced = rutappInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);
      const totalPaid = rutappInvoices
        .filter((i) => i.status === "paid")
        .reduce((sum, inv) => sum + inv.amount_paid, 0);
      const totalOpen = rutappInvoices
        .filter((i) => i.status === "open")
        .reduce((sum, inv) => sum + inv.amount_due, 0);

      const activeSubs = rutappSubs.filter(
        (s) => s.status === "active" || s.status === "trialing"
      ).length;

      const mrr = rutappSubs
        .filter((s) => s.status === "active")
        .reduce((sum, s) => {
          const rutappItemsTotal = s.items.data.reduce((itemSum, item) => {
            const productId = getProductId(item.price?.product);
            if (!productId || !RUTAPP_PRODUCT_IDS.has(productId)) return itemSum;
            return itemSum + (item.price?.unit_amount || 0) * (item.quantity || 1);
          }, 0);
          return sum + rutappItemsTotal;
        }, 0);

      const customerIds = new Set<string>();
      rutappSubs.forEach((sub) => {
        const customerId = getCustomerId(sub.customer);
        if (customerId) customerIds.add(customerId);
      });
      rutappInvoices.forEach((inv) => {
        const customerId = getCustomerId(inv.customer);
        if (customerId) customerIds.add(customerId);
      });

      return new Response(
        JSON.stringify({
          balance_available: mxnBalance,
          balance_pending: pendingMxn,
          total_invoiced: totalInvoiced,
          total_paid: totalPaid,
          total_open: totalOpen,
          active_subscriptions: activeSubs,
          total_customers: customerIds.size,
          mrr,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Create invoice manually (legacy) ───
    if (action === "create_invoice") {
      const { email, amount, description, days_until_due } = body;
      if (!email || !amount) throw new Error("email y amount requeridos");

      const customers = await stripe.customers.list({ email, limit: 1 });
      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const c = await stripe.customers.create({ email });
        customerId = c.id;
      }

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: days_until_due || 1,
        auto_advance: true,
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount,
        currency: "mxn",
        description: description || "Suscripción Rutapp",
      });

      const finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.sendInvoice(invoice.id);

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: finalizedInv.hosted_invoice_url,
        status: finalizedInv.status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Create professional invoice with empresa, plan, users ───
    if (action === "create_pro_invoice") {
      const {
        empresa_id, empresa_nombre, empresa_email, empresa_telefono, empresa_rfc,
        items, concepto, days_until_due, plan_nombre, num_usuarios, timbres,
        descuento_plan_pct, descuento_extra_pct, total_centavos, mensaje_personal,
        enviar_email, enviar_whatsapp, telefono_envio, correo_envio,
      } = body;

      if (!empresa_id) throw new Error("empresa_id requerido");

      // Get empresa profile email from profiles
      let clientEmail = empresa_email;
      if (!clientEmail) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("empresa_id", empresa_id)
          .limit(1)
          .maybeSingle();
        if (profileData) {
          const { data: userData } = await supabase.auth.admin.getUserById(profileData.user_id);
          clientEmail = userData?.user?.email || null;
        }
      }
      if (!clientEmail) throw new Error("No se encontró email para esta empresa");

      // Find or create Stripe customer
      const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const c = await stripe.customers.create({
          email: clientEmail,
          name: empresa_nombre,
          phone: empresa_telefono || undefined,
          metadata: { empresa_id, rfc: empresa_rfc || "" },
        });
        customerId = c.id;
      }

      // Create invoice in Stripe
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: days_until_due || 3,
        auto_advance: true,
        metadata: { empresa_id, plan: plan_nombre, usuarios: String(num_usuarios) },
      });

      // Add line items
      for (const item of (items || [])) {
        if (item.amount === 0) continue;
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount: item.amount,
          currency: "mxn",
          description: item.description,
        });
      }

      const finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);

      // Build professional email HTML
      const primaryColor = "#6461E8";
      const folio = finalizedInv.number || finalizedInv.id.slice(-8).toUpperCase();
      const fechaLarga = new Date().toLocaleDateString("es-MX", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      const totalFmt = `$${(total_centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`;
      const vigencia = days_until_due || 3;
      const payUrl = finalizedInv.hosted_invoice_url || "";

      function adjustColor(hex: string, amount: number) {
        const num = parseInt(hex.replace("#", ""), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
      }

      const itemsHtml = (items || [])
        .filter((i: any) => i.amount !== 0)
        .map((i: any) => {
          const isNeg = i.amount < 0;
          const amt = Math.abs(i.amount / 100);
          return `<tr>
            <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${i.description}</td>
            <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;color:${isNeg ? '#16a34a' : '#333'};font-weight:600;">
              ${isNeg ? '-' : ''}$${amt.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </td>
          </tr>`;
        }).join("");

      const emailHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Factura Rutapp</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,'Helvetica Neue',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;">

<!-- Header gradient -->
<tr><td style="background:linear-gradient(135deg,${primaryColor},${adjustColor(primaryColor, -40)});padding:32px 40px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="color:#fff;"><span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;">Rutapp</span><br><span style="font-size:12px;opacity:0.85;">Sistema de Gestión de Rutas</span></td>
<td align="right" style="color:#fff;"><span style="font-size:28px;font-weight:700;letter-spacing:1px;">FACTURA</span><br><span style="font-size:12px;opacity:0.85;">${folio}</span></td>
</tr></table>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px;">

<!-- Greeting -->
<p style="color:#888;font-size:13px;margin:0 0 4px;">Estimado(a)</p>
<p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 16px;">${empresa_nombre}</p>
<div style="height:3px;background:linear-gradient(90deg,${primaryColor},transparent);border-radius:2px;margin-bottom:24px;"></div>

<!-- Intro text -->
<p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">
Hemos generado su factura por la <strong>suscripción ${plan_nombre}</strong> de Rutapp para <strong>${num_usuarios} usuario${num_usuarios > 1 ? 's' : ''}</strong>${timbres > 0 ? ` con <strong>${timbres} timbres CFDI</strong>` : ''}.
</p>

<!-- Info cards -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td width="48%" style="background:#f8f9fc;border:1px solid #e8e8e8;border-radius:8px;padding:16px;">
<span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Folio</span><br>
<span style="font-size:18px;font-weight:700;color:${primaryColor};">${folio}</span>
</td>
<td width="4%"></td>
<td width="48%" style="background:#f8f9fc;border:1px solid #e8e8e8;border-radius:8px;padding:16px;">
<span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Fecha</span><br>
<span style="font-size:14px;font-weight:600;color:#333;">${fechaLarga}</span>
</td>
</tr></table>

<!-- Vigencia warning -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 16px;">
<span style="font-size:13px;color:#856404;">⏰ Esta factura tiene una vigencia de <strong>${vigencia} día${vigencia > 1 ? 's' : ''}</strong>. Por favor realice su pago antes del vencimiento.</span>
</td>
</tr></table>

${mensaje_personal ? `
<!-- Personal message -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td style="background:#f8f9fc;border-left:4px solid ${primaryColor};border-radius:0 8px 8px 0;padding:16px 20px;">
<span style="font-size:13px;color:#555;line-height:1.6;">${mensaje_personal}</span>
</td>
</tr></table>` : ''}

<!-- Items table -->
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:24px;">
<tr style="background:${primaryColor};">
<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Concepto</td>
<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#fff;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Monto</td>
</tr>
${itemsHtml}
</table>

<!-- Total box -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr>
<td align="right">
<table cellpadding="0" cellspacing="0" style="border:2px solid ${primaryColor};border-radius:8px;overflow:hidden;">
<tr><td style="padding:16px 32px;text-align:right;">
<span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Total a pagar</span><br>
<span style="font-size:28px;font-weight:800;color:${primaryColor};">${totalFmt}</span>
</td></tr>
</table>
</td>
</tr></table>

<!-- CTA Button -->
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="center" style="padding-bottom:32px;">
<a href="${payUrl}" target="_blank" style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
💳 Pagar ahora
</a>
</td>
</tr></table>

<!-- Atendido por -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td align="center" style="background:#f8f9fc;border-radius:8px;padding:16px;">
<span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Atendido por</span><br>
<span style="font-size:14px;font-weight:600;color:#333;">Diego León — Rutapp</span>
</td>
</tr></table>

<!-- PDF note -->
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="background:#e8f5e9;border-radius:8px;padding:12px 16px;">
<span style="font-size:12px;color:#2e7d32;">📎 Puede descargar su factura en PDF desde el enlace de pago.</span>
</td>
</tr></table>

</td></tr>

<!-- Footer -->
<tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8e8;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:12px;color:#888;line-height:1.6;">
🌐 <a href="https://rutapps.lovable.app" style="color:${primaryColor};text-decoration:none;">rutapps.lovable.app</a><br>
📧 soporte@rutapp.mx<br>
📱 +52 (xxx) xxx-xxxx
</td>
<td align="right" style="font-size:12px;color:#aaa;">
<strong style="color:#666;">Rutapp</strong><br>
Sistema de Gestión de Rutas<br>
© ${new Date().getFullYear()}
</td>
</tr></table>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

      // Send via channels based on frontend flags
      const sendResults: { email?: boolean; whatsapp?: boolean } = {};

      // EMAIL
      if (enviar_email !== false) {
        try {
          await stripe.invoices.sendInvoice(invoice.id);
          sendResults.email = true;
        } catch (_) { sendResults.email = false; }

        await supabase.from("billing_notifications").insert({
          customer_email: correo_envio || clientEmail,
          channel: "email",
          tipo: "factura",
          mensaje: `Factura ${folio} - ${concepto}`,
          stripe_invoice_id: finalizedInv.id,
          stripe_invoice_url: payUrl,
          monto_centavos: total_centavos,
          status: "sent",
        });
      }

      // WHATSAPP
      if (enviar_whatsapp && telefono_envio) {
        const phone = telefono_envio.replace(/[\s\-\(\)]/g, "");
        const waMsg = `📋 *Factura Rutapp — ${folio}*\n\nHola *${empresa_nombre}* 👋\n\nSe ha generado tu factura:\n\n📦 *Plan:* ${plan_nombre}\n👥 *Usuarios:* ${num_usuarios}${timbres > 0 ? `\n🔖 *Timbres:* ${timbres}` : ''}${descuento_plan_pct > 0 ? `\n💚 *Descuento plan:* ${descuento_plan_pct}%` : ''}${descuento_extra_pct > 0 ? `\n🎁 *Descuento extra:* ${descuento_extra_pct}%` : ''}\n\n💰 *Total: ${totalFmt}*\n\n💳 *Paga aquí:*\n${payUrl}\n\n⏰ Vigencia: ${vigencia} días\n\nGracias por confiar en Rutapp 🚀`;

        // Get any available WA token
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const waToken = waConfig?.api_token;
        if (waToken) {
          try {
            const waRes = await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": waToken },
              body: JSON.stringify({ action: "send-text", phone, message: waMsg }),
            });
            sendResults.whatsapp = waRes.ok;

            await supabase.from("billing_notifications").insert({
              customer_email: correo_envio || clientEmail,
              customer_phone: phone,
              channel: "whatsapp",
              tipo: "factura",
              mensaje: waMsg,
              stripe_invoice_id: finalizedInv.id,
              stripe_invoice_url: payUrl,
              monto_centavos: total_centavos,
              status: waRes.ok ? "sent" : "error",
            });
          } catch (_) { sendResults.whatsapp = false; }
        }
      }

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: payUrl,
        status: finalizedInv.status,
        folio,
        email_sent: sendResults.email ?? false,
        whatsapp_sent: sendResults.whatsapp ?? false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Send invoice notification via WhatsApp or email ───
    if (action === "send_invoice_notification") {
      const { channel, customer_email, amount, hosted_url, description, invoice_id } = body;

      let notifStatus = "sent";
      let errorDetalle: string | null = null;
      let mensaje = "";

      if (channel === "whatsapp") {
        const { data: allUsersData } = await supabase.auth.admin.listUsers();
        const matchUser = allUsersData?.users?.find((u: any) => u.email === customer_email);
        if (!matchUser) throw new Error("Usuario no encontrado con ese email");

        const { data: profile } = await supabase
          .from("profiles")
          .select("telefono, empresa_id")
          .eq("user_id", matchUser.id)
          .maybeSingle();
        if (!profile?.telefono) throw new Error("El cliente no tiene teléfono registrado");

        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .eq("empresa_id", profile.empresa_id)
          .maybeSingle();

        const waToken = waConfig?.api_token || Deno.env.get("ADMIN_WHATSAPP_TOKEN");
        if (!waToken) throw new Error("Token de WhatsApp no configurado");

        const amountFmt = `$${(amount / 100).toLocaleString("es-MX")} MXN`;
        mensaje = `📋 *Factura Rutapp*\n\n${description || "Suscripción Rutapp"}\nMonto: ${amountFmt}\n\n💳 Paga aquí:\n${hosted_url}\n\nGracias por tu preferencia 🙌`;

        const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
        try {
          const apiRes = await fetch(WHATSAPI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-token": waToken },
            body: JSON.stringify({ action: "send-text", phone, message: mensaje }),
          });
          if (!apiRes.ok) {
            notifStatus = "error";
            errorDetalle = `HTTP ${apiRes.status}`;
          }
        } catch (e: any) {
          notifStatus = "error";
          errorDetalle = e.message;
        }

        // Log notification
        await supabase.from("billing_notifications").insert({
          customer_email,
          customer_phone: phone,
          channel: "whatsapp",
          tipo: "factura",
          mensaje,
          stripe_invoice_id: invoice_id || null,
          stripe_invoice_url: hosted_url || null,
          monto_centavos: amount || 0,
          status: notifStatus,
          error_detalle: errorDetalle,
        });

        if (notifStatus === "error") throw new Error(errorDetalle || "Error enviando WhatsApp");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (channel === "email") {
        if (invoice_id) {
          try {
            await stripe.invoices.sendInvoice(invoice_id);
          } catch (e: any) {
            notifStatus = "error";
            errorDetalle = e.message;
          }
        }
        mensaje = `Factura enviada por correo a ${customer_email}`;

        await supabase.from("billing_notifications").insert({
          customer_email,
          channel: "email",
          tipo: "factura",
          mensaje,
          stripe_invoice_id: invoice_id || null,
          stripe_invoice_url: hosted_url || null,
          monto_centavos: amount || 0,
          status: notifStatus,
          error_detalle: errorDetalle,
        });

        if (notifStatus === "error") throw new Error(errorDetalle || "Error enviando email");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Channel no válido");
    }

    // ─── Resend a notification ───
    if (action === "resend_notification") {
      const { channel, customer_email, customer_phone, mensaje, stripe_invoice_id, stripe_invoice_url, monto_centavos, tipo } = body;

      let notifStatus = "sent";
      let errorDetalle: string | null = null;

      if (channel === "whatsapp") {
        if (!customer_phone) throw new Error("Sin teléfono para reenviar");

        // Get whatsapp token
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const waToken = waConfig?.api_token;
        if (!waToken) throw new Error("Token de WhatsApp no configurado");

        try {
          const apiRes = await fetch(WHATSAPI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-token": waToken },
            body: JSON.stringify({ action: "send-text", phone: customer_phone, message: mensaje }),
          });
          if (!apiRes.ok) {
            notifStatus = "error";
            errorDetalle = `HTTP ${apiRes.status}`;
          }
        } catch (e: any) {
          notifStatus = "error";
          errorDetalle = e.message;
        }
      } else if (channel === "email") {
        if (stripe_invoice_id) {
          try {
            await stripe.invoices.sendInvoice(stripe_invoice_id);
          } catch (e: any) {
            notifStatus = "error";
            errorDetalle = e.message;
          }
        } else {
          notifStatus = "error";
          errorDetalle = "Sin invoice_id para reenviar por email";
        }
      }

      // Log the resend
      await supabase.from("billing_notifications").insert({
        customer_email,
        customer_phone: customer_phone || null,
        channel,
        tipo: tipo || "recordatorio",
        mensaje: mensaje || null,
        stripe_invoice_id: stripe_invoice_id || null,
        stripe_invoice_url: stripe_invoice_url || null,
        monto_centavos: monto_centavos || 0,
        status: notifStatus,
        error_detalle: errorDetalle,
      });

      if (notifStatus === "error") throw new Error(errorDetalle || "Error al reenviar");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Save WhatsApp token ───
    if (action === "save_whatsapp_token") {
      const { token: waToken } = body;
      if (!waToken) throw new Error("Token requerido");

      // Store in admin_settings table (we'll create it if needed)
      // For now, store as an env var reference via a simple approach:
      // Save to the first whatsapp_config entry or create one
      const { data: existingConfigs } = await supabase
        .from("whatsapp_config")
        .select("id, empresa_id")
        .order("created_at", { ascending: true })
        .limit(1);

      if (existingConfigs && existingConfigs.length > 0) {
        await supabase
          .from("whatsapp_config")
          .update({ api_token: waToken, activo: true })
          .eq("id", existingConfigs[0].id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Test WhatsApp ───
    if (action === "test_whatsapp") {
      const { phone } = body;
      if (!phone) throw new Error("phone requerido");

      const { data: waConfig } = await supabase
        .from("whatsapp_config")
        .select("api_token")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      const waToken = waConfig?.api_token;
      if (!waToken) throw new Error("Token de WhatsApp no configurado");

      const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
      const msg = "✅ *Prueba de Rutapp*\n\nEste es un mensaje de prueba del sistema de notificaciones de cobro de Rutapp.\n\n¡Todo funciona correctamente! 🎉";

      const apiRes = await fetch(WHATSAPI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-token": waToken },
        body: JSON.stringify({ action: "send-text", phone: cleanPhone, message: msg }),
      });
      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`Error WhatsAPI: ${errText}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Acción no válida");
  } catch (error) {
    console.error("Error admin-billing:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
