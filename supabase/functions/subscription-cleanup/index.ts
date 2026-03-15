import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // 1. Suspend trial subscriptions that have expired
    const { data: expiredTrials } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, trial_ends_at")
      .eq("status", "trial")
      .lt("trial_ends_at", now.toISOString());

    for (const sub of expiredTrials || []) {
      await supabase
        .from("subscriptions")
        .update({ status: "past_due", updated_at: now.toISOString() })
        .eq("id", sub.id);
      console.log(`Trial expired for empresa ${sub.empresa_id}`);
    }

    // 2. Suspend active subscriptions past their period end
    const { data: expiredActive } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, current_period_end")
      .eq("status", "active")
      .lt("current_period_end", today);

    for (const sub of expiredActive || []) {
      await supabase
        .from("subscriptions")
        .update({ status: "past_due", updated_at: now.toISOString() })
        .eq("id", sub.id);
      console.log(`Subscription expired for empresa ${sub.empresa_id}`);
    }

    // 3. Delete data for subscriptions past_due for 15+ days
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { data: toDelete } = await supabase
      .from("subscriptions")
      .select("id, empresa_id, updated_at")
      .eq("status", "past_due")
      .lt("updated_at", fifteenDaysAgo);

    for (const sub of toDelete || []) {
      const eid = sub.empresa_id;
      console.log(`Deleting all data for empresa ${eid} (15+ days past due)`);

      // Delete in dependency order
      // Líneas primero, luego padres
      const tables = [
        "cobro_aplicaciones", "venta_lineas", "carga_lineas", "carga_pedidos",
        "compra_lineas", "entrega_lineas", "devolucion_lineas", "auditoria_lineas",
        "descarga_ruta_lineas", "tarifa_lineas", "producto_tarifas", "producto_lotes",
        "cliente_pedido_sugerido", "promocion_aplicada", "movimientos_inventario",
        "ajustes_inventario", "stock_camion", "gastos", "pago_compras", "cobros",
      ];

      // These have empresa_id directly
      const parentTables = [
        "devoluciones", "descarga_ruta", "entregas", "cargas", "compras", "ventas",
        "auditorias", "promociones", "productos", "clientes",
        "tarifas", "clasificaciones", "marcas", "proveedores", "listas",
        "unidades", "zonas", "vendedores", "cobradores", "almacenes",
        "role_permisos", "roles",
      ];

      // For child tables without empresa_id, we delete via parent relationships
      // Most child tables use EXISTS checks in RLS, so we delete parents which cascades

      for (const t of parentTables) {
        try {
          await supabase.from(t).delete().eq("empresa_id", eid);
        } catch (e) {
          console.error(`Error deleting ${t} for ${eid}:`, e);
        }
      }

      // Mark subscription as suspended
      await supabase
        .from("subscriptions")
        .update({ status: "suspended", updated_at: now.toISOString() })
        .eq("id", sub.id);
    }

    return new Response(
      JSON.stringify({
        expired_trials: expiredTrials?.length || 0,
        expired_active: expiredActive?.length || 0,
        deleted: toDelete?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error subscription-cleanup:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
