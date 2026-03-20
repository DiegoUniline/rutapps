import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SANDBOX_API = "https://sandbox-api.openpay.mx/v1";

function getConfig() {
  const merchantId = Deno.env.get("OPENPAY_MERCHANT_ID");
  const privateKey = Deno.env.get("OPENPAY_PRIVATE_KEY");
  if (!merchantId || !privateKey) throw new Error("OpenPay credentials not configured");
  return { merchantId, privateKey };
}

function authHeader(privateKey: string) {
  return "Basic " + btoa(privateKey + ":");
}

async function openpayRequest(method: string, path: string, body?: any) {
  const { merchantId, privateKey } = getConfig();
  const url = `${SANDBOX_API}/${merchantId}/${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: authHeader(privateKey),
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, ...params } = await req.json();

    if (action === "get_link") {
      // Public: get payment link details by token
      const { data: link, error } = await supabaseAdmin
        .from("payment_links")
        .select("*")
        .eq("token", params.token)
        .maybeSingle();
      if (error || !link) throw new Error("Enlace de pago no encontrado");
      
      // Also return OpenPay public config
      const { merchantId } = getConfig();
      const publicKey = Deno.env.get("OPENPAY_PUBLIC_KEY") || "";
      
      return new Response(JSON.stringify({
        link,
        openpay_config: { merchant_id: merchantId, public_key: publicKey, sandbox: true },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "complete_payment") {
      // Customer submits their tokenized card
      const { token, token_id, device_session_id } = params;
      if (!token || !token_id) throw new Error("Datos incompletos");

      // Get link
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("payment_links")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .maybeSingle();
      if (linkErr || !link) throw new Error("Enlace inválido o ya utilizado");

      // 1. Ensure customer exists in OpenPay
      let customerId = link.openpay_customer_id;
      if (!customerId) {
        const newCust = await openpayRequest("POST", "customers", {
          name: link.customer_name,
          email: link.customer_email,
          phone_number: link.customer_phone || undefined,
        });
        customerId = newCust.id;
      }

      // 2. Add tokenized card to customer
      const card = await openpayRequest("POST", `customers/${customerId}/cards`, {
        token_id,
        device_session_id: device_session_id || "browser",
      });

      // 3. Create subscription
      const sub = await openpayRequest("POST", `customers/${customerId}/subscriptions`, {
        plan_id: link.openpay_plan_id,
        card_id: card.id,
      });

      // 4. Update payment link as completed
      await supabaseAdmin
        .from("payment_links")
        .update({
          status: "completed",
          openpay_customer_id: customerId,
          openpay_subscription_id: sub.id,
          openpay_card_id: card.id,
          completed_at: new Date().toISOString(),
        })
        .eq("id", link.id);

      return new Response(JSON.stringify({
        success: true,
        subscription_id: sub.id,
        card_last4: card.card_number,
        status: sub.status,
        charge_date: sub.charge_date,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (error: any) {
    console.error("[OPENPAY-PUBLIC]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error desconocido" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
