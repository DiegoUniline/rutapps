import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sesionVencida, verifyToken } from "../_shared/tiendaAuth.ts";
import { resolvePrice, type Rule, type Prod } from "../_shared/tiendaPricing.ts";
import { contextoPreciosTienda, PRODUCTO_COLS_PRECIO } from "../_shared/tiendaPreciosContexto.ts";

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
      .select("empresa_id, activa, lista_precios_default_id, usar_lista_cliente, almacen_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!cfg || !cfg.activa) return json({ error: "Tienda no disponible" }, 404);

    // Sesión del cliente: si manda token y ya no sirve, se avisa (401) para que la
    // tienda renueve la sesión en vez de mostrarle en silencio precios de visitante.
    let cliente: any = null;
    if (tokenStr) {
      const payload = await verifyToken(tokenStr, Deno.env.get("TIENDA_JWT_SECRET")!);
      if (!payload || payload.empresa_id !== cfg.empresa_id) return sesionVencida();
      const { data: cli, error: cliErr } = await supabase
        .from("clientes")
        .select("id, nombre, lista_precio_id, tarifa_id")
        .eq("id", payload.cliente_id)
        .eq("empresa_id", cfg.empresa_id)
        .maybeSingle();
      if (cliErr) throw cliErr;
      if (!cli) return sesionVencida();
      cliente = cli;
    }

    // Lista y reglas: misma resolución que la app (ver _shared/tiendaPreciosContexto.ts).
    const precios = await contextoPreciosTienda(supabase, cfg, cliente);
    const listaPrecioId = precios.listaPrecioId;
    const listaNombre = precios.listaNombre;
    const rules: Rule[] = precios.rules;

    // Productos — paginar para evitar el tope de 1000 filas de Supabase
    const productos: any[] = [];
    const PAGE = 1000;
    for (let page = 0; page < 50; page++) {
      const from = page * PAGE;
      const to = from + PAGE - 1;
      const { data: chunk, error: pErr } = await supabase
        .from("productos")
        .select(`id, nombre, codigo, notas, marca_id, imagen_url, unidad_venta_id, vender_sin_stock, ${PRODUCTO_COLS_PRECIO}`)
        .eq("empresa_id", cfg.empresa_id)
        .eq("status", "activo")
        .eq("se_puede_vender", true)
        .range(from, to);
      if (pErr) throw pErr;
      const rows = chunk ?? [];
      productos.push(...rows);
      if (rows.length < PAGE) break;
    }

    if (!productos || productos.length === 0) {
      return json({ cliente, lista_nombre: listaNombre, productos: [], categorias: [], marcas: [] });
    }

    const clasifIds = [...new Set(productos.map((p: any) => p.clasificacion_id).filter(Boolean))];
    const marcaIds = [...new Set(productos.map((p: any) => p.marca_id).filter(Boolean))];
    const unidadIds = [...new Set(productos.map((p: any) => p.unidad_venta_id).filter(Boolean))];
    const prodIds = productos.map((p: any) => p.id);

    // Stock paginado en chunks de IDs y por filas
    const fetchStock = async () => {
      const out: any[] = [];
      const CHUNK = 300;
      for (let i = 0; i < prodIds.length; i += CHUNK) {
        const ids = prodIds.slice(i, i + CHUNK);
        let page = 0;
        while (page < 50) {
          const from = page * 1000;
          const to = from + 999;
          let q = cfg.almacen_id
            ? supabase.from("stock_almacen").select("producto_id, cantidad").eq("almacen_id", cfg.almacen_id).in("producto_id", ids)
            : supabase.from("stock_almacen").select("producto_id, cantidad").in("producto_id", ids);
          const { data: rows, error: sErr } = await q.range(from, to);
          if (sErr) throw sErr;
          const r = rows ?? [];
          out.push(...r);
          if (r.length < 1000) break;
          page++;
        }
      }
      return { data: out };
    };

    // Presentaciones (caja/paquete) activas por producto — para que la tienda
    // pueda ofrecer "vender por caja" igual que el escritorio y el móvil.
    const fetchPresentaciones = async () => {
      const out: any[] = [];
      const CHUNK = 300;
      for (let i = 0; i < prodIds.length; i += CHUNK) {
        const ids = prodIds.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("producto_presentaciones")
          .select("id, producto_id, nombre, factor_base, precio_especial")
          .in("producto_id", ids).eq("activo", true).order("factor_base", { ascending: true });
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return { data: out };
    };

    const [cR, mR, uR, sR, pR] = await Promise.all([
      clasifIds.length ? supabase.from("clasificaciones").select("id, nombre, imagen_url").in("id", clasifIds) : { data: [] },
      marcaIds.length ? supabase.from("marcas").select("id, nombre").in("id", marcaIds) : { data: [] },
      unidadIds.length ? supabase.from("unidades").select("id, abreviatura").in("id", unidadIds) : { data: [] },
      fetchStock(),
      fetchPresentaciones(),
    ]);
    const presMap = new Map<string, any[]>();
    (pR.data ?? []).forEach((pr: any) => {
      const arr = presMap.get(pr.producto_id) ?? [];
      arr.push({ id: pr.id, nombre: pr.nombre, factor_base: Number(pr.factor_base) || 1, precio_especial: pr.precio_especial });
      presMap.set(pr.producto_id, arr);
    });
    const cMap = new Map((cR.data ?? []).map((x: any) => [x.id, x.nombre]));
    const cImgMap = new Map((cR.data ?? []).map((x: any) => [x.nombre, x.imagen_url ?? null]));
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
        descripcion: p.notas,
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
        presentaciones: presMap.get(p.id) ?? [],
      };
    }).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

    const categorias = [...new Set(enriched.map((p: any) => p.categoria).filter(Boolean))]
      .sort()
      .map((nombre: any) => ({ nombre, imagen_url: cImgMap.get(nombre) ?? null }));
    const marcas = [...new Set(enriched.map((p: any) => p.marca).filter(Boolean))].sort();

    return json({ cliente, lista_nombre: listaNombre, productos: enriched, categorias, marcas });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
