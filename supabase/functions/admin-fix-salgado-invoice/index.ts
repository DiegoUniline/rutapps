// One-shot admin function: voids the wrong $1,470 invoice for Salgado
// and creates a clean $900 invoice in its place.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPER_ADMIN_EMAIL = "diego.leon@uniline.mx";
const WRONG_INVOICE = "in_1TS6ICCUpJnsv7ilD6Dn1aJM";
const CUSTOMER = "cus_UN4lcSwdjlMTOv";
const PRICE = "price_1TBGvcCUpJnsv7il0KmvUTCj"; // $300 MXN/mes
const QUANTITY = 3;
const SUBSCRIPTION = "sub_1TOKddCUpJnsv7ilfVcpTwMX";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // One-shot token (function will be deleted right after use)
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (token !== "fix-salgado-2026-05-01-onetime") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

    // 1. Void the wrong invoice (skip if already voided)
    let voided: any = { id: WRONG_INVOICE, status: "already_void" };
    try {
      voided = await stripe.invoices.voidInvoice(WRONG_INVOICE);
    } catch (e: any) {
      console.log("[skip void]", e.message);
    }

    // 2. Create a fresh draft invoice (manual, NOT tied to subscription cycle so it doesn't pull prorations)
    const newInvoice = await stripe.invoices.create({
      customer: CUSTOMER,
      collection_method: "send_invoice",
      days_until_due: 7,
      auto_advance: false,
      description: "Plan Mensual Rutapp — Mayo 2026 (3 usuarios)",
      metadata: { reason: "manual_replacement_for_voided", original_invoice: WRONG_INVOICE },
    });

    // 3. Add the line item: 3 × $300 = $900 MXN
    await stripe.invoiceItems.create({
      customer: CUSTOMER,
      invoice: newInvoice.id,
      pricing: { price: PRICE },
      quantity: QUANTITY,
    } as any);

    // 4. Finalize it so it gets a hosted_invoice_url
    const finalized = await stripe.invoices.finalizeInvoice(newInvoice.id!, { auto_advance: false });

    return new Response(JSON.stringify({
      success: true,
      voided_invoice: voided.id,
      voided_status: voided.status,
      new_invoice: finalized.id,
      new_invoice_total: (finalized.total || 0) / 100,
      new_invoice_status: finalized.status,
      hosted_invoice_url: finalized.hosted_invoice_url,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[FIX-SALGADO]", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
