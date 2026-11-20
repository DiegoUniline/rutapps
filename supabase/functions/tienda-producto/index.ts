import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sesionVencida, verifyToken } from "../_shared/tiendaAuth.ts";
import { resolvePrice, type Prod } from "../_shared/tiendaPricing.ts";
import { contextoPreciosTienda, PRODUCTO_COLS_PRECIO } from "../_shared/tiendaPreciosContexto.ts";

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

    // Misma resolución de lista/reglas y de sesión que tienda-catalog.
    let cliente: { lista_precio_id: string | null; tarifa_id: string | null } | null = null;
    if (tokenStr) {
      const payload = await verifyToken(tokenStr, Deno.env.get("TIENDA_JWT_SECRET")!);
      if (!payload || payload.empresa_id !== cfg.empresa_id) return sesionVencida();
      const { data: cli, error: cliErr } = await supabase
        .from("clientes")
        .select("lista_precio_id, tarifa_id")
        .eq("id", payload.cliente_id)
        .eq("empresa_id", cfg.empresa_id)
        .maybeSingle();
      if (cliErr) throw cliErr;
      if (!cli) return sesionVencida();
      cliente = cli;
    }
    const { listaPrecioId, rules } = await contextoPreciosTienda(supabase, cfg, cliente);

    const { data: p } = await supabase
      .from("productos")
      .select(`id, nombre, codigo, notas, marca_id, imagen_url, unidad_venta_id, vender_sin_stock, status, se_puede_vender, empresa_id, ${PRODUCTO_COLS_PRECIO}`)
      .eq("id", productoId)
      .maybeSingle();

    if (!p || p.empresa_id !== cfg.empresa_id || p.status !== "activo" || !p.se_puede_vender) {
      return json({ error: "Producto no encontrado" }, 404);
    }

    // Related: 12 products in same category
    const { data: relacionadosRaw } = await supabase
      .from("productos")
      .select(`id, nombre, codigo, notas, marca_id, imagen_url, unidad_venta_id, vender_sin_stock, ${PRODUCTO_COLS_PRECIO}`)
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "activo")
      .eq("se_puede_vender", true)
      .eq("clasificacion_id", p.clasificacion_id)
      .neq("id", p.id)
      .limit(12);

    // Other popular (any) — limit 12
    const { data: otrosRaw } = await supabase
      .from("productos")
      .select(`id, nombre, codigo, notas, marca_id, imagen_url, unidad_venta_id, vender_sin_stock, ${PRODUCTO_COLS_PRECIO}`)
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

    const [cR, mR, uR, sR, pR] = await Promise.all([
      clasifIds.length ? supabase.from("clasificaciones").select("id, nombre").in("id", clasifIds) : { data: [] },
      marcaIds.length ? supabase.from("marcas").select("id, nombre").in("id", marcaIds) : { data: [] },
      unidadIds.length ? supabase.from("unidades").select("id, abreviatura").in("id", unidadIds) : { data: [] },
      (cfg.almacen_id
        ? supabase.from("stock_almacen").select("producto_id, cantidad").eq("almacen_id", cfg.almacen_id).in("producto_id", prodIds)
        : supabase.from("stock_almacen").select("producto_id, cantidad").in("producto_id", prodIds)),
      supabase.from("producto_presentaciones")
        .select("id, producto_id, nombre, factor_base, precio_especial")
        .in("producto_id", prodIds).eq("activo", true).order("factor_base", { ascending: true }),
    ]);
    const cMap = new Map((cR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const mMap = new Map((mR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const uMap = new Map((uR.data ?? []).map((x: any) => [x.id, x.abreviatura]));
    const presMap = new Map<string, any[]>();
    (pR.data ?? []).forEach((pr: any) => {
      const arr = presMap.get(pr.producto_id) ?? [];
      arr.push({ id: pr.id, nombre: pr.nombre, factor_base: Number(pr.factor_base) || 1, precio_especial: pr.precio_especial });
      presMap.set(pr.producto_id, arr);
    });
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
      presentaciones: presMap.get(x.id) ?? [],
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
