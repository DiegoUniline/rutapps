// Shared helpers to notify the client + Rutapp admins on every billing event.
// - Skips $0 invoices entirely.
// - Builds rutapp.mx/factura/{folio} pay links.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

export const ADMIN_WA_PHONE = "5213171035768";
export const ADMIN_EMAIL_TO = "diego.leon@uniline.mx";
export const ADMIN_EMAIL_BCC = ["ventas@uniline.mx"];

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

export interface NotifyOptions {
  /** When true, sends ONLY client notifications (no admin copies). For previews/tests. */
  skipAdmin?: boolean;
  /** When true, sends ONLY admin notifications (no client). */
  skipClient?: boolean;
  /** Override the recipient for the CLIENT email (used in test previews). */
  overrideClientEmail?: string;
  /** Override the recipient for the CLIENT WhatsApp (used in test previews). */
  overrideClientPhone?: string;
}

type SB = ReturnType<typeof createClient>;

function buildPayUrl(folio?: string | null, fallback?: string | null): string | undefined {
  if (folio) return `https://rutapp.mx/factura/${encodeURIComponent(folio)}`;
  return fallback || undefined;
}

async function postTransactional(
  templateName: string,
  to: string,
  templateData: Record<string, unknown>,
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
      body: JSON.stringify({ templateName, recipientEmail: to, idempotencyKey, templateData }),
    });
  } catch (e) {
    console.error(`[${templateName}] email to ${to} failed:`, e);
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

function buildClientText(p: BillingEventPayload, payUrl?: string): string {
  const isFail = p.evento === "cobro_fallido";
  const lines: string[] = [];
  const saludo = `Hola ${p.clienteNombre || ""}${p.empresa ? ` de *${p.empresa}*` : ""},`.trim();
  if (isFail) {
    lines.push("⚠️ *Pago pendiente — Rutapp*", "", saludo, "");
    lines.push(`No pudimos procesar tu suscripción${p.monto ? ` de *${p.monto}*` : ""}${p.intento ? ` (Intento #${p.intento})` : ""} porque tu banco rechazó el cargo.`);
    if (p.detalle) lines.push(`\nMotivo: ${p.detalle}`);
    if (payUrl) lines.push(`\n💳 Reintenta tu pago aquí:\n${payUrl}`);
    lines.push("\n⚠️ Si no se regulariza pronto, tu acceso será suspendido.");
    lines.push("\nSi necesitas ayuda, responde a este mensaje. 🙌");
  } else {
    lines.push("✅ *Pago confirmado — Rutapp*", "", saludo, "");
    lines.push("¡Gracias por tu pago! 🎉 Tu suscripción está al día.");
    if (p.monto) lines.push(`\n💰 *Monto:* ${p.monto}`);
    if (p.numUsuarios) lines.push(`👥 *Usuarios activos:* ${p.numUsuarios}`);
    if (p.fechaVigencia) lines.push(`📅 *Próximo cobro:* ${p.fechaVigencia}`);
    if (payUrl) lines.push(`\n🧾 Tu factura:\n${payUrl}`);
    lines.push("\nSeguimos trabajando para que tu operación nunca se detenga. 🚀");
  }
  return lines.join("\n");
}

/**
 * Sends client + admin notifications (email + WhatsApp) for a billing event.
 * Skips $0 invoices. Idempotent per `idempotencyKey` for emails.
 */
export async function notifyBillingEvent(
  supabase: SB,
  waToken: string | undefined,
  payload: BillingEventPayload,
  options: NotifyOptions = {},
) {
  // ── Skip $0 invoices entirely ──
  const cents = payload.amountCents;
  if (typeof cents === "number" && cents <= 0) {
    console.log("[billing-notify] Skipping $0 invoice", payload.idempotencyKey);
    return;
  }
  if (cents === undefined) {
    const digits = (payload.monto || "").replace(/[^\d]/g, "");
    if (digits && Number(digits) === 0) {
      console.log("[billing-notify] Skipping $0 invoice (string)", payload.idempotencyKey);
      return;
    }
  }

  const payUrl = buildPayUrl(payload.folio, payload.enlacePago || payload.invoiceUrl);
  const { evento, idempotencyKey, invoiceUrl } = payload;

  const clientEmail = options.overrideClientEmail || payload.clienteEmail;
  const clientPhone = options.overrideClientPhone || payload.clienteTelefono;

  // ── 1. Client email ──
  if (!options.skipClient && clientEmail) {
    await postTransactional(
      "client-billing-status",
      clientEmail,
      {
        evento,
        nombre: payload.clienteNombre,
        empresa: payload.empresa,
        monto: payload.monto,
        numUsuarios: payload.numUsuarios,
        fechaVigencia: payload.fechaVigencia,
        fecha: payload.fecha,
        folio: payload.folio || undefined,
        payUrl,
        invoiceUrl: invoiceUrl || undefined,
        intento: payload.intento,
        detalle: payload.detalle,
      },
      `client-${evento}-${idempotencyKey}-${clientEmail}`,
    );
  }

  // ── 2. Client WhatsApp ──
  if (!options.skipClient && waToken && clientPhone) {
    const clientText = buildClientText(payload, payUrl);
    const ok = await sendWAText(waToken, clientPhone, clientText);
    try {
      await supabase.from("billing_notifications").insert({
        customer_email: clientEmail || "",
        customer_phone: clientPhone.replace(/[\s\-\(\)]/g, ""),
        channel: "whatsapp",
        tipo: evento,
        mensaje: clientText,
        stripe_invoice_url: invoiceUrl || null,
        monto_centavos: cents || 0,
        status: ok ? "sent" : "error",
      });
    } catch { /* silent */ }
  }

  if (options.skipAdmin) return;

  // ── 3. Admin WhatsApp ──
  if (waToken) {
    const adminText = buildAdminText(payload, payUrl);
    const ok = await sendWAText(waToken, ADMIN_WA_PHONE, adminText);
    try {
      await supabase.from("billing_notifications").insert({
        customer_email: ADMIN_EMAIL_TO,
        customer_phone: ADMIN_WA_PHONE,
        channel: "whatsapp",
        tipo: `admin_${evento}`,
        mensaje: adminText,
        stripe_invoice_url: invoiceUrl || null,
        monto_centavos: cents || 0,
        status: ok ? "sent" : "error",
      });
    } catch { /* silent */ }
  }

  // ── 4. Admin emails (Diego + BCC) ──
  const adminRecipients = [ADMIN_EMAIL_TO, ...ADMIN_EMAIL_BCC];
  for (const to of adminRecipients) {
    await postTransactional(
      "admin-billing-alert",
      to,
      { ...payload, payUrl },
      `admin-${evento}-${idempotencyKey}-${to}`,
    );
  }
}
