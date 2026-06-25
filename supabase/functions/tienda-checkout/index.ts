import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken } from "../_shared/tiendaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, token, items, notas, fecha_entrega } = await req.json();
    if (!slug || !token) return json({ error: "Inicia sesión para enviar tu pedido" }, 401);
    if (!Array.isArray(items) || items.length === 0) return json({ error: "Carrito vacío" }, 400);

    const payload = await verifyToken(token, Deno.env.get("TIENDA_JWT_SECRET")!);
    if (!payload) return json({ error: "Sesión expirada" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("empresa_id, activa")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg || cfg.empresa_id !== payload.empresa_id || !cfg.activa) {
      return json({ error: "Tienda no disponible" }, 403);
    }

    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, nombre, tarifa_id")
      .eq("id", payload.cliente_id)
      .maybeSingle();
    if (!cliente) return json({ error: "Cliente no encontrado" }, 404);

    // Re-validate products on server (don't trust prices client side)
    const prodIds = items.map((i: any) => i.producto_id);
    const { data: prods } = await supabase
      .from("productos")
      .select("id, nombre, tiene_iva, iva_pct, tiene_ieps, ieps_pct")
      .eq("empresa_id", cfg.empresa_id)
      .in("id", prodIds);
    if (!prods || prods.length === 0) return json({ error: "Productos inválidos" }, 400);
    const prodMap = new Map(prods.map((p: any) => [p.id, p]));

    let subtotal = 0;
    let iva_total = 0;
    let ieps_total = 0;
    const lineas: any[] = [];

    for (const item of items as any[]) {
      const p: any = prodMap.get(item.producto_id);
      if (!p) continue;
      const cantidad = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      if (cantidad <= 0 || precio < 0) continue;
      const sub = precio * cantidad;
      const ieps_m = p.tiene_ieps ? sub * (Number(p.ieps_pct) / 100) : 0;
      const iva_m = p.tiene_iva ? (sub + ieps_m) * (Number(p.iva_pct) / 100) : 0;
      subtotal += sub;
      iva_total += iva_m;
      ieps_total += ieps_m;
      lineas.push({
        producto_id: p.id,
        descripcion: p.nombre,
        cantidad,
        precio_unitario: precio,
        descuento_pct: 0,
        subtotal: sub,
        iva_pct: p.tiene_iva ? p.iva_pct : 0,
        iva_monto: iva_m,
        ieps_pct: p.tiene_ieps ? p.ieps_pct : 0,
        ieps_monto: ieps_m,
        total: sub + iva_m + ieps_m,
      });
    }

    const total = subtotal + iva_total + ieps_total;
    const round = (n: number) => Math.round(n * 100) / 100;

    // Folio
    const folio = `WEB-${Date.now().toString().slice(-8)}`;

    const { data: venta, error: vErr } = await supabase
      .from("ventas")
      .insert({
        empresa_id: cfg.empresa_id,
        folio,
        tipo: "pedido",
        status: "borrador",
        cliente_id: cliente.id,
        vendedor_id: null,
        tarifa_id: cliente.tarifa_id,
        condicion_pago: "contado",
        fecha: new Date().toISOString().slice(0, 10),
        fecha_entrega: fecha_entrega ?? null,
        entrega_inmediata: false,
        notas: (notas ?? "") + "\n[Pedido recibido desde Tienda en Línea]",
        subtotal: round(subtotal),
        iva_total: round(iva_total),
        ieps_total: round(ieps_total),
        descuento_total: 0,
        total: round(total),
        saldo_pendiente: round(total),
        origen: "tienda_web",
        requiere_factura: false,
      })
      .select("id, folio")
      .single();
    if (vErr || !venta) return json({ error: "No se pudo crear el pedido: " + (vErr?.message ?? "") }, 500);

    const lineasInsert = lineas.map((l) => ({ ...l, venta_id: venta.id }));
    const { error: lErr } = await supabase.from("venta_lineas").insert(lineasInsert);
    if (lErr) {
      await supabase.from("ventas").delete().eq("id", venta.id);
      return json({ error: "No se pudieron guardar las líneas: " + lErr.message }, 500);
    }

    // Internal notification
    await supabase.from("internal_notifications").insert({
      empresa_id: cfg.empresa_id,
      title: "Nuevo pedido desde tu tienda en línea",
      body: `${cliente.nombre} acaba de enviar el pedido ${folio} por ${round(total)}`,
      tipo: "info",
      link: `/ventas/${venta.id}`,
      entity_type: "venta",
      entity_id: venta.id,
    }).then(() => {}).catch(() => {});

    return json({ ok: true, folio: venta.folio, venta_id: venta.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
