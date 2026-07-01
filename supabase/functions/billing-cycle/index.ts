import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[BILLING-CYCLE] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

const DIAS_GRACIA = 3;

async function sendWhatsApp(supabase: any, empresaId: string, message: string) {
  try {
    // Get empresa phone from profiles (owner)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("telefono")
      .eq("empresa_id", empresaId)
      .not("telefono", "is", null)
      .limit(1);

    const phone = profiles?.[0]?.telefono;
    if (!phone) return;

    await supabase.functions.invoke("whatsapp-sender", {
      body: { action: "send_text", empresa_id: empresaId, phone, message },
    });
  } catch (e) {
    log("WhatsApp send failed (non-blocking)", { empresaId, error: (e as Error).message });
  }
}

// Retry schedule: attempt 1 = day +1, attempt 2 = day +3, attempt 3 = day +7 (relative to original failure)
// We track by intento_num: 1 → schedule 2 (in 2 days), 2 → schedule 3 (in 4 days), 3 → mark fallido
async function scheduleNextRetry(supabase: any, retry: any, errorMsg: string, now: Date) {
  const nextNum = retry.intento_num + 1;
  if (nextNum > 3) {
    // No more retries — mark this and the chain as failed. WhatsApp + suspend handled by Part 2 (gracia).
    await supabase.from("cobro_reintentos")
      .update({ estado: "fallido", ultimo_error: errorMsg, procesado_at: now.toISOString() })
      .eq("id", retry.id);
    log("Retries exhausted", { facturaId: retry.factura_id });
    return;
  }
  // Days until next retry: from intento 1 (day+1) to intento 2 → +2 more days; intento 2 → intento 3 → +4 more days
  const daysAhead = nextNum === 2 ? 2 : 4;
  const next = new Date(now);
  next.setDate(next.getDate() + daysAhead);

  await supabase.from("cobro_reintentos")
    .update({ estado: "procesado", ultimo_error: errorMsg, procesado_at: now.toISOString() })
    .eq("id", retry.id);

  await supabase.from("cobro_reintentos").insert({
    factura_id: retry.factura_id,
    empresa_id: retry.empresa_id,
    stripe_invoice_id: retry.stripe_invoice_id,
    intento_num: nextNum,
    proxima_fecha: next.toISOString().slice(0, 10),
    estado: "pendiente",
    ultimo_error: errorMsg,
  });
  log("Next retry scheduled", { facturaId: retry.factura_id, intento: nextNum, fecha: next.toISOString().slice(0, 10) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require CRON_SECRET header OR a super admin JWT
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  let authorized = !!(cronSecret && provided && provided === cronSecret);
  if (!authorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: claims } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
        if (claims?.claims?.sub) {
          const { data: isSA } = await sb.rpc("is_super_admin", { p_user_id: claims.claims.sub });
          if (isSA) authorized = true;
        }
      } catch (_) { /* noop */ }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

    const now = new Date();
    // Use Mexico City timezone to determine "today" and day-of-month
    // (otherwise UTC may report day 1 when it's still the last day of prev month in MX,
    //  generating invoices dated the last day of the previous month).
    const TZ_MX = "America/Mexico_City";
    const mxNow = new Date(now.toLocaleString("en-US", { timeZone: TZ_MX }));
    const today = `${mxNow.getFullYear()}-${String(mxNow.getMonth() + 1).padStart(2, "0")}-${String(mxNow.getDate()).padStart(2, "0")}`;
    const isFirstOfMonth = mxNow.getDate() === 1;

    log("Cycle started", { today, isFirstOfMonth });

    // ═══ PART 1: Generate monthly invoices (day 1) ═══
    if (isFirstOfMonth) {
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, stripe_subscription_id, stripe_price_id, plan_id, descuento_porcentaje, status, trial_ends_at, legacy_pricing")
        .in("status", ["active", "past_due", "gracia", "trial"]);

      const subsToInvoice = (activeSubs || []).filter(s => {
        if (s.status === "active") return true;
        if (s.status === "trial") {
          return s.trial_ends_at && new Date(s.trial_ends_at) <= now;
        }
        return true;
      });

      log("Subs to invoice", { count: subsToInvoice.length });

      for (const sub of subsToInvoice) {
        // Stripe handles billing if subscription exists in Stripe
        if (sub.stripe_subscription_id) {
          log("Skipped (Stripe handles billing)", { empresa: sub.empresa_id });
          continue;
        }

        const { data: existingInv } = await supabase
          .from("facturas")
          .select("id")
          .eq("suscripcion_id", sub.id)
          .eq("periodo_inicio", today)
          .in("estado", ["pendiente", "procesando"])
          .limit(1);
        if (existingInv && existingInv.length > 0) {
          log("Skipped (existing invoice)", { empresa: sub.empresa_id });
          continue;
        }

        // Load plan from subscription_plans (new) — fallback to legacy `planes`
        let planRow: any = null;
        let planMeses = 1;
        if (sub.plan_id) {
          const { data: sp } = await supabase
            .from("subscription_plans")
            .select("id, slug, precio_por_usuario, precio_base, precio_extra_usuario, usuarios_incluidos, meses")
            .eq("id", sub.plan_id)
            .maybeSingle();
          if (sp) {
            planRow = sp;
            planMeses = sp.meses || 1;
          } else {
            const { data: legacyPlan } = await supabase
              .from("planes")
              .select("precio_base_mes, meses")
              .eq("id", sub.plan_id)
              .single();
            if (legacyPlan) {
              planRow = {
                slug: null,
                precio_por_usuario: legacyPlan.precio_base_mes,
                precio_base: 0,
                precio_extra_usuario: legacyPlan.precio_base_mes,
                usuarios_incluidos: 0,
              };
              planMeses = legacyPlan.meses || 1;
            }
          }
        }
        if (!planRow) {
          planRow = {
            slug: null,
            precio_por_usuario: 300,
            precio_base: 0,
            precio_extra_usuario: 300,
            usuarios_incluidos: 0,
          };
        }

        const isNewPlan = !!planRow.slug;
        const isLegacy = sub.legacy_pricing === true || !isNewPlan;

        // Recompute seat count
        const { count: activeProfilesCount } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", sub.empresa_id)
          .eq("estado", "activo");
        const realUsers = activeProfilesCount ?? (sub.max_usuarios || 3);
        const minQty = isLegacy ? 3 : Math.max(1, planRow.usuarios_incluidos || 1);
        const qty = Math.max(minQty, realUsers);

        if (qty !== sub.max_usuarios) {
          await supabase.from("subscriptions").update({ max_usuarios: qty }).eq("id", sub.id);
          log("Seat count recomputed", { empresa: sub.empresa_id, prev: sub.max_usuarios, new: qty });
        }

        let descuento = sub.descuento_porcentaje || 0;

        const { data: cuponUso } = await supabase
          .from("cupon_usos")
          .select("id, meses_restantes, cupon_id, cupones:cupon_id(descuento_pct, acumulable)")
          .eq("empresa_id", sub.empresa_id)
          .order("aplicado_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let cuponDescuento = 0;
        if (cuponUso && (cuponUso.meses_restantes === null || cuponUso.meses_restantes > 0)) {
          const cupon = cuponUso.cupones as any;
          if (cupon) {
            cuponDescuento = cupon.descuento_pct || 0;
            if (cupon.acumulable) {
              descuento = Math.min(100, descuento + cuponDescuento);
            } else {
              descuento = Math.max(descuento, cuponDescuento);
            }
          }
          if (cuponUso.meses_restantes !== null) {
            const consumed = Math.min(cuponUso.meses_restantes, planMeses);
            const newMeses = Math.max(0, cuponUso.meses_restantes - consumed);
            await supabase.from("cupon_usos").update({ meses_restantes: newMeses }).eq("id", cuponUso.id);
            if (newMeses <= 0 && cupon?.acumulable) {
              const baseDiscount = sub.descuento_porcentaje || 0;
              await supabase.from("subscriptions").update({ descuento_porcentaje: baseDiscount }).eq("id", sub.id);
            }
          }
        }

        // ─── Subtotal calculation ───
        let subtotal: number;
        let precioUnitario: number;
        if (isNewPlan && !isLegacy) {
          const extras = Math.max(0, qty - (planRow.usuarios_incluidos || 0));
          subtotal = Number(planRow.precio_base || 0) + extras * Number(planRow.precio_extra_usuario || 0);
          precioUnitario = qty > 0 ? Math.round((subtotal / qty) * 100) / 100 : Number(planRow.precio_base || 0);
        } else {
          precioUnitario = Number(planRow.precio_por_usuario || 300);
          subtotal = precioUnitario * qty;
        }
        const total = descuento > 0
          ? Math.round(subtotal * (1 - descuento / 100))
          : subtotal;

        const mesActual = mxNow.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: TZ_MX });
        const lastDay = new Date(mxNow.getFullYear(), mxNow.getMonth() + 1, 0).getDate();
        const periodoFin = `${mxNow.getFullYear()}-${String(mxNow.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        const { data: factura } = await supabase
          .from("facturas")
          .insert({
            empresa_id: sub.empresa_id,
            suscripcion_id: sub.id,
            periodo_inicio: today,
            periodo_fin: periodoFin,
            num_usuarios: qty,
            precio_unitario: precioUnitario,
            descuento_porcentaje: descuento,
            subtotal,
            total,
            estado: "pendiente",
            es_prorrateo: false,
            fecha_vencimiento: new Date(now.getTime() + DIAS_GRACIA * 86400000).toISOString(),
          })
          .select("numero_factura")
          .single();

        const { data: empresa } = await supabase
          .from("empresas")
          .select("nombre")
          .eq("id", sub.empresa_id)
          .single();

        const empresaNombre = empresa?.nombre || "tu empresa";
        const numFactura = factura?.numero_factura || "N/A";

        const fechaLimite = new Date(now.getTime() + DIAS_GRACIA * 86400000).toLocaleDateString("es-MX");
        await sendWhatsApp(supabase, sub.empresa_id,
          `¡Hola! 👋\nSe ha generado tu factura de *${mesActual}* para *${empresaNombre}*.\n📋 *Factura:* ${numFactura}\n💰 *Monto:* $${total.toLocaleString()} MXN\n📅 *Fecha límite:* ${fechaLimite}\nTienes *${DIAS_GRACIA} días de gracia* para realizar tu pago.`
        );

        log("Invoice generated", { empresa: sub.empresa_id, total, numFactura, isNewPlan });
      }
    }


    // ═══ PART 2: Enforce grace period (daily) ═══
    // Check subs in grace/past_due status
    const { data: graceSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, current_period_end, status, stripe_subscription_id, trial_ends_at")
      .in("status", ["past_due", "gracia"]);

    for (const sub of graceSubs || []) {
      // Determine if this is a trial-origin user (never paid)
      const isTrialOrigin = !sub.stripe_subscription_id;

      // For trial-origin users, use trial_ends_at as the reference date
      const refDate = isTrialOrigin && sub.trial_ends_at
        ? new Date(sub.trial_ends_at)
        : sub.current_period_end ? new Date(sub.current_period_end) : null;
      if (!refDate) continue;

      const daysPastDue = Math.floor((now.getTime() - refDate.getTime()) / 86400000);

      const { data: empresa } = await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", sub.empresa_id)
        .single();

      const empresaNombre = empresa?.nombre || "tu empresa";

      if (daysPastDue >= DIAS_GRACIA) {
        // SAFETY: revalidar cobertura real (factura pagada vigente, manual, etc.)
        const { data: cubierta } = await supabase.rpc("tiene_cobertura_vigente", { p_empresa_id: sub.empresa_id });
        if (cubierta === true) {
          await supabase
            .from("subscriptions")
            .update({ status: "active", acceso_bloqueado: false, updated_at: now.toISOString() })
            .eq("id", sub.id);
          log("Skip suspend (cobertura vigente)", { empresa: sub.empresa_id });
          continue;
        }
        // Suspend
        await supabase
          .from("subscriptions")
          .update({ status: "suspended", updated_at: now.toISOString() })
          .eq("id", sub.id);

        if (isTrialOrigin) {
          // Never paid → trial suspension message
          await sendWhatsApp(supabase, sub.empresa_id,
            `👋 *Te extrañamos en Rutapp*\n\nHola, tu periodo de prueba de *${empresaNombre}* terminó y tu acceso ha sido pausado temporalmente.\n\nPero no te preocupes, *todos tus datos están guardados*. Solo activa tu plan y todo estará como lo dejaste:\n\n💳 *Activar mi plan:* https://rutapps.lovable.app/facturacion\n\n📺 Descubre todo lo que Rutapp puede hacer por tu negocio: https://www.youtube.com/@RutAppMx\n\n¿Tienes dudas? Escríbenos, con gusto te ayudamos. 😊`
          );
        } else {
          // Was paying → account suspended message
          await sendWhatsApp(supabase, sub.empresa_id,
            `⚠️ *Suscripción suspendida — Rutapp*\n\nHola, la suscripción de *${empresaNombre}* ha sido *suspendida* por falta de pago.\n\n🔒 Tu acceso ha sido restringido temporalmente.\nPara reactivar:\n1️⃣ Abre la app → *Mi Suscripción*\n2️⃣ Actualiza tu método de pago\n3️⃣ Tu acceso se restaurará al instante ✅\n\nTus datos están seguros. 🔐`
          );
        }

        log("Subscription suspended", { empresa: sub.empresa_id, daysPastDue, isTrialOrigin });
      } else {
        // Send daily grace reminder
        const diasRestantes = DIAS_GRACIA - daysPastDue;

        if (isTrialOrigin) {
          await sendWhatsApp(supabase, sub.empresa_id,
            `👋 *Tu prueba de Rutapp terminó*\n\nHola, el periodo de prueba de *${empresaNombre}* ha finalizado.\n\n⏳ Te quedan *${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}* antes de que tu acceso sea pausado.\n\n💳 Activa tu plan ahora: https://rutapps.lovable.app/facturacion\n\nTus datos están seguros y listos para cuando actives. 😊`
          );
        } else {
          await sendWhatsApp(supabase, sub.empresa_id,
            `¡Hola! 👋\nTe recordamos que el pago de *${empresaNombre}* aún está pendiente.\n⏳ Te quedan *${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}* de gracia antes de la suspensión.\n💳 Actualiza tu método de pago para evitar interrupciones.`
          );
        }

        // Update status to gracia if not already
        if (sub.status !== "gracia") {
          await supabase
            .from("subscriptions")
            .update({ status: "gracia", updated_at: now.toISOString() })
            .eq("id", sub.id);
        }

        log("Grace reminder sent", { empresa: sub.empresa_id, diasRestantes, isTrialOrigin });
      }
    }

    // ═══ PART 3: Trial expiration check (daily) ═══
    // Move expired trials to past_due so Part 2 handles grace + messaging
    const { data: trialSubs } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at")
      .eq("status", "trial")
      .not("trial_ends_at", "is", null);

    for (const sub of trialSubs || []) {
      const trialEnd = new Date(sub.trial_ends_at);
      if (now >= trialEnd) {
        // Move to past_due — Part 2 will handle grace period and messaging
        await supabase
          .from("subscriptions")
          .update({ status: "past_due", updated_at: now.toISOString() })
          .eq("id", sub.id);

        log("Trial expired → past_due", { empresa: sub.empresa_id });
      }
    }

    // ═══ PART 4: Process scheduled retries (daily) ═══
    if (stripe) {
      const { data: retries } = await supabase
        .from("cobro_reintentos")
        .select("id, factura_id, empresa_id, stripe_invoice_id, intento_num, facturas:factura_id(stripe_invoice_id, total)")
        .eq("estado", "pendiente")
        .lte("proxima_fecha", today);

      log("Retries to process", { count: retries?.length || 0 });

      for (const retry of retries || []) {
        const stripeInvId = retry.stripe_invoice_id || (retry.facturas as any)?.stripe_invoice_id;
        if (!stripeInvId) {
          await supabase.from("cobro_reintentos")
            .update({ estado: "fallido", ultimo_error: "Sin stripe_invoice_id", procesado_at: now.toISOString() })
            .eq("id", retry.id);
          continue;
        }

        try {
          // Attempt to pay the invoice using the customer's default payment method
          const paid = await stripe.invoices.pay(stripeInvId);
          log("Retry payment attempt", { retryId: retry.id, invoiceId: stripeInvId, status: paid.status });

          if (paid.status === "paid") {
            await supabase.from("cobro_reintentos")
              .update({ estado: "exitoso", procesado_at: now.toISOString() })
              .eq("id", retry.id);
            // invoice.paid webhook will handle factura update + WhatsApp
          } else {
            // Still not paid — schedule next retry if any remaining
            await scheduleNextRetry(supabase, retry, "Pago no completado", now);
          }
        } catch (e) {
          const msg = (e as Error).message;
          log("Retry failed", { retryId: retry.id, error: msg });
          await scheduleNextRetry(supabase, retry, msg, now);
        }
      }
    }

    // ═══ PART 5: Sync Stripe subscription quantity with active users (daily) ═══
    // Ensures that any extra users added beyond the plan limit get billed on the
    // next Stripe renewal invoice. proration_behavior:"none" => no immediate
    // proration charge; the new quantity simply applies to the upcoming invoice.
    if (stripe) {
      const { data: stripeSubs } = await supabase
        .from("subscriptions")
        .select("id, empresa_id, max_usuarios, stripe_subscription_id, plan_id, legacy_pricing")
        .not("stripe_subscription_id", "is", null)
        .in("status", ["active", "past_due", "gracia"]);

      for (const sub of stripeSubs || []) {
        try {
          // Load plan to know usuarios_incluidos + add-on price
          let planRow: any = null;
          if (sub.plan_id) {
            const { data: sp } = await supabase
              .from("subscription_plans")
              .select("slug, usuarios_incluidos, stripe_price_id, stripe_price_id_extra")
              .eq("id", sub.plan_id)
              .maybeSingle();
            planRow = sp;
          }
          const isNewPlan = !!planRow?.slug && sub.legacy_pricing !== true;

          const { count: activeProfilesCount } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", sub.empresa_id)
            .eq("estado", "activo");
          const realUsers = activeProfilesCount ?? (sub.max_usuarios || 3);
          const minQty = isNewPlan ? Math.max(1, planRow.usuarios_incluidos || 1) : 3;
          const qty = Math.max(minQty, realUsers);

          const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

          if (isNewPlan && planRow.stripe_price_id_extra) {
            // Two-line-item model: base (qty 1) + extras (qty = qty - incluidos)
            const baseItem = stripeSub.items.data.find((it: any) => it.price?.id === planRow.stripe_price_id);
            const extraItem = stripeSub.items.data.find((it: any) => it.price?.id === planRow.stripe_price_id_extra);
            const desiredExtras = Math.max(0, qty - (planRow.usuarios_incluidos || 0));
            const currentExtras = extraItem?.quantity || 0;

            if (desiredExtras !== currentExtras) {
              const items: any[] = [];
              if (baseItem) items.push({ id: baseItem.id, quantity: 1 });
              if (extraItem) {
                if (desiredExtras === 0) items.push({ id: extraItem.id, deleted: true });
                else items.push({ id: extraItem.id, quantity: desiredExtras });
              } else if (desiredExtras > 0) {
                items.push({ price: planRow.stripe_price_id_extra, quantity: desiredExtras });
              }
              await stripe.subscriptions.update(sub.stripe_subscription_id, {
                items,
                proration_behavior: "none",
              });
              log("Stripe extras synced", { empresa: sub.empresa_id, prev: currentExtras, new: desiredExtras });
            }
          } else {
            // Legacy single-item model
            const item = stripeSub.items.data[0];
            if (!item) continue;
            const currentStripeQty = item.quantity || 0;
            if (qty !== currentStripeQty) {
              await stripe.subscriptions.update(sub.stripe_subscription_id, {
                items: [{ id: item.id, quantity: qty }],
                proration_behavior: "none",
              });
              log("Stripe quantity synced (legacy)", { empresa: sub.empresa_id, prev: currentStripeQty, new: qty });
            }
          }

          if (qty !== sub.max_usuarios) {
            await supabase.from("subscriptions").update({ max_usuarios: qty, updated_at: now.toISOString() }).eq("id", sub.id);
          }
          // Sync OK: limpiar cualquier error previo (solo si lo había).
          await supabase.from("subscriptions")
            .update({ stripe_sync_error: null, stripe_sync_error_at: null })
            .eq("id", sub.id)
            .not("stripe_sync_error", "is", null);
        } catch (e) {
          const msg = (e as Error).message || "Error desconocido";
          log("Stripe sync failed (non-blocking)", { empresa: sub.empresa_id, error: msg });
          // Guardar el error para que el super admin lo vea en el panel
          // (antes fallaba callado y la cantidad quedaba vieja → cobraba de más).
          await supabase.from("subscriptions")
            .update({ stripe_sync_error: msg.slice(0, 500), stripe_sync_error_at: now.toISOString() })
            .eq("id", sub.id);
        }
      }
    }


    log("Cycle completed");

    return new Response(JSON.stringify({ success: true, timestamp: now.toISOString() }), {
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
