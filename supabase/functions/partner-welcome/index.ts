import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const GROUP_URL = "https://chat.whatsapp.com/EazqGNWPsNOEMrNB7VbjqW?mode=gi_t";

async function sendWA(apiToken: string, phone: string, message: string): Promise<boolean> {
  try {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
    const res = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": apiToken },
      body: JSON.stringify({ action: "send-text", phone: cleanPhone, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { nombre, telefono, email } = await req.json();

    if (!telefono || typeof telefono !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "telefono requerido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!waConfig?.api_token) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp no configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstName = (nombre || "").split(" ")[0] || "";
    const message = [
      `🎉 *¡Bienvenido al Programa de Partners de Rutapp!*\n`,
      `Hola ${firstName} 👋`,
      `Recibimos tu solicitud${email ? ` con el correo *${email}*` : ""} y estamos a punto de aprobarte como partner oficial. 🚀\n`,
      `Mientras tanto, te invitamos a unirte a nuestro *grupo exclusivo de Partners* en WhatsApp, donde entre todos nos ayudamos y compartimos estrategias:`,
      `👉 ${GROUP_URL}\n`,
      `📝 *Indicaciones del grupo:*`,
      `Al entrar, preséntate con tu *nombre* y *país* para que la comunidad te dé la bienvenida.\n`,
      `¡Nos vemos dentro! 💼✨`,
      `— El equipo de Rutapp`,
    ].join("\n");

    const sent = await sendWA(waConfig.api_token, telefono, message);

    try {
      await supabase.from("whatsapp_log").insert({
        telefono: telefono.replace(/[\s\-\(\)]/g, ""),
        tipo: "partner-welcome",
        mensaje: message,
        status: sent ? "sent" : "error",
      });
    } catch { /* silent */ }

    return new Response(
      JSON.stringify({ success: sent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("partner-welcome error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
