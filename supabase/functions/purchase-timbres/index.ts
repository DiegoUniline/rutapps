import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMBRES_PRICE_ID = "price_1TC26BCUpJnsv7il1AVjgBAJ";
const TIMBRES_PER_UNIT = 100;

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No autenticado");

    const { action, quantity, session_id } = await req.json();

    // Get user's empresa
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (action === "create_checkout") {
      // quantity = number of 100-timbre packs (1, 2, 3...)
      const qty = parseInt(quantity);
      if (!qty || qty < 1) throw new Error("Mínimo 1 paquete (100 timbres)");

      // Find or create Stripe customer
      const email = userData.user.email!;
      const customers = await stripe.customers.list({ email, limit: 1 });
      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email,
          metadata: { empresa_id: profile.empresa_id },
        });
        customerId = newCustomer.id;
      }

      const origin = req.headers.get("origin") || "https://rutapps.lovable.app";

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: TIMBRES_PRICE_ID, quantity: qty }],
        mode: "payment",
        metadata: {
          empresa_id: profile.empresa_id,
          user_id: userData.user.id,
          timbres: String(qty * TIMBRES_PER_UNIT),
          type: "timbres_purchase",
        },
        success_url: `${origin}/configuracion?timbres_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/configuracion?timbres=cancelled`,
      });

      return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_payment") {
      if (!session_id) throw new Error("session_id requerido");

      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== "paid") {
        return new Response(JSON.stringify({ success: false, status: session.payment_status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta = session.metadata || {};
      if (meta.type !== "timbres_purchase") throw new Error("Sesión inválida");
      if (meta.credited === "true") {
        return new Response(JSON.stringify({ success: true, already_credited: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const timbres = parseInt(meta.timbres || "0");
      const empresaId = meta.empresa_id;
      if (!timbres || !empresaId) throw new Error("Metadata incompleta");

      // Credit timbres
      const { data: newBalance } = await supabase.rpc("add_timbres", {
        p_empresa_id: empresaId,
        p_cantidad: timbres,
        p_user_id: userData.user.id,
        p_notas: `Compra self-service: ${timbres} timbres (Stripe session ${session_id})`,
      });

      // Mark session as credited to prevent double-credit
      await stripe.checkout.sessions.update(session_id, {
        metadata: { ...meta, credited: "true" },
      });

      return new Response(JSON.stringify({ success: true, timbres_added: timbres, new_balance: newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Acción no válida");
  } catch (error) {
    console.error("Error purchase-timbres:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
