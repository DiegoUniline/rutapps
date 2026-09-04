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
  empresaId?: string;
  empresa?: string;
  empresaEmail?: string;
  empresaTelefono?: string;
  clienteNombre?: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  personaContacto?: string;
  planContratado?: string;
  usuariosCuenta?: number;
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
  metodoPago?: string;
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

function getPlanModality(start?: string | null, end?: string | null, period?: string | null, months?: number | null): string {
  if (start && end) {
    const startDate = new Date(`${start.slice(0, 10)}T12:00:00Z`);
    const endDate = new Date(`${end.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      const periodMonths = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
        + endDate.getUTCMonth() - startDate.getUTCMonth();
      if (periodMonths === 12) return "Anual";
      if (periodMonths === 6) return "Semestral";
      if (periodMonths === 1) return "Mensual";
      if (periodMonths > 1) return `${periodMonths} meses`;
    }
  }

  const normalized = String(period || "").toLowerCase();
  if (normalized.includes("anual") || months === 12) return "Anual";
  if (normalized.includes("semestr") || months === 6) return "Semestral";
  if (normalized.includes("mens") || months === 1) return "Mensual";
  return months && months > 0 ? `${months} meses` : "";
}

async function enrichAccountData(supabase: SB, payload: BillingEventPayload): Promise<BillingEventPayload> {
  if (!payload.empresaId) return payload;

  try {
    const [empresaRes, subscriptionRes, profilesRes] = await Promise.all([
      supabase
        .from("empresas")
        .select("nombre, email, telefono, owner_user_id")
        .eq("id", payload.empresaId)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("max_usuarios, current_period_start, current_period_end, subscription_plans(nombre, periodo, meses)")
        .eq("empresa_id", payload.empresaId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("user_id, nombre, telefono")
        .eq("empresa_id", payload.empresaId)
        .limit(20),
    ]);

    const empresa = empresaRes.data as any;
    const subscription = subscriptionRes.data as any;
    const profiles = (profilesRes.data || []) as any[];
    const ownerProfile = profiles.find((profile) => profile.user_id === empresa?.owner_user_id);
    const contactProfile = ownerProfile || profiles.find((profile) => profile.nombre) || null;
    const relation = subscription?.subscription_plans;
    const plan = Array.isArray(relation) ? relation[0] : relation;
    const modality = getPlanModality(
      subscription?.current_period_start,
      subscription?.current_period_end,
      plan?.periodo,
      plan?.meses,
    );
    const planName = String(plan?.nombre || "").trim();
    const planContracted = planName && modality && planName.toLowerCase() !== modality.toLowerCase()
      ? `${planName} · ${modality}`
      : planName || modality;

    return {
      ...payload,
      empresa: payload.empresa || empresa?.nombre || undefined,
      empresaEmail: payload.empresaEmail || empresa?.email || payload.clienteEmail || undefined,
      empresaTelefono: payload.empresaTelefono || empresa?.telefono || payload.clienteTelefono || undefined,
      personaContacto: payload.personaContacto || contactProfile?.nombre || payload.clienteNombre || undefined,
      planContratado: payload.planContratado || planContracted || undefined,
      usuariosCuenta: payload.usuariosCuenta ?? subscription?.max_usuarios ?? payload.numUsuarios,
    };
  } catch (error) {
    console.error("[billing-notify] Account enrichment failed:", error);
    return payload;
  }
}

function buildPayUrl(folio?: string | null, fallback?: string | null): string | undefined {
  if (folio) return `https://rutapp.mx/factura/${encodeURIComponent(folio)}`;
  return fallback || undefined;
}

/** Translate Stripe decline codes / English messages into Spanish for the client. */
export function translateDeclineReason(input?: string | null): string | undefined {
  if (!input) return undefined;
  const raw = String(input).trim();
  if (!raw) return undefined;
  const key = raw.toLowerCase().replace(/[.\s]+$/g, "");
  const map: Record<string, string> = {
    generic_decline: "Tu banco rechazó el cargo.",
    card_declined: "Tu tarjeta fue rechazada por tu banco.",
    "your card was declined": "Tu tarjeta fue rechazada por tu banco.",
    "your card has been declined": "Tu tarjeta fue rechazada por tu banco.",
    do_not_honor: "Tu banco no autorizó la operación.",
    insufficient_funds: "Fondos insuficientes en la tarjeta.",
    "your card has insufficient funds": "Fondos insuficientes en la tarjeta.",
    expired_card: "La tarjeta está vencida.",
    "your card has expired": "La tarjeta está vencida.",
    incorrect_cvc: "El código de seguridad (CVC) es incorrecto.",
    "your card's security code is incorrect": "El código de seguridad (CVC) es incorrecto.",
    incorrect_number: "El número de tarjeta es incorrecto.",
    invalid_number: "El número de tarjeta es inválido.",
    invalid_expiry_month: "El mes de vencimiento es inválido.",
    invalid_expiry_year: "El año de vencimiento es inválido.",
    invalid_cvc: "El código de seguridad (CVC) es inválido.",
    processing_error: "Ocurrió un error al procesar el pago. Intenta nuevamente.",
    "an error occurred while processing your card": "Ocurrió un error al procesar tu tarjeta. Intenta nuevamente.",
    lost_card: "La tarjeta fue reportada como extraviada.",
    stolen_card: "La tarjeta fue reportada como robada.",
    pickup_card: "Tu banco solicitó retener la tarjeta. Contáctalos.",
    authentication_required: "Tu banco requiere autenticación adicional (3D Secure).",
    "authentication required": "Tu banco requiere autenticación adicional (3D Secure).",
    card_not_supported: "La tarjeta no es compatible con este tipo de cobro.",
    currency_not_supported: "La moneda no es compatible con esta tarjeta.",
    fraudulent: "Tu banco bloqueó el cargo por seguridad.",
    transaction_not_allowed: "Tu banco no permite este tipo de transacción.",
    try_again_later: "Tu banco pidió reintentar el cargo más tarde.",
    withdrawal_count_limit_exceeded: "Se superó el límite de transacciones de tu tarjeta.",
    call_issuer: "Tu banco solicita que te comuniques con ellos.",
    new_account_information_available: "Hay nueva información de la tarjeta. Actualiza el método de pago.",
    restricted_card: "La tarjeta tiene restricciones de uso.",
  };
  if (map[key]) return map[key];
  if (/declin/i.test(raw)) return "Tu tarjeta fue rechazada por tu banco.";
  if (/insufficient/i.test(raw)) return "Fondos insuficientes en la tarjeta.";
  if (/expired/i.test(raw)) return "La tarjeta está vencida.";
  if (/cvc|security code/i.test(raw)) return "El código de seguridad (CVC) es incorrecto.";
  if (/processing/i.test(raw)) return "Ocurrió un error al procesar el pago. Intenta nuevamente.";
  if (/authentication/i.test(raw)) return "Tu banco requiere autenticación adicional (3D Secure).";
  if (/[áéíóúñ¿¡]/i.test(raw) || /\b(tarjeta|banco|pago|fondos)\b/i.test(raw)) return raw;
  return "Tu banco rechazó el cargo. Verifica tu método de pago e intenta nuevamente.";
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

  payload = await enrichAccountData(supabase, payload);

  const payUrl = buildPayUrl(payload.folio, payload.enlacePago || payload.invoiceUrl);
  const { evento, idempotencyKey, invoiceUrl } = payload;

  // Translate any Stripe decline reason / English motive into Spanish before sending
  const detalleEs = translateDeclineReason(payload.detalle);
  payload = { ...payload, detalle: detalleEs };

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
        empresaEmail: payload.empresaEmail,
        empresaTelefono: payload.empresaTelefono,
        personaContacto: payload.personaContacto,
        planContratado: payload.planContratado,
        usuariosCuenta: payload.usuariosCuenta,
        clienteEmail: payload.clienteEmail,
        clienteTelefono: payload.clienteTelefono,
        monto: payload.monto,
        numUsuarios: payload.numUsuarios,
        fechaVigencia: payload.fechaVigencia,
        fecha: payload.fecha,
        folio: payload.folio || undefined,
        payUrl,
        invoiceUrl: invoiceUrl || undefined,
        intento: payload.intento,
        detalle: payload.detalle,
        metodoPago: payload.metodoPago,
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

  // ── 4. Admin emails — hidden BCC copies of the SAME client-facing email ──
  // Admins receive an identical copy of the email the client sees (same design,
  // same content), sent silently to each admin recipient.
  const adminRecipients = [ADMIN_EMAIL_TO, ...ADMIN_EMAIL_BCC];
  for (const to of adminRecipients) {
    await postTransactional(
      "client-billing-status",
      to,
      {
        evento,
        nombre: payload.clienteNombre,
        empresa: payload.empresa,
        empresaEmail: payload.empresaEmail,
        empresaTelefono: payload.empresaTelefono,
        personaContacto: payload.personaContacto,
        planContratado: payload.planContratado,
        usuariosCuenta: payload.usuariosCuenta,
        clienteEmail: payload.clienteEmail,
        clienteTelefono: payload.clienteTelefono,
        monto: payload.monto,
        numUsuarios: payload.numUsuarios,
        fechaVigencia: payload.fechaVigencia,
        fecha: payload.fecha,
        folio: payload.folio || undefined,
        payUrl,
        invoiceUrl: invoiceUrl || undefined,
        intento: payload.intento,
        detalle: payload.detalle,
        metodoPago: payload.metodoPago,
      },
      `admin-bcc-${evento}-${idempotencyKey}-${to}`,
    );
  }
}
