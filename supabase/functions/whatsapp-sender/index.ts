import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, empresa_id, phone, message, url, fileName, caption, tipo, referencia_id } =
      await req.json();

    if (!empresa_id || !phone) {
      return new Response(
        JSON.stringify({ error: "empresa_id y phone son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get WhatsApp config (only need api_token now)
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("whatsapp_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .single();

    if (cfgErr || !config) {
      return new Response(
        JSON.stringify({ error: "WhatsApp no configurado para esta empresa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.activo) {
      return new Response(
        JSON.stringify({ error: "WhatsApp está desactivado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { api_token } = config;
    if (!api_token) {
      return new Response(
        JSON.stringify({ error: "Falta el API Token de WhatsApp" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone: remove spaces, dashes
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");

    // 2. Build request body based on action
    let body: Record<string, unknown>;

    switch (action) {
      case "send-text":
        body = { action: "send-text", phone: normalizedPhone, message: message || "" };
        break;
      case "send-image":
        body = { action: "send-image", phone: normalizedPhone, url, caption: caption || "" };
        break;
      case "send-file":
        body = { action: "send-file", phone: normalizedPhone, url, fileName: fileName || "documento.pdf" };
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Acción no soportada: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    let status = "sent";
    let errorDetalle: string | null = null;

    try {
      const apiResponse = await fetch(WHATSAPI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": api_token,
        },
        body: JSON.stringify(body),
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.text();
        status = "error";
        errorDetalle = `HTTP ${apiResponse.status}: ${errBody}`;
      }
    } catch (fetchErr: unknown) {
      status = "error";
      errorDetalle = fetchErr instanceof Error ? fetchErr.message : "Error de conexión";
    }

    // 3. Log the message
    await supabaseAdmin.from("whatsapp_log").insert({
      empresa_id,
      telefono: normalizedPhone,
      tipo: tipo || action,
      mensaje: message || caption || null,
      imagen_url: url || null,
      status,
      error_detalle: errorDetalle,
      referencia_id: referencia_id || null,
    });

    if (status === "error") {
      return new Response(
        JSON.stringify({ success: false, error: errorDetalle }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("whatsapp-sender error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
