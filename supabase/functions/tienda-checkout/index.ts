import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, motivoRechazoPedidoTienda, sesionVencida, verifyToken } from "../_shared/tiendaAuth.ts";
import { montosLinea, resolvePrice, type Prod } from "../_shared/tiendaPricing.ts";
import { contextoPreciosTienda, PRODUCTO_COLS_PRECIO } from "../_shared/tiendaPreciosContexto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, token, items, notas, fecha_entrega } = await req.json();
    if (!slug || !token) return json({ error: "Inicia sesión para enviar tu pedido" }, 401);
    if (!Array.isArray(items) || items.length === 0) return json({ error: "Carrito vacío" }, 400);

    const payload = await verifyToken(token, Deno.env.get("TIENDA_JWT_SECRET")!);
    if (!payload) return sesionVencida();

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

    const { data: cliente, error: cliErr } = await supabase
      .from("clientes")
      .select("id, nombre, tarifa_id, lista_precio_id, status")
      .eq("id", payload.cliente_id)
      .eq("empresa_id", cfg.empresa_id)
      .maybeSingle();
    if (cliErr) return json({ error: "No se pudo validar tu cuenta. Intenta de nuevo en un momento." }, 500);
    if (!cliente) return sesionVencida();

    // Cliente bloqueado en la tienda (el token puede seguir vigente, D-045) o no activo en
    // RutApp (la venta normal solo permite clientes activos): no se recibe el pedido.
    const { data: acceso, error: accErr } = await supabase
      .from("tienda_clientes")
      .select("id, verificado, password_hash")
      .eq("id", payload.tienda_cliente_id)
      .eq("empresa_id", cfg.empresa_id)
      .maybeSingle();
    if (accErr) return json({ error: "No se pudo validar tu acceso. Intenta de nuevo en un momento." }, 500);
    const rechazo = motivoRechazoPedidoTienda(cliente, acceso);
    if (rechazo) return json(rechazo, 403);

    // Misma lista y reglas que el catálogo que vio el cliente (y que la app).
    const { listaPrecioId, rules } = await contextoPreciosTienda(supabase, cfg, cliente);

    // Re-validate products on server (don't trust prices client side)
    const prodIds = items.map((i: any) => i.producto_id);
    const { data: prods } = await supabase
      .from("productos")
      .select(`id, nombre, ${PRODUCTO_COLS_PRECIO}`)
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
    let subtotal = 0;
    let iva_total = 0;
    let ieps_total = 0;
    const lineas: any[] = [];

    for (const item of items as any[]) {
      const p: any = prodMap.get(item.producto_id);
      if (!p) continue;
      let cantidad = Number(item.cantidad) || 0;
      if (cantidad <= 0) continue;

      // Precio del servidor (se ignora el que manda el navegador): el precio FINAL
      // por unidad base que el catálogo le mostró a este cliente.
      let precioFinalUnidad = resolvePrice(rules, p as Prod, listaPrecioId);

      // Presentación (caja/paquete): se valida en el servidor y se convierte a unidad
      // base (cantidad_base = paquetes × factor). Con precio_especial (precio final
      // del paquete) el precio por unidad base es precio_especial / factor.
      if (item.presentacion_id) {
        const pr = presMap.get(item.presentacion_id);
        if (!pr || pr.producto_id !== p.id || pr.activo === false) {
          return json({ error: "Presentación inválida para el producto " + p.nombre }, 400);
        }
        const factor = Number(pr.factor_base) || 1;
        cantidad = cantidad * factor;
        if (pr.precio_especial != null) precioFinalUnidad = Number(pr.precio_especial) / factor;
      }

      // Montos como la app y cuadrados a lo que el cliente vio (precio final × cantidad).
      const m = montosLinea(precioFinalUnidad, cantidad, p as Prod);
      subtotal += m.subtotal;
      iva_total += m.iva_monto;
      ieps_total += m.ieps_monto;
      lineas.push({
        producto_id: p.id,
        descripcion: p.nombre,
        cantidad,
        precio_unitario: m.precio_unitario,
        descuento_pct: 0,
        subtotal: m.subtotal,
        iva_pct: p.tiene_iva ? p.iva_pct : 0,
        iva_monto: m.iva_monto,
        ieps_pct: p.tiene_ieps ? p.ieps_pct : 0,
        ieps_monto: m.ieps_monto,
        total: m.total,
      });
    }

    const total = subtotal + iva_total + ieps_total;
    const round = (n: number) => Math.round(n * 100) / 100;

    // Folio: lo asigna el trigger `trg_auto_folio_venta` (serie PED consecutiva por empresa,
    // `next_folio`, con candado), igual que cualquier pedido. No se inventa serie aquí.
    const { data: venta, error: vErr } = await supabase
      .from("ventas")
      .insert({
        empresa_id: cfg.empresa_id,
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
      body: `${cliente.nombre} acaba de enviar el pedido ${venta.folio} por ${round(total)}`,
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
