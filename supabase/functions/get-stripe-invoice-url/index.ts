import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let invoiceId = url.searchParams.get("id");
    if (!invoiceId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      invoiceId = body?.invoice_id || body?.id || null;
    }
    if (!invoiceId || !/^in_[A-Za-z0-9]+$/.test(invoiceId)) {
      return new Response(JSON.stringify({ error: "invalid_invoice_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const invoice = await stripe.invoices.retrieve(invoiceId);

    return new Response(JSON.stringify({
      hosted_invoice_url: invoice.hosted_invoice_url,
      status: invoice.status,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      customer_email: invoice.customer_email,
      number: invoice.number,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
