import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PACK_PRICE_ID = "price_1TONQcCUpJnsv7ilMctYmz0H"; // Pack 100 Optimizaciones - $149 MXN
const PACK_CREDITS = 100;
const PACK_AMOUNT_CENTS = 14900;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY no configurada");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email;

    const { data: profile } = await supabase
      .from("profiles").select("empresa_id").eq("user_id", userId).single();
    if (!profile?.empresa_id) {
      return new Response(JSON.stringify({ error: "Perfil no encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Permisos: solo administradores pueden comprar
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role_id, roles(nombre, es_sistema)")
      .eq("user_id", userId);
    const isAdmin = userRoles?.some((ur: any) => {
      const roleName = (ur.roles?.nombre ?? "").toLowerCase();
      return ur.roles?.es_sistema === true || roleName.includes("admin");
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo administradores pueden comprar recargas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Reusar customer si existe
    let customerId: string | undefined;
    if (userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://rutapp.mx";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [{ price: PACK_PRICE_ID, quantity: 1 }],
      mode: "payment",
      success_url: `${origin}/ventas/mapa-clientes?recarga=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/ventas/mapa-clientes?recarga=cancel`,
      metadata: {
        empresa_id: profile.empresa_id,
        user_id: userId,
        tipo: "route_credits_pack_100",
      },
    });

    // Registrar la compra como pendiente
    const serviceSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceSupabase.from("optimizacion_recargas").insert({
      empresa_id: profile.empresa_id,
      user_id: userId,
      stripe_session_id: session.id,
      cantidad_creditos: PACK_CREDITS,
      monto_centavos: PACK_AMOUNT_CENTS,
      moneda: "mxn",
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("purchase-route-credits error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
