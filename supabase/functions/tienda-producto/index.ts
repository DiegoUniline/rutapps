import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken } from "../_shared/tiendaAuth.ts";
import { resolvePrice, type Rule, type Prod } from "../_shared/tiendaPricing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const productoId = url.searchParams.get("producto_id");
    const tokenStr = url.searchParams.get("token");
    if (!slug || !productoId) return json({ error: "slug y producto_id requeridos" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("empresa_id, activa, lista_precios_default_id, usar_lista_cliente, almacen_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg || !cfg.activa) return json({ error: "Tienda no disponible" }, 404);

    let listaPrecioId: string | null = cfg.lista_precios_default_id;
    if (tokenStr) {
      const payload = await verifyToken(tokenStr, Deno.env.get("TIENDA_JWT_SECRET")!);
      if (payload && payload.empresa_id === cfg.empresa_id) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("lista_precio_id")
          .eq("id", payload.cliente_id)
          .maybeSingle();
        if (cfg.usar_lista_cliente !== false && cli?.lista_precio_id) listaPrecioId = cli.lista_precio_id;
      }
    }

    let tarifaId: string | null = null;
    if (listaPrecioId) {
      const { data: lp } = await supabase.from("lista_precios").select("tarifa_id").eq("id", listaPrecioId).maybeSingle();
      if (lp) tarifaId = lp.tarifa_id;
    }

    const { data: p } = await supabase
      .from("productos")
      .select("id, nombre, codigo, notas, costo, precio_principal, clasificacion_id, marca_id, imagen_url, unidad_venta_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio, vender_sin_stock, status, se_puede_vender, empresa_id")
      .eq("id", productoId)
      .maybeSingle();

    if (!p || p.empresa_id !== cfg.empresa_id || p.status !== "activo" || !p.se_puede_vender) {
      return json({ error: "Producto no encontrado" }, 404);
    }

    // Related: 12 products in same category
    const { data: relacionadosRaw } = await supabase
      .from("productos")
      .select("id, nombre, codigo, notas, costo, precio_principal, clasificacion_id, marca_id, imagen_url, unidad_venta_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio, vender_sin_stock")
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "activo")
      .eq("se_puede_vender", true)
      .eq("clasificacion_id", p.clasificacion_id)
      .neq("id", p.id)
      .limit(12);

    // Other popular (any) — limit 12
    const { data: otrosRaw } = await supabase
      .from("productos")
      .select("id, nombre, codigo, notas, costo, precio_principal, clasificacion_id, marca_id, imagen_url, unidad_venta_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio, vender_sin_stock")
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "activo")
      .eq("se_puede_vender", true)
      .neq("id", p.id)
      .limit(12);

    const all = [p, ...(relacionadosRaw ?? []), ...(otrosRaw ?? [])];
    const clasifIds = [...new Set(all.map((x: any) => x.clasificacion_id).filter(Boolean))];
    const marcaIds = [...new Set(all.map((x: any) => x.marca_id).filter(Boolean))];
    const unidadIds = [...new Set(all.map((x: any) => x.unidad_venta_id).filter(Boolean))];
    const prodIds = all.map((x: any) => x.id);

    let rules: Rule[] = [];
    if (tarifaId && listaPrecioId) {
      const { data: tr } = await supabase
        .from("tarifa_lineas")
        .select("aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id")
        .eq("tarifa_id", tarifaId)
        .or(`lista_precio_id.eq.${listaPrecioId},lista_precio_id.is.null`);
      rules = (tr ?? []) as Rule[];
    }

    const [cR, mR, uR, sR] = await Promise.all([
      clasifIds.length ? supabase.from("clasificaciones").select("id, nombre").in("id", clasifIds) : { data: [] },
      marcaIds.length ? supabase.from("marcas").select("id, nombre").in("id", marcaIds) : { data: [] },
      unidadIds.length ? supabase.from("unidades").select("id, abreviatura").in("id", unidadIds) : { data: [] },
      (cfg.almacen_id
        ? supabase.from("stock_almacen").select("producto_id, cantidad").eq("almacen_id", cfg.almacen_id).in("producto_id", prodIds)
        : supabase.from("stock_almacen").select("producto_id, cantidad").in("producto_id", prodIds)),
    ]);
    const cMap = new Map((cR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const mMap = new Map((mR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const uMap = new Map((uR.data ?? []).map((x: any) => [x.id, x.abreviatura]));
    const stock = new Map<string, number>();
    (sR.data ?? []).forEach((s: any) => stock.set(s.producto_id, (stock.get(s.producto_id) ?? 0) + Number(s.cantidad ?? 0)));

    const enrich = (x: any) => ({
      id: x.id,
      nombre: x.nombre,
      sku: x.codigo,
      descripcion: x.notas,
      categoria: cMap.get(x.clasificacion_id) ?? null,
      marca: mMap.get(x.marca_id) ?? null,
      imagen_url: x.imagen_url,
      unidad_venta: uMap.get(x.unidad_venta_id) ?? null,
      precio: resolvePrice(rules, x as Prod, listaPrecioId),
      precio_base: x.precio_principal,
      stock: stock.get(x.id) ?? 0,
      vender_sin_stock: x.vender_sin_stock,
      tiene_iva: x.tiene_iva,
      iva_pct: x.iva_pct,
      tiene_ieps: x.tiene_ieps,
      ieps_pct: x.ieps_pct,
    });

    return json({
      producto: enrich(p),
      relacionados: (relacionadosRaw ?? []).map(enrich),
      tambien_compraron: (otrosRaw ?? []).map(enrich),
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
