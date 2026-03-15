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

interface TemplateConfig {
  tipo: string;
  campos: Record<string, boolean>;
  emoji: string;
  encabezado: string;
  activo: boolean;
}

/* ─── Build message from template config ─── */
function buildMessage(
  tpl: TemplateConfig,
  vars: {
    nombre?: string;
    empresa?: string;
    monto?: string;
    fecha_cobro?: string;
    num_usuarios?: number;
    enlace_facturacion?: string;
    enlace_pago?: string;
    fecha_vigencia?: string;
  }
): string {
  const c = tpl.campos;
  const lines: string[] = [];
  lines.push(`${tpl.emoji} *${tpl.encabezado}*\n`);

  const greeting = c.nombre_cliente && vars.nombre ? `Hola ${vars.nombre}` : "Hola";
  const empresaLine = c.nombre_empresa && vars.empresa ? ` de *${vars.empresa}*` : "";

  if (tpl.tipo === "pre_cobro") {
    lines.push(`${greeting}${empresaLine},\n`);
    if (c.fecha_cobro && vars.fecha_cobro) lines.push(`Mañana *${vars.fecha_cobro}* se realizará tu cobro automático`);
    if (c.monto && vars.monto) lines.push(`de *${vars.monto}*`);
    if (c.num_usuarios && vars.num_usuarios) lines.push(`por *${vars.num_usuarios} usuario(s)*.`);
    else lines.push(".");
    if (c.enlace_facturacion && vars.enlace_facturacion) lines.push(`\n💳 Si necesitas actualizar tu método de pago:\n${vars.enlace_facturacion}`);
    if (c.mensaje_despedida) lines.push("\n¡Gracias por confiar en Rutapp! 🚀");
  }

  if (tpl.tipo === "cobro_exitoso") {
    lines.push(`${greeting}${empresaLine},\n`);
    if (c.monto && vars.monto) lines.push(`Tu pago de *${vars.monto}* se procesó correctamente.`);
    else lines.push("Tu pago se procesó correctamente.");
    if (c.fecha_vigencia && vars.fecha_vigencia) lines.push(`\nTu suscripción está activa hasta el *${vars.fecha_vigencia}*.`);
    if (c.mensaje_despedida) lines.push("\n¡Gracias! 🎉");
  }

  if (tpl.tipo === "cobro_fallido") {
    lines.push(`${greeting}${empresaLine},\n`);
    lines.push("No pudimos procesar tu pago.");
    if (c.monto && vars.monto) lines.push(`Monto pendiente: *${vars.monto}*.`);
    if (c.dias_gracia) lines.push(`Tienes *${GRACE_DAYS} días* para regularizar tu pago.`);
    if (c.enlace_pago && vars.enlace_pago) lines.push(`\n💳 Paga aquí:\n${vars.enlace_pago}`);
    if (c.advertencia_suspension) lines.push("\n⚠️ Si no regularizas, tu acceso será suspendido.");
  }

  if (tpl.tipo === "suspension") {
    lines.push(`${greeting}${empresaLine},\n`);
    lines.push("Tu cuenta ha sido *suspendida* por falta de pago.");
    if (c.enlace_facturacion && vars.enlace_facturacion) lines.push(`\nPara reactivar tu acceso:\n${vars.enlace_facturacion}`);
    if (c.mensaje_contacto) lines.push("\nSi tienes dudas, contáctanos.");
  }

  return lines.join("\n");
}

/* ─── Fallback templates if DB has none ─── */
const DEFAULT_TEMPLATES: Record<string, TemplateConfig> = {
  pre_cobro: { tipo: "pre_cobro", emoji: "🔔", encabezado: "Aviso de cobro Rutapp", activo: true, campos: { nombre_cliente: true, nombre_empresa: true, monto: true, fecha_cobro: true, num_usuarios: true, enlace_facturacion: true, mensaje_despedida: true } },
  cobro_exitoso: { tipo: "cobro_exitoso", emoji: "✅", encabezado: "Pago exitoso — Rutapp", activo: true, campos: { nombre_cliente: true, nombre_empresa: true, monto: true, fecha_vigencia: true, mensaje_despedida: true } },
  cobro_fallido: { tipo: "cobro_fallido", emoji: "⚠️", encabezado: "Cobro fallido — Rutapp", activo: true, campos: { nombre_cliente: true, nombre_empresa: true, monto: true, dias_gracia: true, enlace_pago: true, advertencia_suspension: true } },
  suspension: { tipo: "suspension", emoji: "🔴", encabezado: "Cuenta suspendida — Rutapp", activo: true, campos: { nombre_cliente: true, nombre_empresa: true, enlace_facturacion: true, mensaje_contacto: true } },
};

async function sendWhatsApp(waToken: string, phone: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(WHATSAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": waToken },
      body: JSON.stringify({ action: "send-text", phone, message }),
    });
    return res.ok;
  } catch (e) {
    console.error("WhatsApp send error:", e);
    return false;
  }
}

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

    // Load message templates from DB
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

    // Helper to get empresa name
    async function getEmpresaName(empresaId: string): Promise<string> {
      const { data } = await supabase.from("empresas").select("nombre").eq("id", empresaId).maybeSingle();
      return data?.nombre || "";
    }

    // ─── STEP 1: Pre-charge notifications (day before the 1st) ───
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() === 1 && tplMap.pre_cobro.activo) {
      const tpl = tplMap.pre_cobro;
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, stripe_subscription_id, status")
        .in("status", ["active", "trial"]);

      for (const sub of activeSubs || []) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id, nombre, telefono")
            .eq("empresa_id", sub.empresa_id)
            .limit(1)
            .maybeSingle();
          if (!profile) continue;

          const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
          const email = userData?.user?.email;
          if (!email) continue;

          const amount = sub.max_usuarios * 300;
          const amountFmt = `$${amount.toLocaleString("es-MX")} MXN`;
          const empresaNombre = await getEmpresaName(sub.empresa_id);

          const msg = buildMessage(tpl, {
            nombre: profile.nombre || "",
            empresa: empresaNombre,
            monto: amountFmt,
            fecha_cobro: `1 de ${getMonthName()}`,
            num_usuarios: sub.max_usuarios,
            enlace_facturacion: FACTURACION_URL,
          });

          if (waToken && profile.telefono) {
            const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
            const ok = await sendWhatsApp(waToken, phone, msg);
            await supabase.from("billing_notifications").insert({
              customer_email: email, customer_phone: phone, channel: "whatsapp",
              tipo: "pre_cobro", mensaje: msg, monto_centavos: amount * 100,
              status: ok ? "sent" : "error",
            }).catch(() => {});
          }
          results.push({ sub_id: sub.id, action: "pre_notify", status: "sent" });
        } catch (err) {
          console.error(`Pre-notify error for sub ${sub.id}:`, err);
          results.push({ sub_id: sub.id, action: "pre_notify", status: "error" });
        }
      }
    }

    // ─── STEP 2: Check charges (1st or 2nd of month) ───
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
        if (!isRutapp) continue;

        const customerEmail = inv.customer_email;
        if (!customerEmail) continue;

        const { data: allUsers } = await supabase.auth.admin.listUsers();
        const matchUser = allUsers?.users?.find((u: any) => u.email === customerEmail);
        if (!matchUser) continue;

        const { data: profile } = await supabase
          .from("profiles")
          .select("empresa_id, telefono, nombre")
          .eq("user_id", matchUser.id)
          .maybeSingle();
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
            const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
            const amountFmt = `$${(inv.amount_paid / 100).toLocaleString("es-MX")} MXN`;
            const msg = buildMessage(tplMap.cobro_exitoso, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: amountFmt,
              fecha_vigencia: `1 de ${getNextMonthName()}`,
            });
            const ok = await sendWhatsApp(waToken, phone, msg);
            await supabase.from("billing_notifications").insert({
              customer_email: customerEmail, customer_phone: phone, channel: "whatsapp",
              tipo: "cobro_exitoso", mensaje: msg, monto_centavos: inv.amount_paid,
              stripe_invoice_url: inv.hosted_invoice_url || null,
              status: ok ? "sent" : "error",
            }).catch(() => {});
          }
          results.push({ email: customerEmail, action: "payment_confirmed" });

        } else if ((inv.status === "open" || inv.status === "uncollectible") && tplMap.cobro_fallido.activo) {
          await supabase.from("subscriptions").update({
            status: "past_due", updated_at: new Date().toISOString(),
          }).eq("empresa_id", profile.empresa_id);

          if (waToken && profile.telefono) {
            const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
            const amountFmt = `$${(inv.amount_due / 100).toLocaleString("es-MX")} MXN`;
            const msg = buildMessage(tplMap.cobro_fallido, {
              nombre: profile.nombre || "",
              empresa: empresaNombre,
              monto: amountFmt,
              enlace_pago: inv.hosted_invoice_url || FACTURACION_URL,
            });
            const ok = await sendWhatsApp(waToken, phone, msg);
            await supabase.from("billing_notifications").insert({
              customer_email: customerEmail, customer_phone: phone, channel: "whatsapp",
              tipo: "cobro_fallido", mensaje: msg,
              stripe_invoice_url: inv.hosted_invoice_url || null,
              monto_centavos: inv.amount_due, status: ok ? "sent" : "error",
            }).catch(() => {});
          }
          results.push({ email: customerEmail, action: "payment_failed" });
        }
      }
    }

    // ─── STEP 3: Suspend after grace period ───
    const graceCutoff = new Date(today);
    graceCutoff.setDate(graceCutoff.getDate() - GRACE_DAYS);
    const graceCutoffStr = graceCutoff.toISOString();

    const { data: pastDueSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, updated_at")
      .eq("status", "past_due")
      .lt("updated_at", graceCutoffStr);

    for (const sub of pastDueSubs || []) {
      await supabase.from("subscriptions").update({
        status: "suspended", updated_at: new Date().toISOString(),
      }).eq("id", sub.id);

      if (tplMap.suspension.activo) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, telefono, nombre")
          .eq("empresa_id", sub.empresa_id)
          .limit(1)
          .maybeSingle();

        if (waToken && profile?.telefono) {
          const phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
          const empresaNombre = await getEmpresaName(sub.empresa_id);
          const msg = buildMessage(tplMap.suspension, {
            nombre: profile.nombre || "",
            empresa: empresaNombre,
            enlace_facturacion: FACTURACION_URL,
          });
          const ok = await sendWhatsApp(waToken, phone, msg);

          const { data: suspProfile } = await supabase.auth.admin.getUserById(profile.user_id);
          await supabase.from("billing_notifications").insert({
            customer_email: suspProfile?.user?.email || "desconocido",
            customer_phone: phone, channel: "whatsapp",
            tipo: "suspension", mensaje: msg, status: ok ? "sent" : "error",
          }).catch(() => {});
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
  const nextMonth = (new Date().getMonth() + 2) % 12;
  return months[nextMonth];
}
