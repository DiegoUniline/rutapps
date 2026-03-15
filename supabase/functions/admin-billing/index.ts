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

    // ─── Create invoice manually ───
    if (action === "create_invoice") {
      const { email, amount, description, days_until_due } = body;
      if (!email || !amount) throw new Error("email y amount requeridos");

      // Find or create customer
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

      // Send invoice email automatically via Stripe
      await stripe.invoices.sendInvoice(invoice.id);

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: finalizedInv.hosted_invoice_url,
        status: finalizedInv.status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Send invoice notification via WhatsApp or email ───
    if (action === "send_invoice_notification") {
      const { channel, customer_email, amount, hosted_url, description, invoice_id } = body;

      if (channel === "whatsapp") {
        // Find phone from profiles matching email
        const { data: userData } = await supabase.auth.admin.listUsers();
        const matchUser = userData?.users?.find((u: any) => u.email === customer_email);
        if (!matchUser) throw new Error("Usuario no encontrado con ese email");

        const { data: profile } = await supabase
          .from("profiles")
          .select("telefono, empresa_id")
          .eq("user_id", matchUser.id)
          .maybeSingle();
        if (!profile?.telefono) throw new Error("El cliente no tiene teléfono registrado");

        // Get admin whatsapp token from the config
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .eq("empresa_id", profile.empresa_id)
          .maybeSingle();

        // Fallback: try super admin's stored token
        const waToken = waConfig?.api_token || Deno.env.get("ADMIN_WHATSAPP_TOKEN");
        if (!waToken) throw new Error("Token de WhatsApp no configurado");

        const amountFmt = `$${(amount / 100).toLocaleString("es-MX")} MXN`;
        const msg = `📋 *Factura Rutapp*\n\n${description || "Suscripción Rutapp"}\nMonto: ${amountFmt}\n\n💳 Paga aquí:\n${hosted_url}\n\nGracias por tu preferencia 🙌`;

        const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
        const apiRes = await fetch(WHATSAPI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-token": waToken },
          body: JSON.stringify({ action: "send-text", phone, message: msg }),
        });
        if (!apiRes.ok) throw new Error("Error enviando WhatsApp");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (channel === "email") {
        // Use Stripe to send the invoice
        if (invoice_id) {
          await stripe.invoices.sendInvoice(invoice_id);
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Channel no válido");
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
