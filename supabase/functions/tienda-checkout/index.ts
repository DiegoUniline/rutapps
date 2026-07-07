import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken } from "../_shared/tiendaAuth.ts";
import { resolveNetPrice, type Rule, type Prod } from "../_shared/tiendaPricing.ts";

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
      .select("empresa_id, activa, lista_precios_default_id, usar_lista_cliente, almacen_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg || cfg.empresa_id !== payload.empresa_id || !cfg.activa) {
      return json({ error: "Tienda no disponible" }, 403);
    }

    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, nombre, tarifa_id, lista_precio_id")
      .eq("id", payload.cliente_id)
      .maybeSingle();
    if (!cliente) return json({ error: "Cliente no encontrado" }, 404);

    // Resolve which lista_precios to apply (same logic as tienda-catalog)
    let listaPrecioId: string | null = cfg.lista_precios_default_id;
    if (cfg.usar_lista_cliente !== false && cliente.lista_precio_id) {
      listaPrecioId = cliente.lista_precio_id;
    }
    let tarifaId: string | null = null;
    if (listaPrecioId) {
      const { data: lp } = await supabase
        .from("lista_precios")
        .select("tarifa_id")
        .eq("id", listaPrecioId)
        .maybeSingle();
      if (lp) tarifaId = lp.tarifa_id;
    }
    let rules: Rule[] = [];
    if (tarifaId && listaPrecioId) {
      const { data: tr } = await supabase
        .from("tarifa_lineas")
        .select("aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id")
        .eq("tarifa_id", tarifaId)
        .or(`lista_precio_id.eq.${listaPrecioId},lista_precio_id.is.null`);
      rules = (tr ?? []) as Rule[];
    }

    // Re-validate products on server (don't trust prices client side)
    const prodIds = items.map((i: any) => i.producto_id);
    const { data: prods } = await supabase
      .from("productos")
      .select("id, nombre, precio_principal, costo, clasificacion_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio")
      .eq("empresa_id", cfg.empresa_id)
      .in("id", prodIds);
    if (!prods || prods.length === 0) return json({ error: "Productos inválidos" }, 400);
    const prodMap = new Map(prods.map((p: any) => [p.id, p]));

    // Presentaciones (caja/paquete). Se validan en el servidor para NO confiar en
    // el factor/precio que manda el cliente. Todo se convierte a unidad base para
    // que el inventario descuente correcto (igual que escritorio y móvil).
    const presIds = [...new Set(items.map((i: any) => i.presentacion_id).filter(Boolean))];
    const presMap = new Map<string, any>();
    if (presIds.length) {
      const { data: pres } = await supabase
        .from("producto_presentaciones")
        .select("id, producto_id, factor_base, precio_especial, activo")
        .in("id", presIds);
      (pres ?? []).forEach((pr: any) => presMap.set(pr.id, pr));
    }
    const taxMult = (p: any) =>
      (1 + (p.tiene_ieps ? Number(p.ieps_pct) || 0 : 0) / 100) *
      (1 + (p.tiene_iva ? Number(p.iva_pct) || 0 : 0) / 100);

    let subtotal = 0;
    let iva_total = 0;
    let ieps_total = 0;
    const lineas: any[] = [];

    for (const item of items as any[]) {
      const p: any = prodMap.get(item.producto_id);
      if (!p) continue;
      let cantidad = Number(item.cantidad) || 0;
      if (cantidad <= 0) continue;

      // Server-side authoritative price — ignore client-supplied precio
      let precioNeto = resolveNetPrice(rules, p as Prod, listaPrecioId);

      // Si la línea trae presentación (caja/paquete), la validamos en el servidor
      // y convertimos a unidad base: cantidad_base = paquetes × factor. El precio
      // por unidad base sale del precio_especial (tratado como bruto, se le baja el
      // impuesto) o, si no hay, del precio de lista por unidad.
      if (item.presentacion_id) {
        const pr = presMap.get(item.presentacion_id);
        if (!pr || pr.producto_id !== p.id || pr.activo === false) {
          return json({ error: "Presentación inválida para el producto " + p.nombre }, 400);
        }
        const factor = Number(pr.factor_base) || 1;
        cantidad = cantidad * factor;
        if (pr.precio_especial != null) {
          const tm = taxMult(p);
          const grossUnit = Number(pr.precio_especial) / factor; // por unidad base, bruto
          precioNeto = Math.round((tm > 0 ? grossUnit / tm : grossUnit) * 100) / 100;
        }
      }

      const sub = precioNeto * cantidad;
      const ieps_m = p.tiene_ieps ? sub * (Number(p.ieps_pct) / 100) : 0;
      const iva_m = p.tiene_iva ? (sub + ieps_m) * (Number(p.iva_pct) / 100) : 0;
      subtotal += sub;
      iva_total += iva_m;
      ieps_total += ieps_m;
      lineas.push({
        producto_id: p.id,
        descripcion: p.nombre,
        cantidad,
        precio_unitario: precioNeto,
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
        almacen_id: cfg.almacen_id ?? null,
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
