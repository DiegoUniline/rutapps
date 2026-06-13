// Envía mensaje de bienvenida de Jarvis al dar de alta un número en el bot.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPI_TOKEN = Deno.env.get("WHATSAPI_GLOBAL_TOKEN") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function normalizePhone(raw: string): string {
  return (raw || "").replace(/[^\d]/g, "");
}

const WELCOME = (nombre: string | null, empresa: string) =>
  `👋 ¡Hola${nombre ? ` ${nombre}` : ""}! Soy *Jarvis* 🤖, el asistente IA de *RutApp* para *${empresa}*.

Estoy disponible 24/7 por WhatsApp. Solo platícame en lenguaje natural lo que necesites — respondo únicamente con *información real del sistema de tu empresa*.

✨ *Lo que puedo hacer:*
📊 Reportes diarios en PDF (ventas, cobros, gastos)
📦 Consultar productos, stock e inventario
👤 Ver clientes, saldos y movimientos
💰 Resumen de cobros, pagos y métodos de pago
🧾 Ventas, pedidos y quién los vendió
📈 Top de productos / cuentas por cobrar
🔍 Detalle de cualquier venta por folio

💬 *Ejemplos de cómo pedirme cosas:*
• "Mándame el reporte de ayer en PDF"
• "¿Cuánto vendí hoy?"
• "¿Qué productos tengo bajos de stock?"
• "Saldo de Juan Pérez"
• "¿Quién me debe más?"
• "Detalle de la venta VTA-0001"
• "Cobros recibidos hoy"

⚠️ Por ahora solo entiendo *mensajes de texto* (no audios, ni imágenes, ni stickers).

Escribe *ayuda* en cualquier momento para volver a ver este menú. ¡Listo cuando quieras! 🚀`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { authorized_id } = await req.json();
    if (!authorized_id) {
      return new Response(JSON.stringify({ error: "authorized_id requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await admin
      .from("wa_bot_authorized_numbers")
      .select("id, phone_e164, nombre, empresa_id, welcome_sent_at, empresas(nombre, razon_social)")
      .eq("id", authorized_id).maybeSingle();
    if (error || !row) throw error || new Error("Número no encontrado");
    if (row.welcome_sent_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(row.phone_e164);
    const empresa = (row as any).empresas?.razon_social || (row as any).empresas?.nombre || "tu empresa";

    if (WHATSAPI_TOKEN && phone) {
      await fetch(WHATSAPI_URL, {
        method: "POST",
        headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-text", phone, message: WELCOME(row.nombre, empresa) }),
      }).catch(() => {});
    }

    await admin.from("wa_bot_authorized_numbers")
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq("id", row.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("wa-bot-welcome error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
