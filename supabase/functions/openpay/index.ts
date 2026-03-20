import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SANDBOX_API = "https://sandbox-api.openpay.mx/v1";
// const PROD_API = "https://api.openpay.mx/v1";

function getConfig() {
  const merchantId = Deno.env.get("OPENPAY_MERCHANT_ID");
  const privateKey = Deno.env.get("OPENPAY_PRIVATE_KEY");
  if (!merchantId || !privateKey) throw new Error("OpenPay credentials not configured");
  return { merchantId, privateKey };
}

function authHeader(privateKey: string) {
  return "Basic " + btoa(privateKey + ":");
}

function apiUrl(merchantId: string, path: string) {
  return `${SANDBOX_API}/${merchantId}/${path}`;
}

async function openpayRequest(method: string, path: string, body?: any) {
  const { merchantId, privateKey } = getConfig();
  const url = apiUrl(merchantId, path);
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
    // Auth check — super admin only
    const authH = req.headers.get("Authorization");
    if (!authH) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authH } } }
    );
    const token = authH.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) throw new Error("Unauthorized");
    const userId = claims.claims.sub as string;

    // Check super admin
    const { data: sa } = await supabase
      .from("super_admins")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sa) throw new Error("Forbidden: super admin only");

    const { action, ...params } = await req.json();

    let result: any;

    switch (action) {
      // ── Plans ──
      case "list_plans": {
        result = await openpayRequest("GET", "plans");
        break;
      }
      case "create_plan": {
        result = await openpayRequest("POST", "plans", {
          name: params.name,
          amount: params.amount,
          currency: params.currency || "MXN",
          repeat_unit: params.repeat_unit || "month",
          repeat_every: params.repeat_every || 1,
          retry_times: params.retry_times ?? 2,
          status_after_retry: params.status_after_retry || "cancelled",
          trial_days: params.trial_days ?? 0,
        });
        break;
      }
      case "delete_plan": {
        await openpayRequest("DELETE", `plans/${params.plan_id}`);
        result = { deleted: true };
        break;
      }

      // ── Customers ──
      case "create_customer": {
        result = await openpayRequest("POST", "customers", {
          name: params.name,
          email: params.email,
          phone_number: params.phone || undefined,
        });
        break;
      }
      case "list_customers": {
        result = await openpayRequest("GET", "customers");
        break;
      }

      // ── Cards (tokenized) ──
      case "add_card": {
        // Add a tokenized card to a customer
        result = await openpayRequest("POST", `customers/${params.customer_id}/cards`, {
          token_id: params.token_id,
          device_session_id: params.device_session_id,
        });
        break;
      }
      case "list_cards": {
        result = await openpayRequest("GET", `customers/${params.customer_id}/cards`);
        break;
      }

      // ── Subscriptions ──
      case "create_subscription": {
        const subData: any = {
          plan_id: params.plan_id,
          card_id: params.card_id,
        };
        if (params.trial_end_date) subData.trial_end_date = params.trial_end_date;
        result = await openpayRequest(
          "POST",
          `customers/${params.customer_id}/subscriptions`,
          subData
        );
        break;
      }
      case "list_subscriptions": {
        result = await openpayRequest(
          "GET",
          `customers/${params.customer_id}/subscriptions`
        );
        break;
      }
      case "cancel_subscription": {
        await openpayRequest(
          "DELETE",
          `customers/${params.customer_id}/subscriptions/${params.subscription_id}`
        );
        result = { cancelled: true };
        break;
      }

      // ── One-off charge ──
      case "charge": {
        const chargeData: any = {
          method: "card",
          source_id: params.card_id || params.token_id,
          amount: params.amount,
          currency: params.currency || "MXN",
          description: params.description || "Cargo",
          device_session_id: params.device_session_id,
        };
        const path = params.customer_id
          ? `customers/${params.customer_id}/charges`
          : "charges";
        result = await openpayRequest("POST", path, chargeData);
        break;
      }

      // ── Checkout link (store charge for OXXO) ──
      case "create_checkout": {
        const checkoutData: any = {
          method: "store",
          amount: params.amount,
          currency: params.currency || "MXN",
          description: params.description || "Pago de suscripción",
          order_id: params.order_id || `ORD-${Date.now()}`,
        };
        const cPath = params.customer_id
          ? `customers/${params.customer_id}/charges`
          : "charges";
        result = await openpayRequest("POST", cPath, checkoutData);
        break;
      }

      // ── Bank transfer charge (SPEI) ──
      case "create_bank_charge": {
        const bankData: any = {
          method: "bank_account",
          amount: params.amount,
          currency: params.currency || "MXN",
          description: params.description || "Pago por transferencia",
          order_id: params.order_id || `ORD-${Date.now()}`,
        };
        const bPath = params.customer_id
          ? `customers/${params.customer_id}/charges`
          : "charges";
        result = await openpayRequest("POST", bPath, bankData);
        break;
      }

      // ── Get merchant info / public key ──
      case "get_config": {
        const { merchantId } = getConfig();
        const publicKey = Deno.env.get("OPENPAY_PUBLIC_KEY") || "";
        result = {
          merchant_id: merchantId,
          public_key: publicKey,
          sandbox: true,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[OPENPAY]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
