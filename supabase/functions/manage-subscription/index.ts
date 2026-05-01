import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No autenticado");

    const body = await req.json();
    const { action, new_quantity, new_price_id, reason, reason_detail } = body;

    // Get user's empresa
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    // Get subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id, stripe_customer_id, max_usuarios")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();
    if (!sub) throw new Error("Sin suscripción");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Helper: count active users for the empresa
    async function countActiveUsers(): Promise<number> {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", profile.empresa_id)
        .eq("estado", "activo");
      return count || 0;
    }

    /* ─── Preview quantity change (no side effects) ─── */
    if (action === "preview_quantity") {
      const qty = parseInt(new_quantity);
      if (!qty || qty < 3) throw new Error("Mínimo 3 usuarios");

      const currentQty = sub.max_usuarios || 3;
      const activeUsers = await countActiveUsers();
      const isUpgrade = qty > currentQty;
      const isDowngrade = qty < currentQty;

      // Block downgrade if active users > target
      if (isDowngrade && activeUsers > qty) {
        return new Response(JSON.stringify({
          success: false,
          can_apply: false,
          reason: "too_many_active_users",
          active_users: activeUsers,
          required_to_deactivate: activeUsers - qty,
          message: `Tienes ${activeUsers} usuarios activos. Desactiva al menos ${activeUsers - qty} antes de bajar a ${qty}.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let preview: any = {
        success: true,
        can_apply: true,
        current_qty: currentQty,
        new_qty: qty,
        active_users: activeUsers,
        is_upgrade: isUpgrade,
        is_downgrade: isDowngrade,
      };

      if (sub.stripe_subscription_id) {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        const itemId = stripeSub.items.data[0]?.id;
        if (itemId) {
          // Use Stripe upcoming invoice preview to compute prorated charge/credit
          try {
            const upcoming = await stripe.invoices.createPreview({
              subscription: sub.stripe_subscription_id,
              subscription_details: {
                items: [{ id: itemId, quantity: qty }],
                proration_behavior: isUpgrade ? "always_invoice" : "create_prorations",
              },
            });
            // Sum proration line items (immediate effect)
            const prorationLines = (upcoming.lines?.data || []).filter((l: any) => l.proration);
            const prorationTotal = prorationLines.reduce((s: number, l: any) => s + (l.amount || 0), 0);
            preview.proration_amount = prorationTotal / 100; // major units
            preview.next_invoice_total = (upcoming.amount_due || upcoming.total || 0) / 100;
            preview.currency = upcoming.currency?.toUpperCase() || "MXN";
            preview.period_end = stripeSub.items.data[0]?.current_period_end
              ? new Date(stripeSub.items.data[0].current_period_end * 1000).toISOString()
              : null;
          } catch (e) {
            console.error("Preview error:", e);
            preview.preview_error = (e as Error).message;
          }
        }
      }

      return new Response(JSON.stringify(preview), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ─── Update quantity ─── */
    if (action === "update_quantity") {
      const qty = parseInt(new_quantity);
      if (!qty || qty < 3) throw new Error("Mínimo 3 usuarios");

      const currentQty = sub.max_usuarios || 3;
      const activeUsers = await countActiveUsers();
      const isUpgrade = qty > currentQty;
      const isDowngrade = qty < currentQty;

      // Block downgrade if active users > target
      if (isDowngrade && activeUsers > qty) {
        return new Response(JSON.stringify({
          error: `Tienes ${activeUsers} usuarios activos. Desactiva al menos ${activeUsers - qty} antes de bajar a ${qty}.`,
          code: "too_many_active_users",
          active_users: activeUsers,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (sub.stripe_subscription_id) {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        const itemId = stripeSub.items.data[0]?.id;
        if (!itemId) throw new Error("No subscription item found");

        if (isUpgrade) {
          // STRICT: charge immediately. If payment fails, do NOT activate extra users.
          // payment_behavior: "error_if_incomplete" => if the prorated invoice can't be paid
          // right away, Stripe rejects the update with an error and quantity stays the same.
          try {
            await stripe.subscriptions.update(sub.stripe_subscription_id, {
              items: [{ id: itemId, quantity: qty }],
              proration_behavior: "always_invoice",
              payment_behavior: "error_if_incomplete",
            });
          } catch (e: any) {
            const msg = e?.raw?.message || e?.message || "No se pudo procesar el cobro";
            return new Response(JSON.stringify({
              error: `No se pudo cobrar la diferencia: ${msg}. Los usuarios extras no se activarán hasta que el pago se confirme. Verifica tu método de pago.`,
              code: "payment_failed",
            }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Payment succeeded → update local quantity now.
          await supabase
            .from("subscriptions")
            .update({ max_usuarios: qty, updated_at: new Date().toISOString() })
            .eq("id", sub.id);

          return new Response(JSON.stringify({
            success: true,
            max_usuarios: qty,
            is_upgrade: true,
            is_downgrade: false,
            payment_status: "paid",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Downgrade => no charge, just credit for next invoice. Apply immediately.
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: itemId, quantity: qty }],
          proration_behavior: "create_prorations",
        });
      }

      // No Stripe sub OR downgrade path => apply quantity locally.
      await supabase
        .from("subscriptions")
        .update({ max_usuarios: qty, updated_at: new Date().toISOString() })
        .eq("id", sub.id);

      return new Response(JSON.stringify({
        success: true,
        max_usuarios: qty,
        is_upgrade: isUpgrade,
        is_downgrade: isDowngrade,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ─── Change plan ─── */
    if (action === "change_plan") {
      if (!new_price_id) throw new Error("new_price_id requerido");
      if (!sub.stripe_subscription_id) throw new Error("No hay suscripción activa en Stripe para cambiar");

      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const itemId = stripeSub.items.data[0]?.id;
      if (!itemId) throw new Error("No subscription item found");

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: itemId, price: new_price_id }],
        proration_behavior: "create_prorations",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ─── Cancel subscription ─── */
    if (action === "cancel_subscription") {
      if (!sub.stripe_subscription_id) {
        // No Stripe sub — just mark as cancelled locally
        await supabase.from("subscriptions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", sub.id);
      } else {
        // Cancel at period end (user keeps access until current period ends)
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: true,
          metadata: { cancel_reason: reason || "not_specified" },
        });

        await supabase.from("subscriptions")
          .update({ status: "cancelling", updated_at: new Date().toISOString() })
          .eq("id", sub.id);
      }

      return new Response(JSON.stringify({ success: true, status: "cancelling" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ─── Apply retention discount (15% off next invoice) ─── */
    if (action === "apply_retention_discount") {
      if (!sub.stripe_subscription_id) throw new Error("No hay suscripción activa en Stripe");
      if (!sub.stripe_customer_id) throw new Error("No hay cliente Stripe");

      // Create a 15% coupon for one-time use
      const coupon = await stripe.coupons.create({
        percent_off: 15,
        duration: "once",
        name: "Retención — 15% descuento",
        metadata: { reason: reason || "retention", empresa_id: profile.empresa_id },
      });

      // Apply coupon to the subscription
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        coupon: coupon.id,
        metadata: { retention_applied: "true", retention_reason: reason || "" },
      });

      return new Response(JSON.stringify({ success: true, discount: "15%" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Acción no válida");
  } catch (error) {
    console.error("Error manage-subscription:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
