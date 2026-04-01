import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RUTAPP_PRODUCT_IDS = new Set([
  "prod_U9a56wjBGbKv4B",
  "prod_U9a6TsdjaGp99L",
  "prod_U9a7Ap6nbM6kPV",
]);

const GRACE_DAYS = 3;
const FACTURACION_URL = "https://rutapp.mx/facturacion";

/* ─── Template types ─── */
interface TemplateConfig {
  tipo: string;
  campos: Record<string, boolean>;
  emoji: string;
  encabezado: string;
  activo: boolean;
}

interface TicketVars {
  nombre?: string;
  empresa?: string;
  monto?: string;
  fechaCobro?: string;
  numUsuarios?: number;
  enlacePago?: string;
  enlaceFacturacion?: string;
  fechaVigencia?: string;
}

/* ─── Default templates ─── */
const DEFAULT_TEMPLATES: Record<string, TemplateConfig> = {
  pre_cobro: {
    tipo: "pre_cobro", emoji: "🔔", encabezado: "Recordatorio de cobro — Rutapp",
    activo: true,
    campos: { nombre_cliente: true, nombre_empresa: true, fecha_cobro: true, monto: true, num_usuarios: true, enlace_facturacion: true, mensaje_despedida: true },
  },
  cobro_exitoso: {
    tipo: "cobro_exitoso", emoji: "✅", encabezado: "Pago confirmado — Rutapp",
    activo: true,
    campos: { nombre_cliente: true, nombre_empresa: true, monto: true, fecha_vigencia: true, mensaje_despedida: true },
  },
  cobro_fallido: {
    tipo: "cobro_fallido", emoji: "⚠️", encabezado: "Pago pendiente — Rutapp",
    activo: true,
    campos: { nombre_cliente: true, nombre_empresa: true, monto: true, dias_gracia: true, enlace_pago: true, advertencia_suspension: true },
  },
  suspension: {
    tipo: "suspension", emoji: "🚫", encabezado: "Cuenta suspendida — Rutapp",
    activo: true,
    campos: { nombre_cliente: true, nombre_empresa: true, enlace_facturacion: true, mensaje_contacto: true },
  },
  trial_expira_manana: {
    tipo: "trial_expira_manana", emoji: "⏳", encabezado: "Tu prueba gratuita vence mañana — Rutapp",
    activo: true,
    campos: { nombre_cliente: true, nombre_empresa: true, enlace_facturacion: true, mensaje_despedida: true },
  },
  trial_expirado: {
    tipo: "trial_expirado", emoji: "⚠️", encabezado: "Tu prueba gratuita ha vencido — Rutapp",
    activo: true,
    campos: { nombre_cliente: true, nombre_empresa: true, dias_gracia: true, enlace_facturacion: true, advertencia_suspension: true },
  },
};

/* ─── Build text message ─── */
function buildTextMessage(tpl: TemplateConfig, vars: TicketVars): string {
  const c = tpl.campos;
  const lines: string[] = [];
  lines.push(`${tpl.emoji} *${tpl.encabezado}*\n`);
  const greeting = c.nombre_cliente && vars.nombre ? `Hola ${vars.nombre}` : "Hola";
  const empresaLine = c.nombre_empresa && vars.empresa ? ` de *${vars.empresa}*` : "";
  lines.push(`${greeting}${empresaLine},\n`);

  if (tpl.tipo === "pre_cobro") {
    if (c.fecha_cobro && vars.fechaCobro) lines.push(`Mañana *${vars.fechaCobro}* se realizará tu cobro automático`);
    if (c.monto && vars.monto) lines.push(`de *${vars.monto}*`);
    if (c.num_usuarios && vars.numUsuarios) lines.push(`por *${vars.numUsuarios} usuario(s)*.`);
    if (c.enlace_facturacion) lines.push(`\n💳 ${vars.enlaceFacturacion || ""}`);
    if (c.mensaje_despedida) lines.push("\n¡Gracias por confiar en Rutapp! 🚀");
  }
  if (tpl.tipo === "cobro_exitoso") {
    lines.push("¡Tu pago ha sido procesado exitosamente! 💪\n");
    if (c.monto && vars.monto) lines.push(`💰 *Monto:* ${vars.monto}`);
    if (c.nombre_empresa && vars.numUsuarios) lines.push(`👥 *Usuarios activos:* ${vars.numUsuarios}`);
    if (c.fecha_vigencia && vars.fechaVigencia) lines.push(`📅 *Próximo cobro:* ${vars.fechaVigencia}`);
    lines.push("\nTu suscripción está al día y todos tus usuarios tienen acceso completo. 🟢");
    if (c.mensaje_despedida) lines.push("\n¡Gracias por ser parte de *Rutapp*! Seguimos trabajando para que tu negocio crezca cada día. 🚀");
  }
  if (tpl.tipo === "cobro_fallido") {
    lines.push("No pudimos procesar tu pago.");
    if (c.monto && vars.monto) lines.push(`Pendiente: *${vars.monto}*.`);
    if (c.dias_gracia) lines.push(`Tienes *${GRACE_DAYS} días* para pagar.`);
    if (c.enlace_pago) lines.push(`\n💳 ${vars.enlacePago || ""}`);
    if (c.advertencia_suspension) lines.push("\n⚠️ Si no regularizas, tu acceso será suspendido.");
  }
  if (tpl.tipo === "suspension") {
    lines.push("Tu cuenta ha sido *suspendida* por falta de pago.");
    if (c.enlace_facturacion) lines.push(`\n${vars.enlaceFacturacion || ""}`);
    if (c.mensaje_contacto) lines.push("\nSi tienes dudas, contáctanos.");
  }
  if (tpl.tipo === "trial_expira_manana") {
    lines.push("Tu periodo de prueba gratuita *vence mañana*.");
    lines.push("\nPara seguir usando Rutapp sin interrupciones, activa tu plan ahora:");
    if (c.enlace_facturacion) lines.push(`\n💳 *Activar plan:* ${vars.enlaceFacturacion || FACTURACION_URL}`);
    if (c.mensaje_despedida) lines.push("\n¡Esperamos que estés disfrutando Rutapp! 🚀");
  }
  if (tpl.tipo === "trial_expirado") {
    lines.push("Tu periodo de prueba gratuita *ha vencido*.");
    if (c.dias_gracia) lines.push(`\nTienes *${GRACE_DAYS} días de gracia* antes de que tu cuenta sea suspendida.`);
    lines.push("\nActiva tu plan para no perder acceso a tus datos:");
    if (c.enlace_facturacion) lines.push(`\n💳 *Activar plan:* ${vars.enlaceFacturacion || FACTURACION_URL}`);
    if (c.advertencia_suspension) lines.push("\n⚠️ Después del periodo de gracia tu acceso será suspendido.");
  }
  return lines.join("\n");
}

/* ─── Send WhatsApp (text only) ─── */
async function sendWA(
  supabase: ReturnType<typeof createClient>,
  waToken: string,
  phone: string,
  tpl: TemplateConfig,
  vars: TicketVars,
  email: string,
  invoiceUrl?: string | null,
  amountCents?: number
): Promise<boolean> {
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
  const textMsg = buildTextMessage(tpl, vars);
  let status = "sent";

  try {
    const res = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": waToken },
      body: JSON.stringify({ action: "send-text", phone: cleanPhone, message: textMsg }),
    });
    status = res.ok ? "sent" : "error";
  } catch { status = "error"; }

  try {
    await supabase.from("billing_notifications").insert({
      customer_email: email,
      customer_phone: cleanPhone,
      channel: "whatsapp",
      tipo: tpl.tipo,
      mensaje: textMsg,
      stripe_invoice_url: invoiceUrl || null,
      monto_centavos: amountCents || 0,
      status,
    });
  } catch { /* silent */ }

  return status === "sent";
}

/* ─── Check if already notified today (Mexico TZ) ─── */
async function alreadyNotifiedToday(
  supabase: ReturnType<typeof createClient>,
  email: string,
  tipo: string
): Promise<boolean> {
  const MX_TZ = "America/Mexico_City";
  const todayMx = new Date().toLocaleDateString("en-CA", { timeZone: MX_TZ });
  const { count } = await supabase
    .from("billing_notifications")
    .select("id", { count: "exact", head: true })
    .eq("customer_email", email)
    .eq("tipo", tipo)
    .gte("created_at", `${todayMx}T00:00:00-06:00`);
  return (count ?? 0) > 0;
}

/* ─── Helpers ─── */
function getMonthName(offset = 1) {
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return months[(new Date().getMonth() + offset) % 12];
}

async function getEmpresaName(supabase: ReturnType<typeof createClient>, id: string): Promise<string> {
  const { data } = await supabase.from("empresas").select("nombre").eq("id", id).maybeSingle();
  return data?.nombre || "";
}

async function getProfileForEmpresa(supabase: ReturnType<typeof createClient>, empresaId: string) {
  const { data } = await supabase.from("profiles").select("user_id, nombre, telefono").eq("empresa_id", empresaId).limit(1).maybeSingle();
  if (!data) return null;
  const { data: userData } = await supabase.auth.admin.getUserById(data.user_id);
  return { ...data, email: userData?.user?.email || null };
}

/* ─── Main handler ─── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // ─── Manual send mode ───
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body?.manual_send) {
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const waToken = waConfig?.api_token;
        if (!waToken) {
          return new Response(JSON.stringify({ error: "No WhatsApp token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Load templates
        const { data: tplRows } = await supabase
          .from("billing_message_templates")
          .select("tipo, campos, emoji, encabezado, activo");
        const tplMapManual: Record<string, TemplateConfig> = { ...DEFAULT_TEMPLATES };
        for (const row of tplRows || []) {
          tplMapManual[row.tipo] = {
            tipo: row.tipo,
            campos: row.campos as Record<string, boolean>,
            emoji: row.emoji,
            encabezado: row.encabezado || DEFAULT_TEMPLATES[row.tipo]?.encabezado || "",
            activo: row.activo,
          };
        }

        const tpl = tplMapManual[body.tipo] || DEFAULT_TEMPLATES.cobro_exitoso;
        const vars: TicketVars = {
          nombre: body.nombre,
          empresa: body.empresa,
          monto: body.monto || undefined,
          fechaVigencia: body.fecha_vigencia || undefined,
          numUsuarios: body.num_usuarios || undefined,
          fechaCobro: body.fecha_cobro || undefined,
        };
        const ok = await sendWA(supabase, waToken, body.phone, tpl, vars, body.email || "", null, body.monto_centavos || 0);
        return new Response(JSON.stringify({ ok }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: Array<{ id: string; action: string; status: string }> = [];

    // Use Mexico City timezone for all date calculations
    const MX_TZ = "America/Mexico_City";
    const nowMx = new Date().toLocaleDateString("en-CA", { timeZone: MX_TZ }); // YYYY-MM-DD
    const todayStr = nowMx;
    const today = new Date(todayStr + "T12:00:00Z"); // noon UTC as safe reference

    // Load global WhatsApp token (super admin config without empresa_id)
    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const waToken = waConfig?.api_token;

    // Load templates from DB (override defaults)
    const { data: tplRows } = await supabase
      .from("billing_message_templates")
      .select("tipo, campos, emoji, encabezado, activo");
    const tplMap: Record<string, TemplateConfig> = { ...DEFAULT_TEMPLATES };
    for (const row of tplRows || []) {
      tplMap[row.tipo] = {
        tipo: row.tipo,
        campos: row.campos as Record<string, boolean>,
        emoji: row.emoji,
        encabezado: row.encabezado || DEFAULT_TEMPLATES[row.tipo]?.encabezado || "",
        activo: row.activo,
      };
    }

    // ═══════════════════════════════════════════════
    // STEP 0: TRIAL EXPIRATION NOTIFICATIONS
    // ═══════════════════════════════════════════════

    // Trials expiring TOMORROW
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: trialsExpiringTomorrow } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at, max_usuarios")
      .eq("status", "trial")
      .gte("trial_ends_at", `${tomorrowStr}T00:00:00`)
      .lt("trial_ends_at", `${tomorrowStr}T23:59:59`);

    for (const sub of trialsExpiringTomorrow || []) {
      try {
        const profile = await getProfileForEmpresa(supabase, sub.empresa_id);
        if (!profile?.email) continue;
        if (await alreadyNotifiedToday(supabase, profile.email, "trial_expira_manana")) continue;

        const empresaNombre = await getEmpresaName(supabase, sub.empresa_id);
        const tpl = tplMap.trial_expira_manana || DEFAULT_TEMPLATES.trial_expira_manana;

        if (waToken && profile.telefono && tpl.activo) {
          await sendWA(supabase, waToken, profile.telefono, tpl, {
            nombre: profile.nombre || "",
            empresa: empresaNombre,
            enlaceFacturacion: FACTURACION_URL,
          }, profile.email);
        }
        results.push({ id: sub.id, action: "trial_expira_manana", status: "sent" });
      } catch (err) {
        console.error("Trial tomorrow error:", err);
        results.push({ id: sub.id, action: "trial_expira_manana", status: "error" });
      }
    }

    // Trials EXPIRED TODAY (or recently) — still in trial status
    const { data: trialsExpiredToday } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at, max_usuarios")
      .eq("status", "trial")
      .lt("trial_ends_at", `${todayStr}T23:59:59`)
      .gte("trial_ends_at", new Date(today.getTime() - GRACE_DAYS * 86400000).toISOString());

    for (const sub of trialsExpiredToday || []) {
      try {
        const trialEnd = new Date(sub.trial_ends_at);
        if (trialEnd > today) continue; // Not yet expired

        const profile = await getProfileForEmpresa(supabase, sub.empresa_id);
        if (!profile?.email) continue;
        if (await alreadyNotifiedToday(supabase, profile.email, "trial_expirado")) continue;

        const empresaNombre = await getEmpresaName(supabase, sub.empresa_id);
        const tpl = tplMap.trial_expirado || DEFAULT_TEMPLATES.trial_expirado;

        if (waToken && profile.telefono && tpl.activo) {
          await sendWA(supabase, waToken, profile.telefono, tpl, {
            nombre: profile.nombre || "",
            empresa: empresaNombre,
            enlaceFacturacion: FACTURACION_URL,
          }, profile.email);
        }

        // Update status to gracia
        await supabase.from("subscriptions").update({
          status: "gracia",
          updated_at: new Date().toISOString(),
        }).eq("id", sub.id).eq("status", "trial");

        results.push({ id: sub.id, action: "trial_expirado", status: "sent" });
      } catch (err) {
        console.error("Trial expired error:", err);
        results.push({ id: sub.id, action: "trial_expirado", status: "error" });
      }
    }

    // ═══════════════════════════════════════════════
    // STEP 1: PRE-CHARGE (day before the 1st)
    // ═══════════════════════════════════════════════
    if (tomorrow.getDate() === 1 && tplMap.pre_cobro.activo) {
      const tpl = tplMap.pre_cobro;
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, status")
        .eq("status", "active");

      for (const sub of activeSubs || []) {
        try {
          const profile = await getProfileForEmpresa(supabase, sub.empresa_id);
          if (!profile?.email) continue;
          if (await alreadyNotifiedToday(supabase, profile.email, "pre_cobro")) continue;

          const amount = sub.max_usuarios * 300;
          const empresaNombre = await getEmpresaName(supabase, sub.empresa_id);

          if (waToken && profile.telefono) {
            await sendWA(supabase, waToken, profile.telefono, tpl, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: `$${amount.toLocaleString("es-MX")} MXN`,
              fechaCobro: `1 de ${getMonthName()}`,
              numUsuarios: sub.max_usuarios,
              enlaceFacturacion: FACTURACION_URL,
            }, profile.email, null, amount * 100);
          }
          results.push({ id: sub.id, action: "pre_notify", status: "sent" });
        } catch (err) {
          console.error("Pre-notify error:", err);
          results.push({ id: sub.id, action: "pre_notify", status: "error" });
        }
      }
    }

    // ═══════════════════════════════════════════════
    // STEP 2: CHECK STRIPE CHARGES (1st-2nd of month)
    // ═══════════════════════════════════════════════
    if (today.getDate() === 1 || today.getDate() === 2) {
      const recentInvoices = await stripe.invoices.list({
        limit: 100,
        created: { gte: Math.floor(new Date(today.getFullYear(), today.getMonth(), 1).getTime() / 1000) },
        expand: ["data.lines.data.price"],
      });

      for (const inv of recentInvoices.data) {
        if (!inv.lines?.data?.length) continue;
        const isRutapp = inv.lines.data.some((line: any) => {
          const pid = typeof line.price?.product === "string" ? line.price.product : line.price?.product?.id;
          return pid && RUTAPP_PRODUCT_IDS.has(pid);
        });
        if (!isRutapp || !inv.customer_email) continue;

        const { data: allUsers } = await supabase.auth.admin.listUsers();
        const matchUser = allUsers?.users?.find((u: any) => u.email === inv.customer_email);
        if (!matchUser) continue;

        const { data: profile } = await supabase.from("profiles").select("empresa_id, telefono, nombre").eq("user_id", matchUser.id).maybeSingle();
        if (!profile) continue;

        const empresaNombre = await getEmpresaName(supabase, profile.empresa_id);

        if (inv.status === "paid" && tplMap.cobro_exitoso.activo) {
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_start: todayStr,
            current_period_end: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          }).eq("empresa_id", profile.empresa_id);

          if (waToken && profile.telefono) {
            await sendWA(supabase, waToken, profile.telefono, tplMap.cobro_exitoso, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: `$${(inv.amount_paid / 100).toLocaleString("es-MX")} MXN`,
              fechaVigencia: `1 de ${getMonthName(2)}`,
            }, inv.customer_email!, inv.hosted_invoice_url, inv.amount_paid);
          }
          results.push({ id: profile.empresa_id, action: "payment_confirmed", status: "sent" });

        } else if ((inv.status === "open" || inv.status === "uncollectible") && tplMap.cobro_fallido.activo) {
          await supabase.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("empresa_id", profile.empresa_id);

          if (waToken && profile.telefono) {
            await sendWA(supabase, waToken, profile.telefono, tplMap.cobro_fallido, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: `$${(inv.amount_due / 100).toLocaleString("es-MX")} MXN`,
              enlacePago: inv.hosted_invoice_url || FACTURACION_URL,
            }, inv.customer_email!, inv.hosted_invoice_url, inv.amount_due);
          }
          results.push({ id: profile.empresa_id, action: "payment_failed", status: "sent" });
        }
      }
    }

    // ═══════════════════════════════════════════════
    // STEP 3: SUSPEND AFTER GRACE (trial + past_due)
    // ═══════════════════════════════════════════════
    const graceCutoff = new Date(today);
    graceCutoff.setDate(graceCutoff.getDate() - GRACE_DAYS);

    // Past due subs
    const { data: pastDueSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, updated_at")
      .eq("status", "past_due")
      .lt("updated_at", graceCutoff.toISOString());

    for (const sub of pastDueSubs || []) {
      await supabase.from("subscriptions").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", sub.id);
      const profile = await getProfileForEmpresa(supabase, sub.empresa_id);
      if (waToken && profile?.telefono && tplMap.suspension.activo) {
        const empresaNombre = await getEmpresaName(supabase, sub.empresa_id);
        await sendWA(supabase, waToken, profile.telefono, tplMap.suspension, {
          nombre: profile.nombre || "",
          empresa: empresaNombre,
          enlaceFacturacion: FACTURACION_URL,
        }, profile.email || "desconocido");
      }
      results.push({ id: sub.id, action: "suspended", status: "done" });
    }

    // Gracia subs (expired trials) past grace period
    const { data: graciaSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at")
      .eq("status", "gracia");

    for (const sub of graciaSubs || []) {
      const trialEnd = new Date(sub.trial_ends_at);
      const daysSinceExpiry = Math.floor((today.getTime() - trialEnd.getTime()) / 86400000);
      if (daysSinceExpiry <= GRACE_DAYS) continue;

      await supabase.from("subscriptions").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", sub.id);
      const profile = await getProfileForEmpresa(supabase, sub.empresa_id);
      if (waToken && profile?.telefono && tplMap.suspension.activo) {
        const empresaNombre = await getEmpresaName(supabase, sub.empresa_id);
        await sendWA(supabase, waToken, profile.telefono, tplMap.suspension, {
          nombre: profile.nombre || "",
          empresa: empresaNombre,
          enlaceFacturacion: FACTURACION_URL,
        }, profile.email || "desconocido");
      }
      results.push({ id: sub.id, action: "trial_suspended", status: "done" });
    }

    return new Response(JSON.stringify({ ok: true, results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error billing-notify:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
