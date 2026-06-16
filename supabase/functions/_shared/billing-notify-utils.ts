// Shared helpers to notify the client + Rutapp admins on every billing event.
// Used by stripe-webhook (per-attempt, real-time) and billing-notify (daily summary).
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
  numUsuarios?: number;
  invoiceUrl?: string | null;
  enlacePago?: string | null;
  fecha?: string;
  fechaVigencia?: string;
  intento?: number;
  detalle?: string;
  idempotencyKey: string;
}

type SB = ReturnType<typeof createClient>;

async function sendTransactionalEmail(
  to: string,
  templateData: Record<string, unknown>,
  idempotencyKey: string
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
        templateName: "client-billing-status",
        recipientEmail: to,
        idempotencyKey,
        templateData,
      }),
    });
  } catch (e) {
    console.error(`Email to ${to} failed:`, e);
  }
}

async function sendAdminAlertEmail(
  to: string,
  payload: BillingEventPayload,
  idempotencyKey: string
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
        templateData: payload,
      }),
    });
  } catch (e) {
    console.error(`Admin email to ${to} failed:`, e);
  }
}

async function sendWAText(
  waToken: string,
  phone: string,
  message: string
): Promise<boolean> {
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

function buildAdminText(p: BillingEventPayload): string {
  const isFail = p.evento === "cobro_fallido";
  const lines = [
    isFail ? "⚠️ *Cobro FALLIDO — Rutapp*" : "✅ *Cobro exitoso — Rutapp*",
    "",
    `*Empresa:* ${p.empresa || "—"}`,
    `*Cliente:* ${p.clienteNombre || "—"}`,
    `*Email:* ${p.clienteEmail || "—"}`,
    `*Teléfono:* ${p.clienteTelefono || "—"}`,
    `*Monto:* ${p.monto || "—"}`,
  ];
  if (p.numUsuarios) lines.push(`*Usuarios:* ${p.numUsuarios}`);
  if (p.fecha) lines.push(`*Fecha:* ${p.fecha}`);
  if (p.intento) lines.push(`*Intento:* #${p.intento}`);
  if (p.invoiceUrl) lines.push(`*Factura:* ${p.invoiceUrl}`);
  if (p.detalle) lines.push(`*Detalle:* ${p.detalle}`);
  return lines.join("\n");
}

function buildClientText(p: BillingEventPayload): string {
  const isFail = p.evento === "cobro_fallido";
  const lines: string[] = [];
  if (isFail) {
    lines.push("⚠️ *Pago pendiente — Rutapp*", "");
    lines.push(`Hola ${p.clienteNombre || ""}${p.empresa ? ` de *${p.empresa}*` : ""},`, "");
    lines.push(`No pudimos procesar tu pago${p.monto ? ` de *${p.monto}*` : ""}.${p.intento ? ` (Intento #${p.intento})` : ""}`);
    if (p.detalle) lines.push(`Motivo: ${p.detalle}`);
    if (p.enlacePago || p.invoiceUrl) lines.push(`\n💳 Reintentar: ${p.enlacePago || p.invoiceUrl}`);
    lines.push("\n⚠️ Si no se regulariza, tu acceso será suspendido.");
  } else {
    lines.push("✅ *Pago confirmado — Rutapp*", "");
    lines.push(`Hola ${p.clienteNombre || ""}${p.empresa ? ` de *${p.empresa}*` : ""},`, "");
    lines.push("¡Gracias por tu pago! 💪");
    if (p.monto) lines.push(`\n💰 *Monto:* ${p.monto}`);
    if (p.numUsuarios) lines.push(`👥 *Usuarios:* ${p.numUsuarios}`);
    if (p.fechaVigencia) lines.push(`📅 *Próximo cobro:* ${p.fechaVigencia}`);
    if (p.invoiceUrl) lines.push(`\n🧾 Factura: ${p.invoiceUrl}`);
    lines.push("\nGracias por ser parte de *Rutapp*. 🚀");
  }
  return lines.join("\n");
}

/**
 * Sends client + admin notifications (email + WhatsApp) for a billing event.
 * Idempotent per `idempotencyKey` for emails.
 */
export async function notifyBillingEvent(
  supabase: SB,
  waToken: string | undefined,
  payload: BillingEventPayload
) {
  const { evento, clienteEmail, clienteTelefono, invoiceUrl, idempotencyKey } = payload;

  // ── 1. Client email ──
  if (clienteEmail) {
    await sendTransactionalEmail(
      clienteEmail,
      {
        evento,
        nombre: payload.clienteNombre,
        empresa: payload.empresa,
        monto: payload.monto,
        numUsuarios: payload.numUsuarios,
        fechaVigencia: payload.fechaVigencia,
        fecha: payload.fecha,
        invoiceUrl: invoiceUrl || undefined,
        enlacePago: payload.enlacePago || undefined,
        intento: payload.intento,
        detalle: payload.detalle,
      },
      `client-${evento}-${idempotencyKey}`
    );
  }

  // ── 2. Client WhatsApp ──
  if (waToken && clienteTelefono) {
    const clientText = buildClientText(payload);
    const ok = await sendWAText(waToken, clienteTelefono, clientText);
    try {
      await supabase.from("billing_notifications").insert({
        customer_email: clienteEmail || "",
        customer_phone: clienteTelefono.replace(/[\s\-\(\)]/g, ""),
        channel: "whatsapp",
        tipo: evento,
        mensaje: clientText,
        stripe_invoice_url: invoiceUrl || null,
        monto_centavos: 0,
        status: ok ? "sent" : "error",
      });
    } catch { /* silent */ }
  }

  // ── 3. Admin WhatsApp ──
  if (waToken) {
    const adminText = buildAdminText(payload);
    const ok = await sendWAText(waToken, ADMIN_WA_PHONE, adminText);
    try {
      await supabase.from("billing_notifications").insert({
        customer_email: ADMIN_EMAIL_TO,
        customer_phone: ADMIN_WA_PHONE,
        channel: "whatsapp",
        tipo: `admin_${evento}`,
        mensaje: adminText,
        stripe_invoice_url: invoiceUrl || null,
        monto_centavos: 0,
        status: ok ? "sent" : "error",
      });
    } catch { /* silent */ }
  }

  // ── 4. Admin emails (to + each "BCC" as individual sends) ──
  const adminRecipients = [ADMIN_EMAIL_TO, ...ADMIN_EMAIL_BCC];
  for (const to of adminRecipients) {
    await sendAdminAlertEmail(to, payload, `admin-${evento}-${idempotencyKey}-${to}`);
  }
}
