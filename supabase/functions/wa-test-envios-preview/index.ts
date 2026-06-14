// Test único — envía muestra de los 3 envíos automáticos al número solicitado.
// Borrar después de la prueba.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const WHATSAPI_TOKEN = Deno.env.get("WHATSAPI_GLOBAL_TOKEN") || "";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const PHONE = "5213171035768";
const EMPRESA_ID = "6d849e12-6437-4b24-917d-a89cc9b2fa88";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function send(message: string) {
  const r = await fetch(WHATSAPI_URL, {
    method: "POST",
    headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-text", phone: PHONE, message }),
  });
  return { ok: r.ok, status: r.status };
}

async function sendFile(url: string, fileName: string, caption: string) {
  const r = await fetch(WHATSAPI_URL, {
    method: "POST",
    headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-file", phone: PHONE, url, fileName, caption }),
  });
  return { ok: r.ok, status: r.status };
}

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

Deno.serve(async () => {
  const results: any[] = [];

  // 1) Intro de Jarvis
  const intro =
    `👋 ¡Hola! Soy *Jarvis*, tu asistente de RutApp.\n\n` +
    `Esta es una *prueba* de los nuevos envíos automáticos por WhatsApp. Hay 3 disponibles:\n\n` +
    `📊 *Reporte diario* — el cierre del día en PDF, a la hora que tú elijas (9 am – 8 pm).\n` +
    `💰 *Cobranza diaria* — recordatorio a la 1 pm con facturas que vencen mañana y vencidas.\n` +
    `🔔 *Alertas semanales* — cada lunes 9 am: clientes inactivos, stock bajo, ventas inusuales y crédito excedido.\n\n` +
    `Todos vienen *apagados por default*. Cada usuario los activa desde *RutApp → Bot WhatsApp* o escribiéndome aquí:\n` +
    `• "activar reporte diario"\n` +
    `• "activar cobranza"\n` +
    `• "activar alertas"\n` +
    `• "mis suscripciones" (para ver tu estado)\n\n` +
    `_A continuación te mando un ejemplo de cada uno 👇_`;
  results.push({ paso: "intro", ...(await send(intro)) });
  await sleep(4000);

  // 2) Ejemplo Reporte Diario — genera el PDF real de hoy si hay datos
  try {
    const fnRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-scheduler-reporte-diario`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" },
      body: JSON.stringify({ source: "test-noop" }),
    }).catch(() => null);
    // Construimos uno representativo manualmente
    const sampleReport =
      `📊 *Ejemplo: Reporte Diario*\n\n` +
      `Ventas: ${fmt(18450)} (12)\n` +
      `Cobros: ${fmt(9200)}\n` +
      `Gastos: ${fmt(850)}\n\n` +
      `_(En el real recibes esto + PDF completo con productos, vendedores, métodos de cobro, etc.)_\n\n` +
      `_Recibes este reporte automáticamente a la hora que elijas. Para cambiarlo escribe "desactivar reporte diario"._`;
    results.push({ paso: "reporte-sample", ...(await send(sampleReport)) });
  } catch (e) {
    results.push({ paso: "reporte-sample", error: String(e) });
  }
  await sleep(4000);

  // 3) Ejemplo Cobranza
  const cobranza =
    `💰 *Ejemplo: Recordatorio de Cobranza*\n\n` +
    `📅 *Mañana vencen 3 facturas por ${fmt(12400)}:*\n` +
    `• VTA-1203 · Abarrotes López · ${fmt(5800)}\n` +
    `• VTA-1218 · Tienda María · ${fmt(3900)}\n` +
    `• VTA-1224 · Don Pepe · ${fmt(2700)}\n\n` +
    `⚠️ *Vencidas: 2 por ${fmt(4150)}*\n` +
    `• VTA-1187 · Mini Súper Sol · ${fmt(2150)}\n` +
    `• VTA-1192 · Carnicería El Buen Corte · ${fmt(2000)}\n\n` +
    `_Recibes esto cada día a la 1pm. Escribe "desactivar cobranza" para apagarlo._`;
  results.push({ paso: "cobranza-sample", ...(await send(cobranza)) });
  await sleep(4000);

  // 4) Ejemplo Alertas Semanales
  const alertas =
    `🔔 *Ejemplo: Alertas Inteligentes — Semana*\n\n` +
    `😴 *5 clientes sin comprar en 30 días:*\n` +
    `• Abarrotes Pérez\n• Tienda La Esquina\n• Súper Don Luis\n• Mini Tepito\n• Casa Martínez\n\n` +
    `📦 *3 productos bajo mínimo:*\n` +
    `• Coca Cola 600ml · 5/20 pzs\n• Sabritas Original 45g · 8/30 pzs\n• Agua Ciel 1L · 3/15 pzs\n\n` +
    `📈 *2 ventas inusualmente altas* (promedio ${fmt(2400)}):\n` +
    `• ${fmt(8900)} · 09/06/2026\n• ${fmt(7200)} · 11/06/2026\n\n` +
    `🚨 *2 clientes exceden su crédito:*\n` +
    `• Distribuidora Norte · ${fmt(48000)} / límite ${fmt(30000)}\n` +
    `• Abarrotes Centro · ${fmt(22500)} / límite ${fmt(15000)}\n\n` +
    `_Recibes esto cada lunes a las 9am. Escribe "desactivar alertas" para apagarlo._`;
  results.push({ paso: "alertas-sample", ...(await send(alertas)) });

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
