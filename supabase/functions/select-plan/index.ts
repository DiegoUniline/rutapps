import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[SELECT-PLAN] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

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

    const qty = Math.max(3, parseInt(num_usuarios) || 3);

    // Get user's empresa
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.empresa_id) throw new Error("Sin empresa");

    // Get plan details
    const { data: plan, error: planErr } = await supabase
      .from("planes")
      .select("*")
      .eq("id", plan_id)
      .eq("activo", true)
      .single();
    if (planErr || !plan) throw new Error("Plan no encontrado o inactivo");

    log("Plan selected", { plan: plan.nombre, qty, empresa: profile.empresa_id });

    // Calculate proration
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    const diaActual = now.getDate();
    const diasRestantes = diasEnMes - diaActual + 1;
    const esProrrateo = diaActual !== 1;

    const precioUnitario = plan.precio_base_mes;
    const subtotal = precioUnitario * qty;
    const total = esProrrateo
      ? Math.round((subtotal / diasEnMes) * diasRestantes * 100) / 100
      : subtotal;

    const periodoInicio = now.toISOString().slice(0, 10);
    const primeroDeSiguiente = new Date(year, month + 1, 1);
    const periodoFin = new Date(primeroDeSiguiente.getTime() - 86400000).toISOString().slice(0, 10);

    log("Proration calculated", { diasEnMes, diaActual, diasRestantes, esProrrateo, subtotal, total });

    // Update subscription
    const { error: subErr } = await supabase
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        status: "pendiente_pago",
        max_usuarios: qty,
        es_manual: true,
        stripe_price_id: plan.stripe_price_id,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", profile.empresa_id);

    if (subErr) log("Sub update error", subErr);

    // Delete previous pending invoices for this empresa
    await supabase
      .from("facturas")
      .delete()
      .eq("empresa_id", profile.empresa_id)
      .eq("estado", "pendiente");

    // Get subscription id
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle();

    // Create new invoice
    const { data: factura, error: facErr } = await supabase
      .from("facturas")
      .insert({
        empresa_id: profile.empresa_id,
        suscripcion_id: sub?.id || null,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        num_usuarios: qty,
        precio_unitario: precioUnitario,
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

    log("Invoice created", { facturaId: factura.id, total, esProrrateo });

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
        precio_unitario: precioUnitario,
      },
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
