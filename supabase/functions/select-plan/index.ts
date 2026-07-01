import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[SELECT-PLAN] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const FACTURACION_URL = "https://rutapp.mx/mi-suscripcion";

async function sendWA(waToken: string, phone: string, message: string): Promise<boolean> {
  try {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No autenticado");

    const { plan_id, num_usuarios } = await req.json();
    if (!plan_id) throw new Error("plan_id requerido");

    const origin = req.headers.get("origin") || "https://rutapp.mx";

    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id, nombre, telefono")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    const { data: currentSub } = await supabase
      .from("subscriptions")
      .select("id, legacy_pricing, descuento_porcentaje, stripe_customer_id")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();

    const { count: activeProfilesCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", profile.empresa_id)
      .eq("estado", "activo");
    const realUsers = activeProfilesCount ?? 0;
    const requested = parseInt(num_usuarios) || 0;

    // Plan
    let plan: any = null;
    const { data: spPlan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .maybeSingle();
    if (spPlan) {
      plan = spPlan;
    } else {
      const { data: legacyPlan } = await supabase
        .from("planes")
        .select("*")
        .eq("id", plan_id)
        .eq("activo", true)
        .maybeSingle();
      if (legacyPlan) {
        plan = {
          ...legacyPlan,
          precio_por_usuario: legacyPlan.precio_base_mes,
          usuarios_incluidos: 0,
          precio_base: 0,
          precio_extra_usuario: legacyPlan.precio_base_mes,
        };
      }
    }
    if (!plan) throw new Error("Plan no encontrado");

    // New plan = tiene slug. Legacy = no slug.
    const isNewPlan = !!plan.slug;
    const stayingInLegacy = currentSub?.legacy_pricing === true && !isNewPlan;

    const minQty = stayingInLegacy ? 3 : Math.max(1, plan.usuarios_incluidos || 1);
    const qty = Math.max(minQty, realUsers, requested);

    // Pricing
    let subtotal: number;
    let precioUnitarioForInvoice: number;
    let extraUsers = 0;
    if (isNewPlan) {
      extraUsers = Math.max(0, qty - (plan.usuarios_incluidos || 0));
      subtotal = Number(plan.precio_base || 0) + extraUsers * Number(plan.precio_extra_usuario || 0);
      precioUnitarioForInvoice = qty > 0 ? Math.round((subtotal / qty) * 100) / 100 : Number(plan.precio_base || 0);
    } else {
      precioUnitarioForInvoice = Number(plan.precio_por_usuario || 300);
      subtotal = precioUnitarioForInvoice * qty;
    }

    log("Plan selected", { plan: plan.nombre, qty, isNewPlan, extraUsers, subtotal });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    const diaActual = now.getDate();
    const diasRestantes = diasEnMes - diaActual + 1;
    const esProrrateo = diaActual !== 1;

    const total = esProrrateo
      ? Math.round((subtotal / diasEnMes) * diasRestantes * 100) / 100
      : subtotal;

    const periodoInicio = now.toISOString().slice(0, 10);
    const primeroDeSiguiente = new Date(year, month + 1, 1);
    const periodoFin = new Date(primeroDeSiguiente.getTime() - 86400000).toISOString().slice(0, 10);

    const { error: subErr } = await supabase
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        status: "pendiente_pago",
        max_usuarios: qty,
        es_manual: true,
        legacy_pricing: stayingInLegacy, // si elige plan nuevo, deja de ser legacy
        updated_at: new Date().toISOString(),
        current_period_end: primeroDeSiguiente.toISOString(),
      })
      .eq("empresa_id", profile.empresa_id);
    if (subErr) log("Sub update error", subErr);

    await supabase
      .from("facturas")
      .delete()
      .eq("empresa_id", profile.empresa_id)
      .eq("estado", "pendiente");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();

    const { data: factura, error: facErr } = await supabase
      .from("facturas")
      .insert({
        empresa_id: profile.empresa_id,
        suscripcion_id: sub?.id || null,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        num_usuarios: qty,
        precio_unitario: precioUnitarioForInvoice,
        subtotal,
        total,
        estado: "pendiente",
        es_prorrateo: esProrrateo,
        fecha_vencimiento: new Date(now.getTime() + 3 * 86400000).toISOString(),
      })
      .select()
      .single();

    if (facErr) {
      log("Invoice creation error", facErr);
      throw new Error("Error creando factura");
    }

    // Stripe checkout
    let stripeCheckoutUrl = "";
    if (plan.stripe_price_id) {
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

          const email = userData.user.email!;
          const customers = await stripe.customers.list({ email, limit: 1 });
          let customerId: string;
          if (customers.data.length > 0) {
            customerId = customers.data[0].id;
          } else {
            const nc = await stripe.customers.create({
              email,
              metadata: { empresa_id: profile.empresa_id },
            });
            customerId = nc.id;
          }

          // 1° del mes siguiente a las 08:00 CDMX (= 14:00 UTC) para evitar
          // que Stripe cobre en la madrugada mexicana.
          const nextFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 14, 0, 0));

          let discounts: any[] = [];
          const descPct = currentSub?.descuento_porcentaje || 0;
          if (descPct > 0) {
            const coupon = await stripe.coupons.create({
              percent_off: descPct,
              duration: "forever",
              name: `Descuento ${descPct}% - ${profile.empresa_id.slice(0, 8)}`,
            });
            discounts = [{ coupon: coupon.id }];
          }

          const lineItems: any[] = [];
          if (isNewPlan) {
            lineItems.push({ price: plan.stripe_price_id, quantity: 1 });
            if (extraUsers > 0 && plan.stripe_price_id_extra) {
              lineItems.push({ price: plan.stripe_price_id_extra, quantity: extraUsers });
            }
          } else {
            lineItems.push({ price: plan.stripe_price_id, quantity: qty });
          }

          const sessionParams: any = {
            customer: customerId,
            line_items: lineItems,
            mode: "subscription",
            subscription_data: {
              billing_cycle_anchor: Math.floor(nextFirst.getTime() / 1000),
              proration_behavior: "create_prorations",
              metadata: {
                empresa_id: profile.empresa_id,
                plan_id: plan.id,
                num_usuarios: String(qty),
                plan_slug: plan.slug || "",
              },
            },
            metadata: {
              empresa_id: profile.empresa_id,
              plan_id: plan.id,
              num_usuarios: String(qty),
              plan_slug: plan.slug || "",
            },
            success_url: `${origin}/dashboard?checkout=success`,
            cancel_url: `${origin}/mi-suscripcion?checkout=cancelled`,
          };
          if (discounts.length > 0) sessionParams.discounts = discounts;

          const session = await stripe.checkout.sessions.create(sessionParams);
          stripeCheckoutUrl = session.url || "";
          await supabase
            .from("subscriptions")
            .update({
              ultimo_checkout_session_id: session.id,
              stripe_customer_id: customerId,
              updated_at: new Date().toISOString(),
            })
            .eq("empresa_id", profile.empresa_id);
        }
      } catch (e) {
        log("Stripe checkout URL generation error (non-blocking)", (e as Error).message);
      }
    }

    // Notifications (WA + email)
    const { data: empresaData } = await supabase
      .from("empresas")
      .select("nombre")
      .eq("id", profile.empresa_id)
      .maybeSingle();
    const empresaNombre = empresaData?.nombre || "tu empresa";

    const payLink = stripeCheckoutUrl || FACTURACION_URL;
    const numFactura = factura.numero_factura || "N/A";
    const fechaLimite = new Date(now.getTime() + 3 * 86400000).toLocaleDateString("es-MX");

    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("api_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (waConfig?.api_token && profile.telefono) {
      const waMsg = [
        `💳 *Nueva factura generada — Rutapp*\n`,
        `Hola ${profile.nombre || ""}`,
        `de *${empresaNombre}*,\n`,
        `Se ha generado tu factura:`,
        `📋 *Factura:* ${numFactura}`,
        `📦 *Plan:* ${plan.nombre} — ${qty} usuario${qty !== 1 ? "s" : ""}${extraUsers > 0 ? ` (${extraUsers} extra)` : ""}`,
        `💰 *Monto:* $${total.toLocaleString()} MXN`,
        esProrrateo ? `📅 *Prorrateo:* ${diasRestantes} días restantes del mes` : "",
        `📅 *Fecha límite:* ${fechaLimite}\n`,
        `Puedes pagar con tarjeta desde aquí:`,
        `👉 ${payLink}\n`,
        `¡Gracias por confiar en Rutapp! 🚀`,
      ].filter(Boolean).join("\n");
      const sent = await sendWA(waConfig.api_token, profile.telefono, waMsg);
      try {
        await supabase.from("billing_notifications").insert({
          customer_email: userData.user.email || "",
          customer_phone: profile.telefono.replace(/[\s\-\(\)]/g, ""),
          channel: "whatsapp",
          tipo: "factura_pendiente",
          mensaje: waMsg,
          monto_centavos: Math.round(total * 100),
          status: sent ? "sent" : "error",
        });
      } catch { /* silent */ }
    }

    if (userData.user.email) {
      try {
        await supabase.functions.invoke("billing-notify-email", {
          body: {
            to: userData.user.email,
            empresa: empresaNombre,
            plan: `${plan.nombre} — ${qty} usuario${qty !== 1 ? "s" : ""}`,
            amount: total,
            url: payLink,
          },
        });
      } catch (e) {
        log("Email notification error (non-blocking)", (e as Error).message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      factura: {
        id: factura.id,
        numero: factura.numero_factura,
        total,
        subtotal,
        es_prorrateo: esProrrateo,
        dias_restantes: diasRestantes,
        dias_en_mes: diasEnMes,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        plan_nombre: plan.nombre,
        num_usuarios: qty,
        usuarios_incluidos: plan.usuarios_incluidos || 0,
        usuarios_extra: extraUsers,
        precio_base: Number(plan.precio_base || 0),
        precio_extra_usuario: Number(plan.precio_extra_usuario || 0),
        precio_unitario: precioUnitarioForInvoice,
      },
      checkout_url: stripeCheckoutUrl || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log("ERROR", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
