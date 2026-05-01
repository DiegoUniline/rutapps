import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TZ = "America/Mexico_City";
const GRACE_DAYS_WITH_ACCESS = 3; // días 1, 2 y 3 con acceso

const log = (step: string, details?: any) =>
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

/** Returns Date representing "now" in MX timezone (as if local). */
function nowInMx(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: TZ });
  return new Date(s);
}

/** Last day of given month (1=Jan). Returns local Date at 23:59:59. */
function lastDayOfMonth(year: number, monthZeroBased: number): Date {
  return new Date(year, monthZeroBased + 1, 0, 23, 59, 59);
}

/** First day of NEXT month, midnight, as Unix timestamp (seconds). */
function firstOfNextMonthUnix(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY no configurado");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autenticado");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData.user?.email) throw new Error("No autenticado");

    const { price_id, quantity, empresa_id } = await req.json();
    if (!price_id || !quantity || !empresa_id) {
      throw new Error("price_id, quantity y empresa_id son requeridos");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ── Get Stripe price (source of truth) ──
    const stripePrice = await stripe.prices.retrieve(price_id);
    const monthlyPriceCentavos = stripePrice.unit_amount ?? 0;
    const planCurrency = stripePrice.currency || "mxn";
    if (monthlyPriceCentavos <= 0) {
      return new Response(JSON.stringify({ error: `Precio ${price_id} inválido (unit_amount=0)` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Find or create Stripe customer ──
    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: userData.user.email,
        metadata: { empresa_id },
      });
      customerId = newCustomer.id;
    }

    // ── Compute first-period charge ──
    // Reglas:
    //  • Días 1-4 del mes: cobra MES COMPLETO.
    //  • Día 5+ del mes: cobra (3 días gracia + días desde hoy a fin de mes) × tarifaDiaria.
    //  • La suscripción recurrente arranca el día 1 del mes siguiente vía trial_end
    //    para que Stripe NO sume nada por su cuenta.
    const now = nowInMx();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyRateCentavos = Math.round(monthlyPriceCentavos / daysInMonth);

    let firstChargeCentavos: number;
    let firstChargeDescription: string;

    if (dayOfMonth <= 4) {
      firstChargeCentavos = monthlyPriceCentavos;
      firstChargeDescription = `Suscripción mensual (${quantity} usuario${quantity > 1 ? "s" : ""})`;
    } else {
      // 3 días gracia (1-3) que SÍ tuvo acceso + días desde hoy hasta fin de mes
      const remainingDays = daysInMonth - dayOfMonth + 1; // incluye hoy
      const billedDays = GRACE_DAYS_WITH_ACCESS + remainingDays;
      firstChargeCentavos = dailyRateCentavos * billedDays;
      firstChargeDescription = `Suscripción mensual prorrateada (${billedDays} días, ${quantity} usuario${quantity > 1 ? "s" : ""})`;
    }

    log("Charge calc", {
      dayOfMonth, daysInMonth, monthlyPriceCentavos, firstChargeCentavos,
      quantity, planCurrency
    });

    // ── Create one-shot inline price for the immediate charge ──
    const oneShotPrice = await stripe.prices.create({
      currency: planCurrency,
      unit_amount: firstChargeCentavos, // per-unit; quantity multiplies
      product_data: { name: firstChargeDescription },
    });

    // ── Discounts (base + coupon) ──
    let discounts: any[] = [];
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("descuento_porcentaje")
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    const baseDescuento = subData?.descuento_porcentaje || 0;

    const { data: cuponUso } = await supabase
      .from("cupon_usos")
      .select("meses_restantes, cupones:cupon_id(descuento_pct, acumulable)")
      .eq("empresa_id", empresa_id)
      .order("aplicado_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let cuponDescuento = 0;
    let cuponMeses: number | null = null;
    let cuponAcumulable = false;
    if (cuponUso && (cuponUso.meses_restantes === null || cuponUso.meses_restantes > 0)) {
      const cupon = cuponUso.cupones as any;
      if (cupon) {
        cuponDescuento = cupon.descuento_pct || 0;
        cuponMeses = cuponUso.meses_restantes;
        cuponAcumulable = !!cupon.acumulable;
      }
    }

    if (cuponDescuento > 0 && cuponAcumulable && baseDescuento > 0) {
      const baseCoupon = await stripe.coupons.create({
        percent_off: baseDescuento, duration: "forever",
        name: `Descuento empresa ${baseDescuento}%`,
      });
      discounts.push({ coupon: baseCoupon.id });
      const tempCoupon = await stripe.coupons.create({
        percent_off: cuponDescuento,
        duration: cuponMeses ? "repeating" : "forever",
        ...(cuponMeses ? { duration_in_months: cuponMeses } : {}),
        name: `Cupón ${cuponDescuento}%`,
      });
      discounts.push({ coupon: tempCoupon.id });
    } else if (cuponDescuento > 0 && !cuponAcumulable) {
      const finalPct = Math.max(baseDescuento, cuponDescuento);
      const isFromCupon = cuponDescuento >= baseDescuento;
      const coupon = await stripe.coupons.create({
        percent_off: finalPct,
        duration: isFromCupon && cuponMeses ? "repeating" : "forever",
        ...(isFromCupon && cuponMeses ? { duration_in_months: cuponMeses } : {}),
        name: `Descuento ${finalPct}%`,
      });
      discounts = [{ coupon: coupon.id }];
    } else if (cuponDescuento > 0) {
      const coupon = await stripe.coupons.create({
        percent_off: cuponDescuento,
        duration: cuponMeses ? "repeating" : "forever",
        ...(cuponMeses ? { duration_in_months: cuponMeses } : {}),
        name: `Cupón ${cuponDescuento}%`,
      });
      discounts = [{ coupon: coupon.id }];
    } else if (baseDescuento > 0) {
      const coupon = await stripe.coupons.create({
        percent_off: baseDescuento, duration: "forever",
        name: `Descuento empresa ${baseDescuento}%`,
      });
      discounts = [{ coupon: coupon.id }];
    }

    // ── Build session ──
    // Subscription with trial_end at first day of next month.
    // Stripe will charge ONLY the one-shot now, and start recurring on day 1° next month.
    // No proration, no surprises.
    const origin = req.headers.get("origin") || "https://rutapp.mx";
    const trialEndUnix = firstOfNextMonthUnix(now);

    const sessionParams: any = {
      customer: customerId,
      line_items: [
        { price: price_id, quantity },              // recurrente (mes completo recurrente)
        { price: oneShotPrice.id, quantity },        // cargo inmediato proporcional o mes completo
      ],
      mode: "subscription",
      subscription_data: {
        trial_end: trialEndUnix,
        // Stripe NO permite proration_behavior con trial_end; ya no es necesario porque trial=$0
        metadata: { empresa_id },
      },
      success_url: `${origin}/mi-suscripcion?checkout=success`,
      cancel_url: `${origin}/mi-suscripcion?checkout=cancelled`,
      metadata: { empresa_id },
    };

    if (discounts.length > 0) sessionParams.discounts = discounts;

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Save session ref for webhook reconciliation
    await supabase
      .from("subscriptions")
      .update({ ultimo_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("empresa_id", empresa_id);

    log("Session created", {
      sessionId: session.id,
      firstChargeCentavos,
      trialEndUnix,
      dayOfMonth,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[CREATE-CHECKOUT] ERROR:", error?.message, error);
    return new Response(JSON.stringify({ error: error?.message || "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
