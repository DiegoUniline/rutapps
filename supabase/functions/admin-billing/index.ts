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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (action === "list_all_invoices") {
      // Get all Stripe customers and their invoices
      const invoices = await stripe.invoices.list({ limit: 100 });
      const mapped = invoices.data.map((inv) => ({
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
      const customers = await stripe.customers.list({ limit: 100 });
      const mapped = customers.data.map((c) => ({
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
      const mapped = subs.data.map((s) => ({
        id: s.id,
        status: s.status,
        customer: s.customer,
        current_period_end: s.current_period_end,
        quantity: s.items.data[0]?.quantity || 0,
        plan_amount: s.items.data[0]?.price?.unit_amount || 0,
        product_id: s.items.data[0]?.price?.product || null,
      }));
      return new Response(JSON.stringify({ subscriptions: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "dashboard_stats") {
      const [balance, invoicesList, subsList, customersList] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.invoices.list({ limit: 100 }),
        stripe.subscriptions.list({ limit: 100, status: "all" }),
        stripe.customers.list({ limit: 100 }),
      ]);

      const mxnBalance = balance.available.find(b => b.currency === "mxn")?.amount || 0;
      const pendingMxn = balance.pending.find(b => b.currency === "mxn")?.amount || 0;

      const totalInvoiced = invoicesList.data.reduce((sum, inv) => sum + inv.amount_due, 0);
      const totalPaid = invoicesList.data.filter(i => i.status === "paid").reduce((sum, inv) => sum + inv.amount_paid, 0);
      const totalOpen = invoicesList.data.filter(i => i.status === "open").reduce((sum, inv) => sum + inv.amount_due, 0);

      const activeSubs = subsList.data.filter(s => s.status === "active" || s.status === "trialing").length;
      const mrr = subsList.data
        .filter(s => s.status === "active")
        .reduce((sum, s) => sum + (s.items.data[0]?.price?.unit_amount || 0) * (s.items.data[0]?.quantity || 1), 0);

      return new Response(JSON.stringify({
        balance_available: mxnBalance,
        balance_pending: pendingMxn,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        total_open: totalOpen,
        active_subscriptions: activeSubs,
        total_customers: customersList.data.length,
        mrr,
      }), {
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
