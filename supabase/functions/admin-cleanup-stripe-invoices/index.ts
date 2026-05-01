// One-shot admin tool: cleans up orphan Stripe invoices for a customer.
// - Voids any 'open' invoice with billing_reason = 'manual'
// - Deletes any 'draft' invoice
// Restricted to super admins.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    const { data: isSuperData } = await supabase.rpc("is_super_admin", { p_user_id: userData.user.id });
    if (!isSuperData) throw new Error("Solo super admin");

    const body = await req.json().catch(() => ({}));
    const { customer_id, customer_email } = body as { customer_id?: string; customer_email?: string };
    if (!customer_id && !customer_email) throw new Error("Falta customer_id o customer_email");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let cid = customer_id;
    if (!cid && customer_email) {
      const list = await stripe.customers.list({ email: customer_email, limit: 1 });
      if (list.data.length === 0) throw new Error("Customer no encontrado");
      cid = list.data[0].id;
    }

    const invoices = await stripe.invoices.list({ customer: cid!, limit: 100 });
    const results: any[] = [];

    for (const inv of invoices.data) {
      try {
        if (inv.status === "draft") {
          await stripe.invoices.del(inv.id);
          results.push({ id: inv.id, action: "deleted" });
        } else if (inv.status === "open" && inv.billing_reason === "manual") {
          await stripe.invoices.voidInvoice(inv.id);
          results.push({ id: inv.id, action: "voided", number: inv.number });
        } else {
          results.push({ id: inv.id, action: "skipped", status: inv.status, reason: inv.billing_reason });
        }
      } catch (e: any) {
        results.push({ id: inv.id, action: "error", error: e.message });
      }
    }

    console.log("[admin-cleanup-stripe-invoices]", { customer: cid, results });

    return new Response(JSON.stringify({ customer: cid, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[admin-cleanup-stripe-invoices] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
