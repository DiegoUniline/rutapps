import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken } from "../_shared/tiendaAuth.ts";
import { resolvePrice, type Rule, type Prod } from "../_shared/tiendaPricing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const tokenStr = url.searchParams.get("token");
    if (!slug) return json({ error: "slug requerido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("empresa_id, activa, lista_precios_default_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg || !cfg.activa) return json({ error: "Tienda no disponible" }, 404);

    // Resolve which lista_precios to use
    let listaPrecioId: string | null = cfg.lista_precios_default_id;
    let cliente: any = null;
    if (tokenStr) {
      const payload = await verifyToken(tokenStr, Deno.env.get("TIENDA_JWT_SECRET")!);
      if (payload && payload.empresa_id === cfg.empresa_id) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("id, nombre, lista_precio_id, tarifa_id")
          .eq("id", payload.cliente_id)
          .maybeSingle();
        if (cli) {
          cliente = cli;
          if (cli.lista_precio_id) listaPrecioId = cli.lista_precio_id;
        }
      }
    }

    // Fetch lista to get tarifa_id
    let tarifaId: string | null = null;
    let listaNombre: string | null = null;
    if (listaPrecioId) {
      const { data: lp } = await supabase
        .from("lista_precios")
        .select("id, nombre, tarifa_id")
        .eq("id", listaPrecioId)
        .maybeSingle();
      if (lp) {
        tarifaId = lp.tarifa_id;
        listaNombre = lp.nombre;
      }
    }

    // Tarifa rules
    let rules: Rule[] = [];
    if (tarifaId && listaPrecioId) {
      const { data: tr } = await supabase
        .from("tarifa_lineas")
        .select("aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id")
        .eq("tarifa_id", tarifaId)
        .eq("lista_precio_id", listaPrecioId);
      rules = (tr ?? []) as Rule[];
    }

    // Productos
    const { data: productos } = await supabase
      .from("productos")
      .select("id, nombre, codigo, costo, precio_principal, clasificacion_id, marca_id, imagen_url, unidad_venta_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio, vender_sin_stock")
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "activo")
      .eq("se_puede_vender", true)
      .limit(3000);

    if (!productos || productos.length === 0) {
      return json({ cliente, lista_nombre: listaNombre, productos: [], categorias: [], marcas: [] });
    }

    const clasifIds = [...new Set(productos.map((p: any) => p.clasificacion_id).filter(Boolean))];
    const marcaIds = [...new Set(productos.map((p: any) => p.marca_id).filter(Boolean))];
    const unidadIds = [...new Set(productos.map((p: any) => p.unidad_venta_id).filter(Boolean))];
    const prodIds = productos.map((p: any) => p.id);

    const [cR, mR, uR, sR] = await Promise.all([
      clasifIds.length ? supabase.from("clasificaciones").select("id, nombre").in("id", clasifIds) : { data: [] },
      marcaIds.length ? supabase.from("marcas").select("id, nombre").in("id", marcaIds) : { data: [] },
      unidadIds.length ? supabase.from("unidades").select("id, abreviatura").in("id", unidadIds) : { data: [] },
      supabase.from("stock_almacen").select("producto_id, cantidad").in("producto_id", prodIds),
    ]);
    const cMap = new Map((cR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const mMap = new Map((mR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const uMap = new Map((uR.data ?? []).map((x: any) => [x.id, x.abreviatura]));
    const stock = new Map<string, number>();
    (sR.data ?? []).forEach((s: any) => stock.set(s.producto_id, (stock.get(s.producto_id) ?? 0) + Number(s.cantidad ?? 0)));

    const enriched = productos.map((p: any) => {
      const precio = resolvePrice(rules, p as Prod, listaPrecioId);
      return {
        id: p.id,
        nombre: p.nombre,
        sku: p.codigo,
        descripcion: null,
        categoria: cMap.get(p.clasificacion_id) ?? null,
        marca: mMap.get(p.marca_id) ?? null,
        imagen_url: p.imagen_url,
        unidad_venta: uMap.get(p.unidad_venta_id) ?? null,
        precio,
        precio_base: p.precio_principal,
        stock: stock.get(p.id) ?? 0,
        vender_sin_stock: p.vender_sin_stock,
        tiene_iva: p.tiene_iva,
        iva_pct: p.iva_pct,
        tiene_ieps: p.tiene_ieps,
        ieps_pct: p.ieps_pct,
      };
    }).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

    const categorias = [...new Set(enriched.map((p: any) => p.categoria).filter(Boolean))].sort();
    const marcas = [...new Set(enriched.map((p: any) => p.marca).filter(Boolean))].sort();

    return json({ cliente, lista_nombre: listaNombre, productos: enriched, categorias, marcas });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
