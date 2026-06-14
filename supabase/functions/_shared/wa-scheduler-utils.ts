// Shared helpers for WhatsApp scheduler edge functions.
// Sends messages directly through WhatsAPI (no whatsapp-sender auth wrapper)
// because schedulers run as service role from cron.

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const WHATSAPI_TOKEN = Deno.env.get("WHATSAPI_GLOBAL_TOKEN") || "";

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Hora local (0-23) y fecha (yyyy-mm-dd) en una zona horaria dada
export function localParts(tz: string, now: Date = new Date()): { hour: number; minute: number; dow: number; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10) || 0;
  const minute = parseInt(get("minute"), 10) || 0;
  const wd = get("weekday").toLowerCase(); // mon, tue...
  const dowMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { hour, minute, dow: dowMap[wd] ?? 0, date };
}

export async function waSendText(phone: string, message: string): Promise<boolean> {
  try {
    const r = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-text", phone, message }),
    });
    return r.ok;
  } catch { return false; }
}

export async function waSendFile(phone: string, url: string, fileName: string, caption?: string): Promise<boolean> {
  try {
    const r = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-file", phone, url, fileName, caption }),
    });
    return r.ok;
  } catch { return false; }
}

// Intro la primera vez que un usuario recibe un auto-envío
export function buildIntroMessage(featureLabel: string): string {
  return (
    `👋 ¡Hola! Soy *Jarvis*, tu asistente de RutApp.\n\n` +
    `Esta es la primera vez que te envío *${featureLabel}* automáticamente. ` +
    `Es una nueva función para que tengas tus números a la mano sin pedirlos.\n\n` +
    `⚙️ ¿No quieres recibirlos o quieres cambiar el horario?\n` +
    `Entra a *RutApp → Bot WhatsApp* y configura tus suscripciones por usuario.\n\n` +
    `También puedes escribirme:\n` +
    `• "desactivar reporte diario"\n` +
    `• "desactivar cobranza"\n` +
    `• "desactivar alertas"\n\n` +
    `Si tienes dudas, escríbeme "ayuda".`
  );
}

// Itera destinatarios con delay para no ser bloqueados por WhatsApp
export async function sendBatchWithDelay(
  items: Array<{ phone: string; message: string; pdfUrl?: string; pdfName?: string }>,
  delayMs = 4000,
): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const ok = it.pdfUrl
      ? await waSendFile(it.phone, it.pdfUrl, it.pdfName || "reporte.pdf", it.message)
      : await waSendText(it.phone, it.message);
    if (ok) sent++; else failed++;
    if (i < items.length - 1) await sleep(delayMs);
  }
  return { sent, failed };
}
