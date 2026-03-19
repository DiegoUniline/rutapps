import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Price resolver (mirrors src/lib/priceResolver.ts) ── */
interface Rule {
  aplica_a: string;
  producto_ids: string[];
  clasificacion_ids: string[];
  tipo_calculo: string;
  precio: number;
  precio_minimo: number | null;
  margen_pct: number | null;
  descuento_pct: number | null;
  redondeo: string;
  base_precio: string;
  lista_precio_id: string | null;
}

interface Prod {
  id: string;
  precio_principal: number;
  costo: number;
  clasificacion_id: string | null;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
}

function applyRedondeo(p: number, r: string): number {
  if (!r || r === "ninguno") return p;
  if (r === "arriba") return Math.ceil(p);
  if (r === "abajo") return Math.floor(p);
  return Math.round(p);
}

function resolvePrice(rules: Rule[], prod: Prod, listaId: string): number {
  const filtered = rules.filter((r) => r.lista_precio_id === listaId);

  // Priority: producto > categoria > todos
  let rule =
    filtered.find((r) => r.aplica_a === "producto" && (r.producto_ids ?? []).includes(prod.id)) ??
    (prod.clasificacion_id
      ? filtered.find((r) => r.aplica_a === "categoria" && (r.clasificacion_ids ?? []).includes(prod.clasificacion_id!))
      : null) ??
    filtered.find((r) => r.aplica_a === "todos") ??
    null;

  if (!rule) return prod.precio_principal;

  let precio = 0;
  if (rule.tipo_calculo === "precio_fijo") {
    precio = rule.precio ?? 0;
  } else if (rule.tipo_calculo === "margen_costo") {
    precio = (prod.costo ?? 0) * (1 + (rule.margen_pct ?? 0) / 100);
  } else if (rule.tipo_calculo === "descuento_precio") {
    precio = prod.precio_principal * (1 - (rule.descuento_pct ?? 0) / 100);
  }

  precio = Math.max(precio, rule.precio_minimo ?? 0);
  precio = applyRedondeo(precio, rule.redondeo ?? "ninguno");

  if (rule.base_precio === "con_impuestos") {
    const ieps = prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0;
    const iva = prod.tiene_iva ? (prod.iva_pct ?? 0) : 0;
    const div = (1 + ieps / 100) * (1 + iva / 100);
    if (div > 0) precio = precio / div;
  }

  return Math.round(precio * 100) / 100;
}

/* ── Main handler ── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "Token requerido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Lista de precios by share_token
    const { data: lista, error: listaErr } = await supabase
      .from("lista_precios")
      .select("id, nombre, empresa_id, tarifa_id, share_activo")
      .eq("share_token", token)
      .eq("activa", true)
      .maybeSingle();

    if (listaErr || !lista) return json({ error: "Catálogo no encontrado" }, 404);
    if (!lista.share_activo) return json({ error: "Este catálogo no está activo actualmente" }, 403);

    // 2. Empresa info
    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre, logo_url, telefono, moneda")
      .eq("id", lista.empresa_id)
      .maybeSingle();

    // 3. Tarifa rules for this lista
    const { data: tarifaRules } = await supabase
      .from("tarifa_lineas")
      .select("aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id")
      .eq("tarifa_id", lista.tarifa_id)
      .eq("lista_precio_id", lista.id);

    const rules: Rule[] = (tarifaRules ?? []) as Rule[];

    // 4. Determine which product IDs to include
    // Collect explicit product_ids from rules
    const explicitProdIds = new Set<string>();
    const hasGlobalOrCatRule = rules.some((r) => r.aplica_a === "todos" || r.aplica_a === "categoria");

    rules.forEach((r) => {
      (r.producto_ids ?? []).forEach((id: string) => explicitProdIds.add(id));
    });

    // 5. Fetch products
    let query = supabase
      .from("productos")
      .select("id, nombre, codigo, costo, precio_principal, clasificacion_id, marca_id, imagen_url, unidad_venta_id, status, tiene_iva, iva_pct, tiene_ieps, ieps_pct")
      .eq("empresa_id", lista.empresa_id)
      .eq("status", "activo")
      .eq("se_puede_vender", true);

    // If only product-specific rules, filter to those IDs
    if (!hasGlobalOrCatRule && explicitProdIds.size > 0) {
      query = query.in("id", [...explicitProdIds]);
    }

    const { data: productos } = await query.limit(500);

    if (!productos || productos.length === 0) {
      return json({ empresa, lista_nombre: lista.nombre, productos: [], categorias: [], marcas: [] });
    }

    // 6. Get clasificaciones and marcas names
    const clasifIds = [...new Set(productos.map((p: any) => p.clasificacion_id).filter(Boolean))];
    const marcaIds = [...new Set(productos.map((p: any) => p.marca_id).filter(Boolean))];
    const unidadIds = [...new Set(productos.map((p: any) => p.unidad_venta_id).filter(Boolean))];

    const [clasifRes, marcaRes, unidadRes] = await Promise.all([
      clasifIds.length > 0
        ? supabase.from("clasificaciones").select("id, nombre").in("id", clasifIds)
        : { data: [] },
      marcaIds.length > 0
        ? supabase.from("marcas").select("id, nombre").in("id", marcaIds)
        : { data: [] },
      unidadIds.length > 0
        ? supabase.from("unidades").select("id, abreviatura").in("id", unidadIds)
        : { data: [] },
    ]);

    const clasifMap = new Map((clasifRes.data ?? []).map((c: any) => [c.id, c.nombre]));
    const marcaMap = new Map((marcaRes.data ?? []).map((m: any) => [m.id, m.nombre]));
    const unidadMap = new Map((unidadRes.data ?? []).map((u: any) => [u.id, u.abreviatura]));

    // 7. Enrich products with resolved prices
    const enriched = productos
      .map((p: any) => {
        const precio = resolvePrice(rules, p as Prod, lista.id);
        if (precio <= 0) return null; // Skip products with no valid price
        return {
          id: p.id,
          nombre: p.nombre,
          sku: p.codigo,
          categoria: clasifMap.get(p.clasificacion_id) ?? null,
          marca: marcaMap.get(p.marca_id) ?? null,
          imagen_url: p.imagen_url,
          unidad_venta: unidadMap.get(p.unidad_venta_id) ?? null,
          precio,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

    const categorias = [...new Set(enriched.map((p: any) => p.categoria).filter(Boolean))].sort();
    const marcas = [...new Set(enriched.map((p: any) => p.marca).filter(Boolean))].sort();

    return json({ empresa, lista_nombre: lista.nombre, productos: enriched, categorias, marcas });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
