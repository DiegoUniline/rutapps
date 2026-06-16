// Public redirect: rutapp.mx/factura/:folio → Stripe hosted invoice URL.
// Looks up a Stripe invoice by its number and 302-redirects to hosted_invoice_url.
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const folio = (url.searchParams.get("folio") || url.pathname.split("/").pop() || "").trim();
    if (!folio) return new Response("Falta folio", { status: 400, headers: corsHeaders });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return new Response("Stripe no configurado", { status: 500, headers: corsHeaders });
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Try by invoice number (e.g. "RUT-0001")
    let hosted: string | null = null;
    try {
      const search = await stripe.invoices.search({
        query: `number:"${folio.replace(/"/g, '')}"`,
        limit: 1,
      });
      hosted = search.data[0]?.hosted_invoice_url ?? null;
    } catch (_) { /* search not enabled, fallback below */ }

    // Fallback: treat folio as invoice id
    if (!hosted && folio.startsWith("in_")) {
      try {
        const inv = await stripe.invoices.retrieve(folio);
        hosted = inv.hosted_invoice_url ?? null;
      } catch { /* ignore */ }
    }

    if (!hosted) {
      return new Response(
        `<html><body style="font-family:Arial;text-align:center;padding:40px"><h2>Factura no encontrada</h2><p>Folio: ${folio}</p></body></html>`,
        { status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: hosted, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
