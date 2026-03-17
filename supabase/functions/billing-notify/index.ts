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

/* ─── Theme colors per type ─── */
const THEMES: Record<string, { accent: string; badgeBg: string }> = {
  pre_cobro: { accent: "#2563eb", badgeBg: "#dbeafe" },
  cobro_exitoso: { accent: "#16a34a", badgeBg: "#dcfce7" },
  cobro_fallido: { accent: "#dc2626", badgeBg: "#fee2e2" },
  suspension: { accent: "#991b1b", badgeBg: "#fee2e2" },
};

const STATUS_LABELS: Record<string, string> = {
  pre_cobro: "RECORDATORIO DE COBRO",
  cobro_exitoso: "PAGO CONFIRMADO",
  cobro_fallido: "PAGO FALLIDO",
  suspension: "CUENTA SUSPENDIDA",
};

/* ─── Satori/PNG generation removed — text-only messages ─── */

/* ─── Build text fallback ─── */
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
    if (c.monto && vars.monto) lines.push(`Tu pago de *${vars.monto}* se procesó correctamente.`);
    if (c.fecha_vigencia && vars.fechaVigencia) lines.push(`Vigente hasta el *${vars.fechaVigencia}*.`);
    if (c.mensaje_despedida) lines.push("\n¡Gracias! 🎉");
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
  return lines.join("\n");
}

/* ─── Send WhatsApp (text only) ─── */
async function sendTicketWhatsApp(
  supabase: any,
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

  // Log
  await supabase.from("billing_notifications").insert({
    customer_email: email,
    customer_phone: cleanPhone,
    channel: "whatsapp",
    tipo: tpl.tipo,
    mensaje: textMsg,
    stripe_invoice_url: invoiceUrl || null,
    monto_centavos: amountCents || 0,
    status,
  }).catch(() => {});

  return status === "sent";
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: any[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Load WhatsApp token
    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const waToken = waConfig?.api_token;

    // Load templates
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

    const FACTURACION_URL = "https://rutapps.lovable.app/facturacion";

    async function getEmpresaName(empresaId: string): Promise<string> {
      const { data } = await supabase.from("empresas").select("nombre").eq("id", empresaId).maybeSingle();
      return data?.nombre || "";
    }

    // ─── STEP 1: Pre-charge (day before the 1st) ───
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() === 1 && tplMap.pre_cobro.activo) {
      const tpl = tplMap.pre_cobro;
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, status")
        .in("status", ["active", "trial"]);

      for (const sub of activeSubs || []) {
        try {
          const { data: profile } = await supabase.from("profiles").select("user_id, nombre, telefono").eq("empresa_id", sub.empresa_id).limit(1).maybeSingle();
          if (!profile) continue;
          const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
          const email = userData?.user?.email;
          if (!email) continue;

          const amount = sub.max_usuarios * 300;
          const empresaNombre = await getEmpresaName(sub.empresa_id);

          if (waToken && profile.telefono) {
            await sendTicketWhatsApp(supabase, waToken, profile.telefono, tpl, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: `$${amount.toLocaleString("es-MX")} MXN`,
              fechaCobro: `1 de ${getMonthName()}`,
              numUsuarios: sub.max_usuarios,
              enlaceFacturacion: FACTURACION_URL,
            }, email, null, amount * 100);
          }
          results.push({ sub_id: sub.id, action: "pre_notify", status: "sent" });
        } catch (err) {
          console.error(`Pre-notify error:`, err);
          results.push({ sub_id: sub.id, action: "pre_notify", status: "error" });
        }
      }
    }

    // ─── STEP 2: Check charges ───
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

        const empresaNombre = await getEmpresaName(profile.empresa_id);

        if (inv.status === "paid" && tplMap.cobro_exitoso.activo) {
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_start: todayStr,
            current_period_end: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          }).eq("empresa_id", profile.empresa_id);

          if (waToken && profile.telefono) {
            await sendTicketWhatsApp(supabase, waToken, profile.telefono, tplMap.cobro_exitoso, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: `$${(inv.amount_paid / 100).toLocaleString("es-MX")} MXN`,
              fechaVigencia: `1 de ${getNextMonthName()}`,
            }, inv.customer_email!, inv.hosted_invoice_url, inv.amount_paid);
          }
          results.push({ email: inv.customer_email, action: "payment_confirmed" });

        } else if ((inv.status === "open" || inv.status === "uncollectible") && tplMap.cobro_fallido.activo) {
          await supabase.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("empresa_id", profile.empresa_id);

          if (waToken && profile.telefono) {
            await sendTicketWhatsApp(supabase, waToken, profile.telefono, tplMap.cobro_fallido, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: `$${(inv.amount_due / 100).toLocaleString("es-MX")} MXN`,
              enlacePago: inv.hosted_invoice_url || FACTURACION_URL,
            }, inv.customer_email!, inv.hosted_invoice_url, inv.amount_due);
          }
          results.push({ email: inv.customer_email, action: "payment_failed" });
        }
      }
    }

    // ─── STEP 3: Suspend after grace period ───
    const graceCutoff = new Date(today);
    graceCutoff.setDate(graceCutoff.getDate() - GRACE_DAYS);

    const { data: pastDueSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, updated_at")
      .eq("status", "past_due")
      .lt("updated_at", graceCutoff.toISOString());

    for (const sub of pastDueSubs || []) {
      await supabase.from("subscriptions").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", sub.id);

      if (tplMap.suspension.activo) {
        const { data: profile } = await supabase.from("profiles").select("user_id, telefono, nombre").eq("empresa_id", sub.empresa_id).limit(1).maybeSingle();

        if (waToken && profile?.telefono) {
          const empresaNombre = await getEmpresaName(sub.empresa_id);
          const { data: suspProfile } = await supabase.auth.admin.getUserById(profile.user_id);
          await sendTicketWhatsApp(supabase, waToken, profile.telefono, tplMap.suspension, {
            nombre: profile.nombre || "",
            empresa: empresaNombre,
            enlaceFacturacion: FACTURACION_URL,
          }, suspProfile?.user?.email || "desconocido");
        }
      }
      results.push({ sub_id: sub.id, action: "suspended" });
    }

    return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
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

function getMonthName() {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return months[new Date().getMonth() + 1] || months[0];
}

function getNextMonthName() {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return months[(new Date().getMonth() + 2) % 12];
}
