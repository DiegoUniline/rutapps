import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyToken } from "../_shared/tiendaAuth.ts";
import { resolvePrice, type Rule, type Prod } from "../_shared/tiendaPricing.ts";

type ExtractedItem = { query: string; cantidad: number };
type ProductRow = Prod & {
  id: string; nombre: string; codigo: string | null; notas: string | null;
  imagen_url: string | null; unidad_venta_id: string | null; vender_sin_stock: boolean;
};

const normalize = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => normalize(s).split(/\s+/).filter((x) => x.length > 1);
const clampQty = (n: unknown) => Math.max(0.01, Math.min(99999, Number(n) || 1));

function score(query: string, p: { nombre: string; codigo?: string | null; notas?: string | null }) {
  const q = normalize(query); const name = normalize(p.nombre); const code = normalize(p.codigo);
  if (!q) return 0;
  if (code && q === code) return 1;
  if (q === name) return .99;
  if (name.includes(q)) return .91;
  if (q.includes(name) && name.length > 3) return .88;
  const qt = tokens(q), nt = new Set(tokens(`${p.nombre} ${p.codigo ?? ""} ${p.notas ?? ""}`));
  if (!qt.length) return 0;
  const hits = qt.filter((x) => nt.has(x)).length;
  const overlap = hits / qt.length;
  const prefix = qt.some((x) => [...nt].some((y) => y.startsWith(x) || x.startsWith(y))) ? .08 : 0;
  return Math.min(.87, overlap * .78 + prefix);
}

function fallbackParse(text: string): ExtractedItem[] {
  const clean = text.replace(/\b(quiero|necesito|mandame|mándame|agregame|agrégame|ponme|dame)\b/gi, " ")
    .replace(/\b(por favor|porfa)\b/gi, " ").trim();
  const parts = clean.split(/\s*(?:,|;|\n|\by\b)\s*/i).filter(Boolean);
  const out: ExtractedItem[] = [];
  for (const part of parts) {
    const m = part.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:(cajas?|piezas?|pzas?|bultos?|paquetes?|sacos?|kg|kilos?|lts?|litros?|botellas?|unidades?)\s*)?(?:de\s+)?(.+)$/i);
    if (m) out.push({ cantidad: clampQty(m[1].replace(",", ".")), query: `${m[2] ?? ""} ${m[3]}`.trim() });
    else if (part.trim()) out.push({ cantidad: 1, query: part.trim() });
  }
  return out.slice(0, 30);
}

function responseText(data: any): string | null {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output ?? []) for (const c of item?.content ?? []) if (c?.type === "output_text" && typeof c.text === "string") return c.text;
  return null;
}

async function extractWithAI(text: string, apiKey?: string): Promise<ExtractedItem[]> {
  if (!apiKey) return fallbackParse(text);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [
          { role: "system", content: [{ type: "input_text", text: "Extrae exclusivamente los renglones de compra. Devuelve nombre/frase del producto y cantidad solicitada. No inventes productos, precios ni cantidades. Si no se especifica cantidad usa 1. Español de México." }] },
          { role: "user", content: [{ type: "input_text", text }] },
        ],
        text: { format: { type: "json_schema", name: "pedido", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["items"], properties: {
            items: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["query", "cantidad"], properties: { query: { type: "string" }, cantidad: { type: "number" } } } }
          }
        } } },
      }),
    });
    if (!r.ok) return fallbackParse(text);
    const data = await r.json();
    const raw = responseText(data);
    if (!raw) return fallbackParse(text);
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items.map((x: any) => ({ query: String(x.query ?? "").trim(), cantidad: clampQty(x.cantidad) })).filter((x: ExtractedItem) => x.query).slice(0, 30);
  } catch { return fallbackParse(text); }
}

async function transcribeAudio(audioBase64: string, mimeType: string, apiKey?: string) {
  if (!apiKey) throw new Error("El audio requiere configurar OPENAI_API_KEY en Supabase.");
  const raw = audioBase64.includes(",") ? audioBase64.split(",").pop()! : audioBase64;
  if (raw.length > 9_000_000) throw new Error("El audio es demasiado grande. Graba un mensaje más corto.");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new File([bytes], `pedido.${ext}`, { type: mimeType || "audio/webm" }));
  form.append("model", "gpt-transcribe");
  form.append("language", "es");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message ?? "No se pudo transcribir el audio");
  return String(data?.text ?? "").trim();
}

async function pageProducts(admin: any, empresaId: string): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await admin.from("productos")
      .select("id,nombre,codigo,notas,costo,precio_principal,clasificacion_id,imagen_url,unidad_venta_id,tiene_iva,iva_pct,tiene_ieps,ieps_pct,usa_listas_precio,vender_sin_stock")
      .eq("empresa_id", empresaId).eq("status", "activo").eq("se_puede_vender", true)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...((data ?? []) as ProductRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function pricingContext(admin: any, cfg: any, clienteId?: string | null) {
  let listaId = cfg.lista_precios_default_id ?? null;
  if (clienteId && cfg.usar_lista_cliente !== false) {
    const { data: cli } = await admin.from("clientes").select("lista_precio_id").eq("id", clienteId).maybeSingle();
    if (cli?.lista_precio_id) listaId = cli.lista_precio_id;
  }
  let tarifaId: string | null = null;
  if (listaId) {
    const { data: lp } = await admin.from("lista_precios").select("tarifa_id").eq("id", listaId).maybeSingle();
    tarifaId = lp?.tarifa_id ?? null;
  }
  let rules: Rule[] = [];
  if (tarifaId && listaId) {
    const { data } = await admin.from("tarifa_lineas")
      .select("aplica_a,producto_ids,clasificacion_ids,tipo_calculo,precio,precio_minimo,margen_pct,descuento_pct,redondeo,base_precio,lista_precio_id")
      .eq("tarifa_id", tarifaId).or(`lista_precio_id.eq.${listaId},lista_precio_id.is.null`);
    rules = (data ?? []) as Rule[];
  }
  return { listaId, rules };
}

async function hydrateCandidates(admin: any, cfg: any, products: ProductRow[], extracted: ExtractedItem[], clienteId?: string | null) {
  const shortlisted = extracted.map((item) => ({ item, ranked: products.map((p) => ({ p, s: score(item.query, p) })).sort((a, b) => b.s - a.s).slice(0, 5) }));
  const ids = [...new Set(shortlisted.flatMap((x) => x.ranked.map((r) => r.p.id)))];
  const unitIds = [...new Set(products.filter((p) => ids.includes(p.id)).map((p) => p.unidad_venta_id).filter(Boolean))];
  const [{ data: pres }, { data: units }, { data: stockRows }, price] = await Promise.all([
    ids.length ? admin.from("producto_presentaciones").select("id,producto_id,nombre,factor_base,precio_especial").in("producto_id", ids).eq("activo", true) : { data: [] },
    unitIds.length ? admin.from("unidades").select("id,abreviatura").in("id", unitIds) : { data: [] },
    ids.length ? (cfg.almacen_id ? admin.from("stock_almacen").select("producto_id,cantidad").eq("almacen_id", cfg.almacen_id).in("producto_id", ids) : admin.from("stock_almacen").select("producto_id,cantidad").in("producto_id", ids)) : { data: [] },
    pricingContext(admin, cfg, clienteId),
  ]);
  const uMap = new Map((units ?? []).map((u: any) => [u.id, u.abreviatura]));
  const sMap = new Map<string, number>();
  (stockRows ?? []).forEach((s: any) => sMap.set(s.producto_id, (sMap.get(s.producto_id) ?? 0) + Number(s.cantidad ?? 0)));
  const pMap = new Map<string, any[]>();
  (pres ?? []).forEach((pr: any) => { const arr = pMap.get(pr.producto_id) ?? []; arr.push(pr); pMap.set(pr.producto_id, arr); });

  return shortlisted.map(({ item, ranked }) => {
    const variants: any[] = [];
    ranked.forEach(({ p }) => {
      const basePrice = resolvePrice(price.rules, p, price.listaId);
      const baseStock = sMap.get(p.id) ?? 0;
      variants.push({
        id: p.id, producto_id: p.id, nombre: p.nombre, sku: p.codigo, imagen_url: p.imagen_url,
        unidad: uMap.get(p.unidad_venta_id) ?? null, precio: basePrice, stock: baseStock,
        vender_sin_stock: !!p.vender_sin_stock, presentacion_id: null, factor_base: 1,
      });
      for (const pr of pMap.get(p.id) ?? []) {
        const factor = Math.max(1, Number(pr.factor_base) || 1);
        variants.push({
          id: `${p.id}::${pr.id}`, producto_id: p.id, nombre: `${p.nombre} — ${pr.nombre}`, sku: p.codigo,
          imagen_url: p.imagen_url, unidad: pr.nombre,
          precio: pr.precio_especial != null ? Number(pr.precio_especial) : basePrice * factor,
          stock: Math.floor(baseStock / factor), vender_sin_stock: !!p.vender_sin_stock,
          presentacion_id: pr.id, factor_base: factor,
        });
      }
    });
    const rankedVariants = variants.map((v) => ({ ...v, confidence: score(item.query, { nombre: v.nombre, codigo: v.sku }) }))
      .sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    const first = rankedVariants[0]; const second = rankedVariants[1];
    const unambiguous = !!first && first.confidence >= .56 && (!second || first.confidence - second.confidence >= .06 || first.confidence >= .9);
    return { query: item.query, cantidad: item.cantidad, match: unambiguous ? first : null, alternatives: rankedVariants };
  });
}

async function currentProductsByIds(admin: any, cfg: any, products: ProductRow[], ids: string[], clienteId: string) {
  const { listaId, rules } = await pricingContext(admin, cfg, clienteId);
  const selected = products.filter((p) => ids.includes(p.id));
  const unitIds = [...new Set(selected.map((p) => p.unidad_venta_id).filter(Boolean))];
  const [{ data: units }, { data: stockRows }] = await Promise.all([
    unitIds.length ? admin.from("unidades").select("id,abreviatura").in("id", unitIds) : { data: [] },
    ids.length ? (cfg.almacen_id ? admin.from("stock_almacen").select("producto_id,cantidad").eq("almacen_id", cfg.almacen_id).in("producto_id", ids) : admin.from("stock_almacen").select("producto_id,cantidad").in("producto_id", ids)) : { data: [] },
  ]);
  const uMap = new Map((units ?? []).map((u: any) => [u.id, u.abreviatura]));
  const sMap = new Map<string, number>();
  (stockRows ?? []).forEach((s: any) => sMap.set(s.producto_id, (sMap.get(s.producto_id) ?? 0) + Number(s.cantidad ?? 0)));
  return new Map(selected.map((p) => [p.id, {
    producto_id: p.id, nombre: p.nombre, sku: p.codigo, imagen_url: p.imagen_url,
    unidad: uMap.get(p.unidad_venta_id) ?? null, precio: resolvePrice(rules, p, listaId),
    stock: sMap.get(p.id) ?? 0, vender_sin_stock: !!p.vender_sin_stock,
    presentacion_id: null, factor_base: 1,
  }]));
}

async function suggestedOrder(admin: any, cfg: any, empresaId: string, clienteId: string, products: ProductRow[]) {
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const { data: sales, error } = await admin.from("ventas").select("id,fecha")
    .eq("empresa_id", empresaId).eq("cliente_id", clienteId)
    .in("status", ["confirmado", "entregado", "facturado"]).gte("fecha", since).order("fecha", { ascending: true });
  if (error) throw error;
  const saleIds = (sales ?? []).map((v: any) => v.id);
  if (!saleIds.length) return [];
  const saleDate = new Map((sales ?? []).map((v: any) => [v.id, v.fecha]));
  const lines: any[] = [];
  for (let i = 0; i < saleIds.length; i += 300) {
    const { data, error: lErr } = await admin.from("venta_lineas").select("venta_id,producto_id,cantidad").in("venta_id", saleIds.slice(i, i + 300));
    if (lErr) throw lErr; lines.push(...(data ?? []));
  }
  const byProduct = new Map<string, Map<string, number>>();
  for (const l of lines) {
    if (!l.producto_id) continue;
    const date = saleDate.get(l.venta_id); if (!date) continue;
    const m = byProduct.get(l.producto_id) ?? new Map<string, number>();
    m.set(date, (m.get(date) ?? 0) + Number(l.cantidad ?? 0)); byProduct.set(l.producto_id, m);
  }
  const today = new Date();
  const stats: any[] = [];
  byProduct.forEach((events, productoId) => {
    const rows = [...events.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (rows.length < 2) return;
    const lastRows = rows.slice(-5);
    const avgQty = lastRows.reduce((s, [, q]) => s + q, 0) / lastRows.length;
    const intervals: number[] = [];
    for (let i = 1; i < rows.length; i++) intervals.push(Math.max(1, (new Date(rows[i][0]).getTime() - new Date(rows[i - 1][0]).getTime()) / 86400000));
    const avgInterval = intervals.reduce((s, n) => s + n, 0) / intervals.length;
    const lastDate = rows[rows.length - 1][0];
    const daysSince = Math.max(0, (today.getTime() - new Date(lastDate).getTime()) / 86400000);
    const dueRatio = daysSince / Math.max(1, avgInterval);
    if (dueRatio < .6 && rows.length < 4) return;
    stats.push({ productoId, compras: rows.length, avgQty, avgInterval, lastDate, daysSince, dueRatio });
  });
  stats.sort((a, b) => (b.dueRatio + Math.min(b.compras, 10) * .03) - (a.dueRatio + Math.min(a.compras, 10) * .03));
  const top = stats.slice(0, 20);
  const map = await currentProductsByIds(admin, cfg, products, top.map((x) => x.productoId), clienteId);
  return top.map((s) => {
    const p = map.get(s.productoId); if (!p) return null;
    return { ...p, cantidad_sugerida: Math.max(1, Math.round(s.avgQty)), compras_ultimo_anio: s.compras,
      frecuencia_dias: Math.round(s.avgInterval), dias_desde_ultima: Math.round(s.daysSince), ultima_compra: s.lastDate };
  }).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const body = await req.json();
    const slug = String(body?.slug ?? "").trim();
    if (!slug) return json({ error: "slug requerido" }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await admin.from("tienda_config")
      .select("empresa_id,activa,lista_precios_default_id,usar_lista_cliente,almacen_id")
      .eq("slug", slug).maybeSingle();
    if (!cfg?.activa) return json({ error: "Tienda no disponible" }, 404);

    let payload: any = null;
    if (body?.token) {
      payload = await verifyToken(String(body.token), Deno.env.get("TIENDA_JWT_SECRET")!);
      if (!payload || payload.empresa_id !== cfg.empresa_id) return json({ error: "Sesión de tienda inválida" }, 401);
    }

    const products = await pageProducts(admin, cfg.empresa_id);
    if (body?.action === "suggested") {
      if (!payload?.cliente_id) return json({ error: "Inicia sesión para ver tu pedido sugerido" }, 401);
      return json({ items: await suggestedOrder(admin, cfg, cfg.empresa_id, payload.cliente_id, products) });
    }

    let text = String(body?.text ?? "").trim();
    const apiKey = Deno.env.get("OPENAI_API_KEY") ?? undefined;
    if (body?.audio_base64) text = await transcribeAudio(String(body.audio_base64), String(body.mime_type ?? "audio/webm"), apiKey);
    if (!text || text.length > 4000) return json({ error: "Escribe o graba un pedido válido (máximo 4000 caracteres)." }, 400);

    const extracted = await extractWithAI(text, apiKey);
    if (!extracted.length) return json({ text, items: [], message: "No pude detectar productos y cantidades en el mensaje." });
    const items = await hydrateCandidates(admin, cfg, products, extracted, payload?.cliente_id ?? null);
    return json({ text, items });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
