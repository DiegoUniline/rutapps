// Shared helpers to notify Rutapp admins (Diego + WhatsApp) on every billing event.
// - Skips $0 invoices entirely.
// - Sends ONLY to admin (no client notifications).
// - Builds rutapp.mx/factura/{folio} pay links.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

export const ADMIN_WA_PHONE = "5213171035768";
export const ADMIN_EMAIL_TO = "diego.leon@uniline.mx";

export interface BillingEventPayload {
  evento: "cobro_exitoso" | "cobro_fallido";
  empresa?: string;
  clienteNombre?: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  monto?: string;
  amountCents?: number;
  numUsuarios?: number;
  invoiceUrl?: string | null;
  enlacePago?: string | null;
  folio?: string | null;
  fecha?: string;
  fechaVigencia?: string;
  intento?: number;
  detalle?: string;
  idempotencyKey: string;
}

type SB = ReturnType<typeof createClient>;

function buildPayUrl(folio?: string | null, fallback?: string | null): string | undefined {
  if (folio) return `https://rutapp.mx/factura/${encodeURIComponent(folio)}`;
  return fallback || undefined;
}

async function sendAdminAlertEmail(
  to: string,
  payload: BillingEventPayload,
  payUrl: string | undefined,
  idempotencyKey: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: "admin-billing-alert",
        recipientEmail: to,
        idempotencyKey,
        templateData: { ...payload, payUrl },
      }),
    });
  } catch (e) {
    console.error(`Admin email to ${to} failed:`, e);
  }
}

async function sendWAText(waToken: string, phone: string, message: string): Promise<boolean> {
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
  try {
    const res = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": waToken },
      body: JSON.stringify({ action: "send-text", phone: cleanPhone, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildAdminText(p: BillingEventPayload, payUrl?: string): string {
  const isFail = p.evento === "cobro_fallido";
  const head = isFail ? "⚠️ *Cobro FALLIDO — Rutapp*" : "✅ *Cobro exitoso — Rutapp*";
  const lines = [
    head,
    "",
    `🏢 *Empresa:* ${p.empresa || "—"}`,
    `👤 *Cliente:* ${p.clienteNombre || "—"}`,
    `✉️ ${p.clienteEmail || "—"}`,
    `📱 ${p.clienteTelefono || "—"}`,
    "",
    `💰 *Monto:* ${p.monto || "—"}`,
  ];
  if (p.folio) lines.push(`🧾 *Folio:* ${p.folio}`);
  if (p.fecha) lines.push(`📅 *Fecha:* ${p.fecha}`);
  if (p.intento) lines.push(`🔁 *Intento:* #${p.intento}`);
  if (isFail && p.detalle) lines.push(`ℹ️ ${p.detalle}`);
  if (payUrl) {
    lines.push("");
    lines.push(isFail ? `💳 *Reintentar pago:* ${payUrl}` : `🧾 *Ver factura:* ${payUrl}`);
  }
  return lines.join("\n");
}

/**
 * Sends admin notifications (email to Diego + WhatsApp to admin) for a billing event.
 * Skips $0 invoices. NO client-facing messages are sent from here.
 */
export async function notifyBillingEvent(
  supabase: SB,
  waToken: string | undefined,
  payload: BillingEventPayload,
) {
  // ── Skip $0 invoices entirely ──
  const cents = payload.amountCents;
  if (typeof cents === "number" && cents <= 0) {
    console.log("[billing-notify] Skipping $0 invoice", payload.idempotencyKey);
    return;
  }
  if (cents === undefined) {
    // fallback: parse digits out of the monto string
    const digits = (payload.monto || "").replace(/[^\d]/g, "");
    if (digits && Number(digits) === 0) {
      console.log("[billing-notify] Skipping $0 invoice (string)", payload.idempotencyKey);
      return;
    }
  }

  const payUrl = buildPayUrl(payload.folio, payload.enlacePago || payload.invoiceUrl);

  // ── Admin WhatsApp ──
  if (waToken) {
    const adminText = buildAdminText(payload, payUrl);
    const ok = await sendWAText(waToken, ADMIN_WA_PHONE, adminText);
    try {
      await supabase.from("billing_notifications").insert({
        customer_email: ADMIN_EMAIL_TO,
        customer_phone: ADMIN_WA_PHONE,
        channel: "whatsapp",
        tipo: `admin_${payload.evento}`,
        mensaje: adminText,
        stripe_invoice_url: payload.invoiceUrl || null,
        monto_centavos: cents || 0,
        status: ok ? "sent" : "error",
      });
    } catch { /* silent */ }
  }

  // ── Admin email (only Diego) ──
  await sendAdminAlertEmail(
    ADMIN_EMAIL_TO,
    payload,
    payUrl,
    `admin-${payload.evento}-${payload.idempotencyKey}-${ADMIN_EMAIL_TO}`,
  );
}
