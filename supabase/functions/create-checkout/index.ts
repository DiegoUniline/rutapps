import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRACE_DAYS = 3;

const log = (step: string, details?: any) =>
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

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

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("No autenticado");

    const { price_id, quantity, empresa_id } = await req.json();
    if (!price_id || !quantity) throw new Error("price_id y quantity requeridos");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: userData.user.email,
        metadata: { empresa_id: empresa_id || "" },
      });
      customerId = newCustomer.id;
    }

    // ─── Determine grace period status ───
    let daysSinceExpiry = 0;
    let isWithinGrace = true;
    let monthlyPriceCentavos = 0;

    if (empresa_id) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end")
        .eq("empresa_id", empresa_id)
        .maybeSingle();

      if (subData) {
        const now = new Date();
        // Determine when access "expired" (trial end or period end)
        const expiryDate = subData.trial_ends_at
          ? new Date(subData.trial_ends_at)
          : subData.current_period_end
            ? new Date(subData.current_period_end)
            : null;

        if (expiryDate && expiryDate < now) {
          daysSinceExpiry = Math.floor((now.getTime() - expiryDate.getTime()) / 86400000);
          isWithinGrace = daysSinceExpiry <= GRACE_DAYS;
        }
      }

      // Get the price amount from Stripe
      try {
        const stripePrice = await stripe.prices.retrieve(price_id);
        monthlyPriceCentavos = stripePrice.unit_amount || 0;
      } catch {
        monthlyPriceCentavos = 30000; // fallback: $300 MXN
      }
    }

    log("Grace check", { daysSinceExpiry, isWithinGrace, monthlyPriceCentavos });

    // ─── Calculate billing ───
    // POLICY:
    // - Día 1-4 del mes (dentro de gracia): MES COMPLETO (1° → fin de mes)
    // - Día 5+ (fuera de gracia, suspendido): solo días de uso (3 gracia + hoy → fin de mes)
    // - Próximo 1° del mes: ciclo normal vuelve a cobrar mes completo
    //
    // Implementación: usamos proration_behavior="none" en la sub (Stripe NO añade prorrateo)
    // y emitimos un único invoiceItem con el monto exacto a cobrar este primer periodo.
    const now = new Date();
    const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysFromTodayToEndOfMonth = daysInMonth - dayOfMonth + 1; // incluye hoy
    const dailyRateCentavos = Math.round(monthlyPriceCentavos / daysInMonth);

    let firstChargeCentavos = 0;
    let firstChargeDescription = "";

    if (isWithinGrace) {
      // Mes completo
      firstChargeCentavos = monthlyPriceCentavos * quantity;
      firstChargeDescription = `Suscripción mes completo (1 al ${daysInMonth})`;
    } else {
      // 3 días de gracia + desde hoy hasta fin de mes
      const billedDays = GRACE_DAYS + daysFromTodayToEndOfMonth;
      firstChargeCentavos = dailyRateCentavos * billedDays * quantity;
      firstChargeDescription = `Reactivación: ${GRACE_DAYS} días de gracia + uso del día ${dayOfMonth} al ${daysInMonth} (${billedDays} días)`;
    }

    if (firstChargeCentavos > 0 && monthlyPriceCentavos > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: firstChargeCentavos,
        currency: "mxn",
        description: firstChargeDescription,
        metadata: { empresa_id: empresa_id || "", tipo: "primer_periodo" },
      });
      log("Added first-period charge", { firstChargeCentavos, isWithinGrace, billedDays: isWithinGrace ? daysInMonth : (GRACE_DAYS + daysFromTodayToEndOfMonth) });
    }

    // ─── Check for empresa discount (base + coupon) ───
    let discounts: any[] = [];
    if (empresa_id) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("descuento_porcentaje")
        .eq("empresa_id", empresa_id)
        .maybeSingle();

      const baseDescuento = subData?.descuento_porcentaje || 0;

      // Check for active coupon
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
          log("Coupon found", { cuponPct: cuponDescuento, meses: cuponMeses, acumulable: cuponAcumulable });
        }
      }

      // Build Stripe discounts: separate permanent (base) from temporary (coupon)
      if (cuponDescuento > 0 && cuponAcumulable && baseDescuento > 0) {
        // Both active and accumulate: create two separate Stripe coupons
        const baseCoupon = await stripe.coupons.create({
          percent_off: baseDescuento,
          duration: "forever",
          name: `Descuento empresa ${baseDescuento}%`,
        });
        discounts.push({ coupon: baseCoupon.id });

        const tempCoupon = await stripe.coupons.create({
          percent_off: cuponDescuento,
          duration: cuponMeses ? "repeating" : "forever",
          ...(cuponMeses ? { duration_in_months: cuponMeses } : {}),
          name: `Cupón ${cuponDescuento}% (${cuponMeses ? cuponMeses + ' meses' : 'permanente'})`,
        });
        discounts.push({ coupon: tempCoupon.id });
        log("Applied accumulated discounts", { base: baseDescuento, cupon: cuponDescuento, meses: cuponMeses });

      } else if (cuponDescuento > 0 && !cuponAcumulable) {
        // Non-accumulative: use whichever is higher
        const finalPct = Math.max(baseDescuento, cuponDescuento);
        const isFromCupon = cuponDescuento >= baseDescuento;
        const coupon = await stripe.coupons.create({
          percent_off: finalPct,
          duration: isFromCupon && cuponMeses ? "repeating" : "forever",
          ...(isFromCupon && cuponMeses ? { duration_in_months: cuponMeses } : {}),
          name: `Descuento ${finalPct}% - ${empresa_id.slice(0, 8)}`,
        });
        discounts = [{ coupon: coupon.id }];
        log("Applied best discount", { finalPct, source: isFromCupon ? 'cupon' : 'base', meses: isFromCupon ? cuponMeses : null });

      } else if (cuponDescuento > 0) {
        // Only coupon, no base
        const coupon = await stripe.coupons.create({
          percent_off: cuponDescuento,
          duration: cuponMeses ? "repeating" : "forever",
          ...(cuponMeses ? { duration_in_months: cuponMeses } : {}),
          name: `Cupón ${cuponDescuento}% (${cuponMeses ? cuponMeses + ' meses' : 'permanente'})`,
        });
        discounts = [{ coupon: coupon.id }];
        log("Applied coupon only", { cuponDescuento, meses: cuponMeses });

      } else if (baseDescuento > 0) {
        // Only base discount, permanent
        const coupon = await stripe.coupons.create({
          percent_off: baseDescuento,
          duration: "forever",
          name: `Descuento empresa ${baseDescuento}%`,
        });
        discounts = [{ coupon: coupon.id }];
        log("Applied base discount only", { baseDescuento });
      }
    }

    const origin = req.headers.get("origin") || "https://rutapp.mx";

    const sessionParams: any = {
      customer: customerId,
      line_items: [{ price: price_id, quantity }],
      mode: "subscription",
      subscription_data: {
        billing_cycle_anchor: Math.floor(nextFirst.getTime() / 1000),
        proration_behavior: "none",
        metadata: { empresa_id: empresa_id || "" },
      },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancelled`,
    };

    if (discounts.length > 0) {
      sessionParams.discounts = discounts;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    log("Checkout created", { sessionId: session.id, isWithinGrace, daysSinceExpiry });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error create-checkout:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
