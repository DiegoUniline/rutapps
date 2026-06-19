// Cancela todas las facturas pendientes (locales y en Stripe) de una empresa.
// - Voids todas las invoices de Stripe en estado 'open' del customer
// - Borra invoices en 'draft'
// - Marca facturas locales con estado='pendiente' como 'cancelada'
// Restringido a super admins.
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
    const { empresa_id } = body as { empresa_id?: string };
    if (!empresa_id) throw new Error("Falta empresa_id");

    // 1) Obtener empresa + suscripción para localizar el customer de Stripe
    const { data: empresa, error: empErr } = await supabase
      .from("empresas")
      .select("id, nombre, email, email_facturacion")
      .eq("id", empresa_id)
      .maybeSingle();
    if (empErr || !empresa) throw new Error("Empresa no encontrada");

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("empresa_id", empresa_id);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Reunir customer ids (de subs y por email)
    const customerIds = new Set<string>();
    (subs || []).forEach((s: any) => { if (s.stripe_customer_id) customerIds.add(s.stripe_customer_id); });

    const emails = [empresa.email_facturacion, empresa.email].filter(Boolean) as string[];
    for (const em of emails) {
      try {
        const list = await stripe.customers.list({ email: em, limit: 5 });
        list.data.forEach(c => customerIds.add(c.id));
      } catch (_) { /* ignore */ }
    }

    const stripeResults: any[] = [];
    for (const cid of customerIds) {
      try {
        const invoices = await stripe.invoices.list({ customer: cid, limit: 100, status: "open" });
        for (const inv of invoices.data) {
          try {
            await stripe.invoices.voidInvoice(inv.id);
            stripeResults.push({ customer: cid, id: inv.id, number: inv.number, action: "voided" });
          } catch (e: any) {
            stripeResults.push({ customer: cid, id: inv.id, action: "error", error: e.message });
          }
        }
        const drafts = await stripe.invoices.list({ customer: cid, limit: 100, status: "draft" });
        for (const inv of drafts.data) {
          try {
            await stripe.invoices.del(inv.id);
            stripeResults.push({ customer: cid, id: inv.id, action: "deleted" });
          } catch (e: any) {
            stripeResults.push({ customer: cid, id: inv.id, action: "error", error: e.message });
          }
        }
      } catch (e: any) {
        stripeResults.push({ customer: cid, action: "list_error", error: e.message });
      }
    }

    // 2) Cancelar facturas locales pendientes
    const { data: pendientes } = await supabase
      .from("facturas")
      .select("id, numero_factura, total")
      .eq("empresa_id", empresa_id)
      .eq("estado", "pendiente");

    const ids = (pendientes || []).map((f: any) => f.id);
    let cancelledCount = 0;
    if (ids.length) {
      const { error: updErr, count } = await supabase
        .from("facturas")
        .update({ estado: "cancelada" }, { count: "exact" })
        .in("id", ids);
      if (updErr) throw new Error("Error cancelando facturas locales: " + updErr.message);
      cancelledCount = count ?? ids.length;
    }

    console.log("[admin-cancel-empresa-pending]", {
      empresa_id, empresa: empresa.nombre,
      customers: [...customerIds], stripeResults, cancelledCount,
    });

    return new Response(JSON.stringify({
      empresa: empresa.nombre,
      customers: [...customerIds],
      stripe: stripeResults,
      facturas_canceladas: cancelledCount,
      facturas_ids: ids,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[admin-cancel-empresa-pending] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
