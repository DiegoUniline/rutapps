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

      // Get the price amount + currency from Stripe (source of truth)
      const stripePrice = await stripe.prices.retrieve(price_id);
      monthlyPriceCentavos = stripePrice.unit_amount || 0;
      var planCurrency: string = stripePrice.currency || "mxn";
      if (monthlyPriceCentavos <= 0) {
        throw new Error(`Stripe price ${price_id} returned unit_amount=0. Configuración de plan inválida.`);
      }
    } else {
      throw new Error("empresa_id requerido");
    }

    log("Grace check", { daysSinceExpiry, isWithinGrace, monthlyPriceCentavos, planCurrency });

    // ─── Calculate billing ───
    // POLICY:
    // - Día 1-4 del mes (dentro de gracia): MES COMPLETO (1° → fin de mes)
    // - Día 5+ (fuera de gracia, suspendido): solo días de uso (3 gracia + hoy → fin de mes)
    // - Próximo 1° del mes: ciclo normal vuelve a cobrar mes completo
    //
    // Implementación: la suscripción recurrente tiene billing_cycle_anchor en el próximo día 1°
    // y proration_behavior="none" => Stripe NO cobra nada por el ítem recurrente HOY.
    // El primer cobro se hace mediante un Price one-shot inline añadido como segundo line_item.
    const now = new Date();
    const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysFromTodayToEndOfMonth = daysInMonth - dayOfMonth + 1; // incluye hoy
    const dailyRateCentavos = Math.round(monthlyPriceCentavos / daysInMonth);

    // Política temporal acordada: cobrar siempre el plan completo en el primer checkout.
    // (El descuento por días no usados al reactivar lo afinamos después.)
    let firstChargeCentavos = monthlyPriceCentavos * quantity;
    let firstChargeDescription = `Suscripción mensual (${quantity} usuario${quantity > 1 ? "s" : ""})`;

    // Create an inline one-shot Price (no recurring) in the plan's own currency.
    // Stripe Checkout will sum it with the recurring line_item and charge it NOW.
    let firstPeriodLineItem: any = null;
    if (firstChargeCentavos > 0) {
      const oneShotPrice = await stripe.prices.create({
        currency: planCurrency,
        unit_amount: Math.round(firstChargeCentavos / quantity),
        product_data: { name: firstChargeDescription },
      });
      firstPeriodLineItem = { price: oneShotPrice.id, quantity };
      log("Created first-period inline price", { priceId: oneShotPrice.id, firstChargeCentavos, quantity, planCurrency });
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

    const lineItems: any[] = [{ price: price_id, quantity }];
    if (firstPeriodLineItem) lineItems.push(firstPeriodLineItem);

    const sessionParams: any = {
      customer: customerId,
      line_items: lineItems,
      mode: "subscription",
      subscription_data: {
        billing_cycle_anchor: Math.floor(nextFirst.getTime() / 1000),
        // proration_behavior is incompatible with one-time line_items in Checkout;
        // we instead use billing_cycle_anchor + a one-shot line_item to charge the first period.
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
