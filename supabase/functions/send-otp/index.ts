import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, phone, code } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Se requiere número de teléfono" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");

    if (action === "send") {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("otp_codes")
        .select("*", { count: "exact", head: true })
        .eq("phone", normalizedPhone)
        .gte("created_at", tenMinAgo);

      if ((count ?? 0) >= 3) {
        return new Response(
          JSON.stringify({ error: "Demasiados intentos. Espera 10 minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const otpCode = generateCode();

      await supabaseAdmin.from("otp_codes").insert({
        phone: normalizedPhone,
        code: otpCode,
      });

      const apiToken = Deno.env.get("WHATSAPP_OTP_TOKEN");
      if (!apiToken) {
        return new Response(
          JSON.stringify({ error: "Token de WhatsApp no configurado" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const message = `🔐 *RutApp - Código de verificación*\n\nTu código es: *${otpCode}*\n\nEste código expira en 10 minutos.\nSi no solicitaste este código, ignora este mensaje.`;

      const apiResponse = await fetch(WHATSAPI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": apiToken,
        },
        body: JSON.stringify({
          action: "send-text",
          phone: normalizedPhone,
          message,
        }),
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.text();
        console.error("WhatsApp send error:", errBody);
        return new Response(
          JSON.stringify({ error: "No se pudo enviar el código. Verifica tu número." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Código enviado por WhatsApp" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!code) {
        return new Response(
          JSON.stringify({ error: "Se requiere el código" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const { data: otpRecord } = await supabaseAdmin
        .from("otp_codes")
        .select("*")
        .eq("phone", normalizedPhone)
        .eq("code", code)
        .eq("verified", false)
        .gte("created_at", tenMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otpRecord) {
        const { data: latest } = await supabaseAdmin
          .from("otp_codes")
          .select("id, attempts")
          .eq("phone", normalizedPhone)
          .eq("verified", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          await supabaseAdmin
            .from("otp_codes")
            .update({ attempts: (latest.attempts || 0) + 1 })
            .eq("id", latest.id);

          if ((latest.attempts || 0) >= 4) {
            return new Response(
              JSON.stringify({ error: "Demasiados intentos fallidos. Solicita un nuevo código." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        return new Response(
          JSON.stringify({ error: "Código incorrecto o expirado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin
        .from("otp_codes")
        .update({ verified: true })
        .eq("id", otpRecord.id);

      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida. Usa 'send' o 'verify'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("send-otp error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
