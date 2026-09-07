import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken, type TiendaTokenPayload } from "../_shared/tiendaAuth.ts";
import { resolveNetPrice, type Rule, type Prod } from "../_shared/tiendaPricing.ts";

interface CheckoutItem {
  producto_id: string;
  presentacion_id: string | null;
  cantidad: number;
}

interface CheckoutRequest {
  slug?: unknown;
  token?: unknown;
  request_id?: unknown;
  items?: unknown;
  notas?: unknown;
  fecha_entrega?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCKED_HASH = "BLOCKED$NO_LOGIN";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function errorResponse(error: string, code: string, status: number) {
  return json({ error, code }, status);
}

function normalizeItems(rawItems: unknown): CheckoutItem[] | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 200) return null;
  const aggregated = new Map<string, CheckoutItem>();

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const productoId = typeof item.producto_id === "string" ? item.producto_id : "";
    const presentacionId = item.presentacion_id == null ? null : String(item.presentacion_id);
    const cantidad = Number(item.cantidad);
    if (!UUID_RE.test(productoId) || (presentacionId !== null && !UUID_RE.test(presentacionId))) return null;
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return null;

    const key = `${productoId}:${presentacionId ?? ""}`;
    const previous = aggregated.get(key);
    const combined = (previous?.cantidad ?? 0) + cantidad;
    if (!Number.isFinite(combined) || combined > 1_000_000) return null;
    aggregated.set(key, { producto_id: productoId, presentacion_id: presentacionId, cantidad: combined });
  }

  return [...aggregated.values()];
}

function validDeliveryDate(value: unknown): string | null | false {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Método no permitido", "method_not_allowed", 405);

  let requestId = crypto.randomUUID();
  let slug = "desconocida";
  let itemCount = 0;
  let payload: TiendaTokenPayload | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  const recordFailure = async (code: string, message: string, status: number) => {
    if (!supabase || !UUID_RE.test(requestId)) return;
    await supabase.rpc("record_tienda_checkout_failure", {
      p_request_id: requestId,
      p_slug: slug,
      p_empresa_id: payload?.empresa_id ?? null,
      p_cliente_id: payload?.cliente_id ?? null,
      p_tienda_cliente_id: payload?.tienda_cliente_id ?? null,
      p_item_count: itemCount,
      p_error_code: code,
      p_error_message: message,
      p_http_status: status,
    });
  };

  const fail = async (message: string, code: string, status: number) => {
    await recordFailure(code, message, status);
    return errorResponse(message, code, status);
  };

  try {
    const body = await req.json() as CheckoutRequest;
    slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (typeof body.request_id === "string" && UUID_RE.test(body.request_id)) requestId = body.request_id;
    itemCount = Array.isArray(body.items) ? body.items.length : 0;

    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!slug || !token) return await fail("Inicia sesión para enviar tu pedido.", "session_expired", 401);
    if (body.request_id != null && (typeof body.request_id !== "string" || !UUID_RE.test(body.request_id))) {
      return await fail("La identificación del pedido no es válida. Actualiza la página e intenta de nuevo.", "invalid_request_id", 400);
    }

    const items = normalizeItems(body.items);
    if (!items) return await fail("Revisa las cantidades del carrito antes de continuar.", "invalid_items", 400);
    itemCount = items.length;

    const notas = typeof body.notas === "string" ? body.notas.trim() : "";
    if (notas.length > 2_000) return await fail("Las notas no pueden exceder 2,000 caracteres.", "notes_too_long", 400);
    const fechaEntrega = validDeliveryDate(body.fecha_entrega);
    if (fechaEntrega === false) return await fail("La fecha de entrega no es válida.", "invalid_delivery_date", 400);

    const secret = Deno.env.get("TIENDA_JWT_SECRET");
    if (!secret) return await fail("La tienda no está configurada correctamente.", "server_config", 500);
    payload = await verifyToken(token, secret);
    if (!payload) return await fail("Tu sesión venció. Inicia sesión nuevamente; tu carrito está guardado.", "session_expired", 401);

    const { data: cfg, error: cfgError } = await supabase
      .from("tienda_config")
      .select("empresa_id, activa, lista_precios_default_id, usar_lista_cliente, almacen_id")
      .eq("slug", slug)
      .maybeSingle();
    if (cfgError) throw cfgError;
    if (!cfg || cfg.empresa_id !== payload.empresa_id || !cfg.activa) {
      return await fail("Esta tienda no está disponible en este momento.", "store_unavailable", 403);
    }

    const [{ data: cliente, error: clienteError }, { data: tiendaCliente, error: cuentaError }] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tarifa_id, lista_precio_id, status")
        .eq("id", payload.cliente_id)
        .eq("empresa_id", cfg.empresa_id)
        .maybeSingle(),
      supabase
        .from("tienda_clientes")
        .select("id, cliente_id, empresa_id, verificado, password_hash")
        .eq("id", payload.tienda_cliente_id)
        .maybeSingle(),
    ]);
    if (clienteError) throw clienteError;
    if (cuentaError) throw cuentaError;
    if (!cliente || cliente.status !== "activo") {
      return await fail("Tu cuenta de cliente no está activa. Contacta a tu proveedor.", "account_inactive", 403);
    }
    if (!tiendaCliente || tiendaCliente.empresa_id !== cfg.empresa_id
      || tiendaCliente.cliente_id !== cliente.id || !tiendaCliente.verificado
      || tiendaCliente.password_hash === BLOCKED_HASH) {
      return await fail("Tu acceso a la tienda ya no está activo. Inicia sesión nuevamente o contacta a tu proveedor.", "session_expired", 401);
    }

    let listaPrecioId: string | null = cfg.lista_precios_default_id;
    if (cfg.usar_lista_cliente !== false && cliente.lista_precio_id) listaPrecioId = cliente.lista_precio_id;

    let tarifaId: string | null = null;
    if (listaPrecioId) {
      const { data: lista, error: listaError } = await supabase
        .from("lista_precios")
        .select("tarifa_id")
        .eq("id", listaPrecioId)
        .eq("empresa_id", cfg.empresa_id)
        .maybeSingle();
      if (listaError) throw listaError;
      tarifaId = lista?.tarifa_id ?? null;
    }

    let rules: Rule[] = [];
    if (tarifaId && listaPrecioId) {
      const { data: tariffRules, error: rulesError } = await supabase
        .from("tarifa_lineas")
        .select("aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id")
        .eq("tarifa_id", tarifaId)
        .or(`lista_precio_id.eq.${listaPrecioId},lista_precio_id.is.null`);
      if (rulesError) throw rulesError;
      rules = (tariffRules ?? []) as Rule[];
    }

    const productIds = [...new Set(items.map((item) => item.producto_id))];
    const { data: products, error: productsError } = await supabase
      .from("productos")
      .select("id, nombre, precio_principal, costo, clasificacion_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio, status, se_puede_vender")
      .eq("empresa_id", cfg.empresa_id)
      .in("id", productIds);
    if (productsError) throw productsError;
    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const unavailable = productIds.find((id) => {
      const product = productMap.get(id);
      return !product || product.status !== "activo" || product.se_puede_vender !== true;
    });
    if (unavailable) {
      const name = productMap.get(unavailable)?.nombre;
      return await fail(
        name ? `${name} ya no está disponible. Quítalo del carrito para continuar.` : "Un producto del carrito ya no está disponible. Actualiza el catálogo.",
        "product_unavailable",
        409,
      );
    }

    const presentationIds = [...new Set(items.map((item) => item.presentacion_id).filter((id): id is string => Boolean(id)))];
    type Presentation = {
      id: string;
      producto_id: string;
      nombre: string;
      factor_base: number;
      precio_especial: number | null;
      activo: boolean;
    };
    const presentationMap = new Map<string, Presentation>();
    if (presentationIds.length > 0) {
      const { data: presentations, error: presentationsError } = await supabase
        .from("producto_presentaciones")
        .select("id, producto_id, nombre, factor_base, precio_especial, activo, empresa_id")
        .eq("empresa_id", cfg.empresa_id)
        .in("id", presentationIds);
      if (presentationsError) throw presentationsError;
      for (const presentation of presentations ?? []) {
        presentationMap.set(presentation.id, {
          ...presentation,
          factor_base: Number(presentation.factor_base),
          precio_especial: presentation.precio_especial == null ? null : Number(presentation.precio_especial),
        });
      }
    }

    const lineas: Record<string, unknown>[] = [];
    let subtotal = 0;
    let ivaTotal = 0;
    let iepsTotal = 0;

    for (const item of items) {
      const product = productMap.get(item.producto_id)!;
      let cantidadBase = item.cantidad;
      let precioNeto = resolveNetPrice(rules, product as Prod, listaPrecioId);
      let presentation: Presentation | null = null;

      if (item.presentacion_id) {
        presentation = presentationMap.get(item.presentacion_id) ?? null;
        if (!presentation || presentation.producto_id !== product.id || !presentation.activo
          || !Number.isFinite(presentation.factor_base) || presentation.factor_base <= 0) {
          return await fail(`La presentación de ${product.nombre} ya no está disponible.`, "presentation_unavailable", 409);
        }
        cantidadBase = item.cantidad * presentation.factor_base;
        if (presentation.precio_especial != null) {
          const taxMultiplier =
            (1 + (product.tiene_ieps ? Number(product.ieps_pct) || 0 : 0) / 100)
            * (1 + (product.tiene_iva ? Number(product.iva_pct) || 0 : 0) / 100);
          const grossUnit = presentation.precio_especial / presentation.factor_base;
          precioNeto = roundMoney(grossUnit / taxMultiplier);
        }
      }

      const lineSubtotal = roundMoney(precioNeto * cantidadBase);
      const lineIeps = roundMoney(product.tiene_ieps ? lineSubtotal * (Number(product.ieps_pct) / 100) : 0);
      const lineIva = roundMoney(product.tiene_iva ? (lineSubtotal + lineIeps) * (Number(product.iva_pct) / 100) : 0);
      const lineTotal = roundMoney(lineSubtotal + lineIeps + lineIva);
      subtotal += lineSubtotal;
      iepsTotal += lineIeps;
      ivaTotal += lineIva;

      lineas.push({
        producto_id: product.id,
        descripcion: product.nombre,
        cantidad: cantidadBase,
        precio_unitario: roundMoney(precioNeto),
        precio_unitario_sin_redondeo: precioNeto,
        descuento_pct: 0,
        subtotal: lineSubtotal,
        iva_pct: product.tiene_iva ? Number(product.iva_pct) : 0,
        iva_monto: lineIva,
        ieps_pct: product.tiene_ieps ? Number(product.ieps_pct) : 0,
        ieps_monto: lineIeps,
        total: lineTotal,
        presentacion_id: presentation?.id ?? null,
        presentacion_nombre: presentation?.nombre ?? null,
        presentacion_factor: presentation?.factor_base ?? null,
        paquetes: presentation ? item.cantidad : null,
        lista_precio_id: listaPrecioId,
      });
    }

    subtotal = roundMoney(subtotal);
    ivaTotal = roundMoney(ivaTotal);
    iepsTotal = roundMoney(iepsTotal);
    const total = roundMoney(subtotal + ivaTotal + iepsTotal);

    const { data: result, error: rpcError } = await supabase.rpc("create_tienda_order_atomic", {
      p_request_id: requestId,
      p_empresa_id: cfg.empresa_id,
      p_cliente_id: cliente.id,
      p_tienda_cliente_id: tiendaCliente.id,
      p_slug: slug,
      p_almacen_id: cfg.almacen_id ?? null,
      p_tarifa_id: cliente.tarifa_id ?? tarifaId,
      p_fecha_entrega: fechaEntrega,
      p_notas: notas,
      p_subtotal: subtotal,
      p_iva_total: ivaTotal,
      p_ieps_total: iepsTotal,
      p_total: total,
      p_lineas: lineas,
    });
    if (rpcError) throw rpcError;

    const outcome = result as { ok?: boolean; error?: string; code?: string; folio?: string; venta_id?: string; duplicate?: boolean } | null;
    if (!outcome?.ok) {
      const code = outcome?.code ?? "database_error";
      const status = code === "invalid_order" ? 400 : 500;
      return errorResponse(outcome?.error ?? "No fue posible guardar el pedido. Intenta nuevamente.", code, status);
    }

    return json({
      ok: true,
      folio: outcome.folio,
      venta_id: outcome.venta_id,
      duplicate: outcome.duplicate === true,
      request_id: requestId,
    });
  } catch (error) {
    console.error("tienda-checkout", error instanceof Error ? error.message : "unknown_error");
    await recordFailure("unexpected_error", "Error inesperado al procesar el pedido", 500);
    return errorResponse(
      "No fue posible procesar el pedido. Tu carrito sigue guardado; intenta nuevamente.",
      "unexpected_error",
      500,
    );
  }
});
