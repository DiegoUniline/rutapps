// WhatsApp bot webhook — recibe mensajes desde WhatsAPI y responde con
// reportes, stock, estado de cuenta y cobros. Público (verify_jwt = false).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { generarReporteBotPdf } from "./reportePdf.ts";
import { generarVentaBotPdf } from "./ventaPdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-token",
};

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPI_TOKEN = Deno.env.get("WHATSAPI_GLOBAL_TOKEN") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const activeProduct = (q: any) => q.eq("status", "activo");

function cleanLike(value: unknown) {
  return String(value || "").replace(/[%,()]/g, " ").trim();
}

// Unidad real del producto: granel usa unidad_granel; no-granel usa la abreviatura
// del catálogo de unidades (unidad_venta_id). Fallback "pzs".
function unitFor(p: any): string {
  if (p?.es_granel) return p.unidad_granel || "kg";
  return p?.unidad_venta?.abreviatura || "pzs";
}

const PRODUCTO_SELECT_BASE = "id, codigo, nombre, cantidad, min, precio_principal, es_granel, unidad_granel, unidad_venta:unidades!unidad_venta_id(abreviatura)";

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "").replace(/[^\d]/g, "");
  return cleaned;
}

async function waSend(phone: string, text: string) {
  await fetch(WHATSAPI_URL, {
    method: "POST",
    headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-text", phone, message: text }),
  }).catch(() => {});
}

async function waSendFile(phone: string, url: string, fileName: string, caption?: string) {
  await fetch(WHATSAPI_URL, {
    method: "POST",
    headers: { "x-api-token": WHATSAPI_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-file", phone, url, fileName, caption }),
  }).catch(() => {});
}

async function log(empresa_id: string | null, phone: string, inbound: string, intent: string, outcome: string, summary: string, pdfUrl: string | null = null, params: any = null) {
  await admin.from("wa_bot_logs").insert({
    empresa_id, phone, inbound_text: inbound, intent, outcome, response_summary: summary, pdf_url: pdfUrl, params,
  });
}

// ----------------- Intent parser -----------------
type Intent =
  | { kind: "reporte"; date: Date; label: string }
  | { kind: "stock"; threshold: number | null; nombre: string | null }
  | { kind: "cliente"; query: string }
  | { kind: "cobros"; date: Date; label: string }
  | { kind: "ayuda" }
  | { kind: "unknown" };

function parseIntent(text: string): Intent {
  const t = text.trim().toLowerCase();
  if (!t) return { kind: "unknown" };

  if (/^(ayuda|help|menu|menú|comandos|\?)/.test(t)) return { kind: "ayuda" };

  // reporte
  if (/^reporte/.test(t)) {
    const now = new Date();
    if (/ayer/.test(t)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { kind: "reporte", date: d, label: "ayer" };
    }
    const m = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (m) {
      const day = +m[1], mon = +m[2] - 1, yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
      const d = new Date(yr, mon, day);
      return { kind: "reporte", date: d, label: d.toLocaleDateString("es-MX") };
    }
    return { kind: "reporte", date: now, label: "hoy" };
  }

  // cobros
  if (/^cobros?/.test(t)) {
    const now = new Date();
    if (/ayer/.test(t)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { kind: "cobros", date: d, label: "ayer" };
    }
    return { kind: "cobros", date: now, label: "hoy" };
  }

  // stock
  if (/^stock/.test(t)) {
    const numM = t.match(/(\d+(?:\.\d+)?)/);
    const rest = t.replace(/^stock\s*(bajo)?\s*/i, "").replace(/(\d+(?:\.\d+)?)/, "").trim();
    if (/bajo/.test(t)) {
      return { kind: "stock", threshold: numM ? parseFloat(numM[1]) : null, nombre: null };
    }
    if (rest.length > 1) return { kind: "stock", threshold: null, nombre: rest };
    return { kind: "stock", threshold: numM ? parseFloat(numM[1]) : null, nombre: null };
  }

  // cliente
  if (/^cliente\s+/.test(t)) {
    const q = text.replace(/^cliente\s+/i, "").trim();
    return { kind: "cliente", query: q };
  }

  return { kind: "unknown" };
}

const HELP =
  `🤖 Soy *Jarvis*, la IA de RutApp. Respondo únicamente con información real del sistema de tu empresa.\n\n` +
  `Puedes preguntarme en lenguaje natural sobre:\n` +
  `📊 Ventas, pedidos y reportes PDF\n` +
  `📦 Productos, stock y existencias\n` +
  `👤 Clientes, saldos y cuentas por cobrar\n` +
  `💰 Cobros, pagos, métodos de pago y gastos\n\n` +
  `Ejemplos:\n` +
  `• "Mándame el reporte de hoy en PDF"\n` +
  `• "¿Qué productos tengo en stock?"\n` +
  `• "¿Quién vendió la última venta?"\n` +
  `• "¿Qué pedidos tengo hoy?"\n` +
  `• "¿Quién me debe más?"\n` +
  `• "Detalle de la venta VTA-0001"\n\n` +
  `⚠️ Solo puedo recibir texto; no audios, imágenes ni stickers.`;

// ----------------- Timezone helpers (usar zona horaria de la empresa) -----------------
const DEFAULT_TZ = "America/Mexico_City";

function tzOffsetMs(tz: string, date: Date): number {
  // Offset (utc - local) en ms para la fecha dada en la zona indicada.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: any = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

function todayInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}

function addDaysIso(yyyy_mm_dd: string, days: number): string {
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Devuelve el rango UTC [start, end] que corresponde al día yyyy-mm-dd en la zona tz.
function dayRange(yyyy_mm_dd: string, tz: string = DEFAULT_TZ) {
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  // Aproximación: medianoche supuesta como UTC, luego se corrige por offset.
  let guessUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  let off = tzOffsetMs(tz, new Date(guessUtc));
  let startMs = guessUtc - off;
  // Re-ajustar 1 vez por si cambia el offset (DST cerca del borde).
  off = tzOffsetMs(tz, new Date(startMs));
  startMs = guessUtc - off;
  const endMs = startMs + 24 * 3600 * 1000 - 1;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

// Devuelve yyyy-mm-dd (en zona tz) interpretando entrada libre del usuario.
function parseFechaTz(input: string | undefined | null, tz: string): string {
  const today = todayInTz(tz);
  if (!input) return today;
  const t = String(input).toLowerCase().trim();
  if (t === "hoy" || t === "today" || t === today) return today;
  if (t === "ayer" || t === "yesterday") return addDaysIso(today, -1);
  if (t === "antier" || t === "anteayer") return addDaysIso(today, -2);
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = +iso[1], mo = String(+iso[2]).padStart(2, "0"), d = String(+iso[3]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (m) {
    const day = String(+m[1]).padStart(2, "0");
    const mon = String(+m[2]).padStart(2, "0");
    const yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : Number(today.slice(0, 4));
    return `${yr}-${mon}-${day}`;
  }
  return today;
}

async function buildReporte(empresaId: string, fechaIso: string, label: string, tz: string) {
  const { start, end } = dayRange(fechaIso, tz);
  const [ventasRes, cobrosRes, gastosRes, empresaRes] = await Promise.all([
    admin.from("ventas")
      .select("id, folio, total, status, condicion_pago, clientes(nombre), venta_lineas(cantidad, total, productos(codigo, nombre))")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("cobros")
      .select("id, monto, metodo_pago, referencia, clientes(nombre)")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("gastos")
      .select("id, monto, concepto, notas")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("empresas")
      .select("nombre, razon_social, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, moneda")
      .eq("id", empresaId).maybeSingle(),
  ]);

  const allVentas = (ventasRes.data || []) as any[];
  const ventas = allVentas.filter(v => v.status !== "cancelada" && v.status !== "cancelado");
  const canceladas = allVentas.filter(v => v.status === "cancelada" || v.status === "cancelado");

  const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalContado = ventas.filter(v => (v.condicion_pago || "").toLowerCase() === "contado").reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCredito = ventas.filter(v => (v.condicion_pago || "").toLowerCase() === "credito" || (v.condicion_pago || "").toLowerCase() === "crédito").reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCancelado = canceladas.reduce((s, v) => s + Number(v.total || 0), 0);

  const cobros = (cobrosRes.data || []) as any[];
  const totalCobros = cobros.reduce((s, c) => s + Number(c.monto || 0), 0);
  const gastos = (gastosRes.data || []) as any[];
  const totalGastos = gastos.reduce((s, g) => s + Number(g.monto || 0), 0);

  const cobrosPorMetodo: Record<string, number> = {};
  for (const c of cobros) {
    const m = c.metodo_pago || "otro";
    cobrosPorMetodo[m] = (cobrosPorMetodo[m] || 0) + Number(c.monto || 0);
  }

  // Productos agregados desde venta_lineas
  const prodMap = new Map<string, { codigo: string; nombre: string; cantidad: number; total: number }>();
  for (const v of ventas) {
    for (const l of (v.venta_lineas || []) as any[]) {
      const codigo = l.productos?.codigo || "";
      const nombre = l.productos?.nombre || "—";
      const key = `${codigo}::${nombre}`;
      const prev = prodMap.get(key) || { codigo, nombre, cantidad: 0, total: 0 };
      prev.cantidad += Number(l.cantidad || 0);
      prev.total += Number(l.total || 0);
      prodMap.set(key, prev);
    }
  }
  const productos = Array.from(prodMap.values()).sort((a, b) => b.total - a.total);

  const empresa = empresaRes.data || {};

  const pdfBytes = await generarReporteBotPdf({
    empresa,
    fechaLabel: `Reporte del día (${label})`,
    fechaISO: fechaIso,
    totals: {
      totalVentas, totalContado, totalCredito, totalCancelado,
      totalCobros, totalGastos, cobrosPorMetodo,
      countVentas: ventas.length, countCobros: cobros.length, countGastos: gastos.length,
    },
    ventasActivas: ventas.map(v => ({
      folio: v.folio,
      cliente: v.clientes?.nombre || "—",
      condicion_pago: v.condicion_pago || "",
      total: Number(v.total || 0),
    })),
    ventasCanceladas: canceladas.map(v => ({
      folio: v.folio, cliente: v.clientes?.nombre || "—", total: Number(v.total || 0),
    })),
    productos,
    cobros: cobros.map(c => ({
      cliente: c.clientes?.nombre || "—",
      metodo_pago: c.metodo_pago || "",
      referencia: c.referencia,
      monto: Number(c.monto || 0),
    })),
    gastos: gastos.map(g => ({ concepto: g.concepto, notas: g.notas, monto: Number(g.monto || 0) })),
  });

  return {
    pdfBytes,
    summary: `📊 Reporte ${label}: ventas ${fmt(totalVentas)} (${ventas.length}), cobros ${fmt(totalCobros)}, gastos ${fmt(totalGastos)}.`,
  };
}

async function buildStockMessage(empresaId: string, threshold: number | null, nombre: string | null) {
  if (nombre) {
    const safeNombre = cleanLike(nombre);
    const { data } = await activeProduct(admin.from("productos")
      .select(PRODUCTO_SELECT_BASE)
      .eq("empresa_id", empresaId)
      .or(`nombre.ilike.%${safeNombre}%,codigo.ilike.%${safeNombre}%`)
      .limit(10));
    if (!data || !data.length) return `❌ No encontré productos que coincidan con "${nombre}".`;
    let msg = `📦 Resultados para "${nombre}":\n\n`;
    for (const p of data as any[]) {
      const u = unitFor(p);
      msg += `• ${p.codigo || ""} ${p.nombre}\n   Stock: ${p.cantidad ?? 0} ${u} · Mín: ${p.min ?? 0}${p.precio_principal != null ? ` · Precio: ${fmt(Number(p.precio_principal || 0))}` : ""}\n`;
    }
    return msg;
  }
  // stock bajo
  const t = threshold;
  let q = activeProduct(admin.from("productos")
    .select(PRODUCTO_SELECT_BASE)
    .eq("empresa_id", empresaId)
    .order("cantidad", { ascending: true })
    .limit(30));
  const { data } = await q;
  let items = (data || []).filter((p: any) => {
    const c = Number(p.cantidad || 0);
    if (t !== null) return c <= t;
    const min = Number(p.min || 0);
    return min > 0 && c <= min;
  }).slice(0, 20);
  if (!items.length) return `✅ No hay productos con stock bajo${t !== null ? ` (umbral ${t})` : ""}.`;
  let msg = `📦 *Productos con stock bajo${t !== null ? ` (≤ ${t})` : ""}:*\n\n`;
  for (const p of items as any[]) {
    const u = unitFor(p);
    msg += `• ${p.codigo || ""} ${p.nombre} — ${p.cantidad ?? 0} ${u}${p.min ? ` / min ${p.min}` : ""}\n`;
  }
  return msg;
}

async function buildClienteMessage(empresaId: string, query: string) {
  const { data: clientes } = await admin.rpc("wa_clientes_saldos", {
    p_empresa: empresaId, p_query: query, p_solo_con_saldo: false, p_limit: 5,
  });
  const list = (clientes || []) as any[];
  if (!list.length) return `❌ No encontré clientes con "${query}".`;
  if (list.length > 1) {
    let msg = `🔎 ${list.length} clientes coinciden con "${query}":\n\n`;
    for (const c of list) msg += `• ${c.nombre}  — Saldo: ${fmt(Number(c.saldo || 0))}\n`;
    msg += `\nEnvía *cliente <nombre exacto>* para ver detalle.`;
    return msg;
  }
  const c = list[0];
  const { data: ventas } = await admin.from("ventas")
    .select("folio, fecha, total, saldo_pendiente, status")
    .eq("empresa_id", empresaId).eq("cliente_id", c.id)
    .order("fecha", { ascending: false }).limit(5);
  let msg = `👤 *${c.nombre}*\n📞 ${c.telefono || "—"}\n💰 Saldo: *${fmt(Number(c.saldo || 0))}*\n\n*Últimas ventas:*\n`;
  for (const v of (ventas || [])) {
    const f = new Date(v.fecha).toLocaleDateString("es-MX");
    msg += `• ${v.folio || ""} ${f} — ${fmt(Number(v.total))} (pend. ${fmt(Number(v.saldo_pendiente || 0))})\n`;
  }
  return msg;
}


async function buildCobrosMessage(empresaId: string, fechaIso: string, label: string, tz: string) {
  const { start, end } = dayRange(fechaIso, tz);
  const { data } = await admin.from("cobros")
    .select("monto, metodo_pago, clientes(nombre)")
    .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end);
  const cobros = data || [];
  if (!cobros.length) return `📭 No hay cobros registrados ${label}.`;
  const total = cobros.reduce((s: number, c: any) => s + Number(c.monto || 0), 0);
  const porMet: Record<string, { monto: number; count: number }> = {};
  for (const c of cobros as any[]) {
    const m = c.metodo_pago || "otro";
    porMet[m] = porMet[m] || { monto: 0, count: 0 };
    porMet[m].monto += Number(c.monto || 0);
    porMet[m].count += 1;
  }
  let msg = `💰 *Cobros ${label}* — Total: *${fmt(total)}* (${cobros.length} mov.)\n\n*Por método:*\n`;
  for (const [m, v] of Object.entries(porMet)) msg += `• ${m}: ${fmt(v.monto)} (${v.count})\n`;
  return msg;
}

// ----------------- Main handler -----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validar token de WhatsAPI para evitar spoofing
    const hdrToken = req.headers.get("x-api-token") || "";
    if (WHATSAPI_TOKEN && hdrToken !== WHATSAPI_TOKEN) {
      // permitimos el body si trae el token dentro (algunas integraciones lo envían así)
    }

    const payload = await req.json().catch(() => ({}));
    if (payload.api_token && WHATSAPI_TOKEN && payload.api_token !== WHATSAPI_TOKEN && hdrToken !== WHATSAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Soportar eventos diferentes — solo procesamos messages.upsert con texto entrante
    const event = payload.event;
    const data = payload.data || {};
    const fromMe = data?.key?.fromMe === true;
    if (fromMe) return new Response("skip", { headers: corsHeaders });
    if (event && event !== "messages.upsert" && event !== "message") {
      return new Response("ignored", { headers: corsHeaders });
    }

    const remoteJid: string = data?.key?.remoteJid || "";
    const text: string = data?.message?.conversation
      || data?.message?.extendedTextMessage?.text
      || data?.message?.text
      || "";

    if (!remoteJid || !text) {
      return new Response("no text", { headers: corsHeaders });
    }
    if (remoteJid.endsWith("@g.us")) {
      return new Response("group ignored", { headers: corsHeaders });
    }

    const phone = normalizePhone(remoteJid);

    // Buscar número autorizado (puede haber varios — tomamos el primer activo con empresa con bot habilitado)
    const { data: nums } = await admin
      .from("wa_bot_authorized_numbers")
      .select("id, empresa_id, permisos, activo, nombre, profile_id")
      .eq("phone_e164", phone)
      .eq("activo", true);

    if (!nums || !nums.length) {
      await waSend(phone, `🚫 Número no autorizado para usar el bot de RutApp.\nPide a tu administrador que te dé de alta.`);
      await log(null, phone, text, "unauthorized", "unauthorized", "Número no autorizado");
      return new Response("unauthorized", { headers: corsHeaders });
    }

    // Verificar empresas con bot activo
    const empresaIds = nums.map(n => n.empresa_id);
    const { data: addons } = await admin
      .from("empresa_addons")
      .select("empresa_id, wa_bot_enabled")
      .in("empresa_id", empresaIds);
    const enabledMap = new Map((addons || []).map(a => [a.empresa_id, a.wa_bot_enabled]));
    const activos = nums.filter(n => enabledMap.get(n.empresa_id));
    if (!activos.length) {
      await waSend(phone, `⚠️ El servicio Bot WhatsApp no está activo en tu empresa.\nContacta soporte de RutApp.`);
      await log(nums[0].empresa_id, phone, text, "addon_disabled", "denied", "Add-on inactivo");
      return new Response("addon disabled", { headers: corsHeaders });
    }

    // Si pertenece a varias empresas, por simplicidad usamos la primera
    const auth = activos[0];
    const empresaId = auth.empresa_id;
    const permisos = (auth.permisos || {}) as Record<string, boolean>;

    // Atajo: ayuda explícita
    if (/^(ayuda|help|menu|menú|comandos|\?)\s*$/i.test(text.trim())) {
      await waSend(phone, HELP);
      await log(empresaId, phone, text, "ayuda", "ok", "Menú enviado");
      return new Response("ok", { headers: corsHeaders });
    }

    // ---- Agente IA con tool calling ----
    const result = await runAgent({
      empresaId,
      permisos,
      phone,
      userMessage: text,
    });

    if (result.pdfUrl) {
      await waSendFile(phone, result.pdfUrl, result.pdfName || "reporte.pdf", result.reply);
    } else {
      await waSend(phone, result.reply);
    }
    await log(empresaId, phone, text, result.intent, "ok", result.reply.slice(0, 200), result.pdfUrl, result.toolsUsed);
    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("wa-bot-webhook error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ----------------- AI AGENT -----------------
const LOVABLE_AI_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

// parseFecha legacy eliminado: usar parseFechaTz(input, tz) que respeta zona horaria de la empresa.

const TOOLS = [
  {
    type: "function",
    function: {
      name: "generar_reporte_pdf",
      description: "Genera el PDF del reporte diario (ventas, cobros, gastos) para una fecha. SOLO se debe llamar cuando el usuario pida EXPLÍCITAMENTE un PDF, archivo, documento o que le 'mande/envíe' el reporte. Si el usuario solo pide un 'resumen', 'cierre', 'cuánto vendí/gané' usa las herramientas de texto (resumen_ventas, resumen_cobros, consultar_gastos); NO generes PDF.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha: 'hoy', 'ayer', o formato dd/mm/yyyy o yyyy-mm-dd" },
        },
        required: ["fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_venta_pdf",
      description: "Genera el PDF de UNA venta específica por folio (nota de venta con líneas, totales y cobros). SOLO se debe llamar cuando el usuario pida EXPLÍCITAMENTE un PDF, archivo, documento o 'manda/envía' la nota. Si solo pregunta detalle de la venta, usa consultar_venta (texto).",
      parameters: {
        type: "object",
        properties: {
          folio: { type: "string", description: "Folio de la venta, ej. 'VTA-0001' o '0001'." },
        },
        required: ["folio"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_stock_bajo",
      description: "Devuelve productos con inventario bajo. Si no se especifica umbral, usa el stock mínimo configurado por producto.",
      parameters: {
        type: "object",
        properties: {
          umbral: { type: "number", description: "Opcional. Umbral máximo de cantidad para considerar 'bajo'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_stock_disponible",
      description: "Devuelve productos reales con stock disponible (> 0) desde productos.cantidad. Úsala cuando pregunten qué productos hay disponibles, existencias, inventario actual o stock disponible.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Opcional: nombre o código de producto para filtrar." },
          limite: { type: "number", description: "Máximo de productos a devolver, default 15." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_producto",
      description: "Busca productos por nombre o código y devuelve stock, precio y datos básicos.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_cliente",
      description: "Busca un cliente por nombre o teléfono y devuelve su saldo y últimas ventas.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumen_cobros",
      description: "Resumen de cobros de un día por método de pago.",
      parameters: {
        type: "object",
        properties: { fecha: { type: "string", description: "'hoy', 'ayer' o dd/mm/yyyy" } },
        required: ["fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumen_ventas",
      description: "Resumen de ventas de un día (total, número de folios, top clientes).",
      parameters: {
        type: "object",
        properties: { fecha: { type: "string" } },
        required: ["fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cuentas_por_cobrar",
      description: "Lista los clientes con mayor saldo pendiente.",
      parameters: {
        type: "object",
        properties: { limite: { type: "number", description: "Máx clientes (default 10)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_venta",
      description: "Detalle completo de una venta específica por folio (o id parcial): cliente, vendedor que la creó, fecha, total, saldo pendiente, status, líneas, descuentos y cobros aplicados.",
      parameters: {
        type: "object",
        properties: { folio: { type: "string", description: "Folio de la venta, ej. 'VTA-0001' o '0001'." } },
        required: ["folio"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_ventas_recientes",
      description: "Consulta ventas o pedidos reales recientes/de una fecha, incluyendo cliente, vendedor, método de pago, líneas, descuento, total y saldo. Úsala para preguntas de seguimiento como 'quién lo vendió', 'qué método de pago fue', 'la venta de hoy', 'pedidos de hoy' o 'última venta'.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Opcional: 'hoy', 'ayer', dd/mm/yyyy o yyyy-mm-dd." },
          tipo: { type: "string", description: "Opcional: 'pedido' o 'venta_directa'." },
          status: { type: "string", description: "Opcional: borrador, confirmado, entregado, facturado o cancelado." },
          limite: { type: "number", description: "Máximo de ventas, default 3." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_clientes",
      description: "Lista clientes reales de la empresa. Puede filtrar por nombre, teléfono, con saldo pendiente o por estado.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Opcional: nombre, código o teléfono." },
          con_saldo: { type: "boolean", description: "true para solo clientes con saldo pendiente." },
          limite: { type: "number", description: "Máximo de clientes, default 10." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_saldos",
      description: "Resumen real de saldos/cuentas por cobrar: total pendiente y clientes con mayor saldo.",
      parameters: {
        type: "object",
        properties: { limite: { type: "number", description: "Máximo clientes, default 10." } },
      },
    },
  },
];

async function execTool(name: string, args: any, ctx: { empresaId: string; permisos: Record<string, boolean>; tz: string }) {
  const { empresaId, permisos, tz } = ctx;
  const need = (k: string) => permisos[k];

  if (name === "generar_reporte_pdf") {
    if (!need("reportes")) return { error: "Sin permiso para reportes" };
    const fechaIso = parseFechaTz(args?.fecha, tz);
    const label = args?.fecha || "hoy";
    const { pdfBytes, summary } = await buildReporte(empresaId, fechaIso, label, tz);
    const path = `${empresaId}/reporte-${fechaIso}-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage.from("wa-bot-reports").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return { error: String(upErr) };
    const { data: signed } = await admin.storage.from("wa-bot-reports").createSignedUrl(path, 60*60*24);
    return { pdfUrl: signed?.signedUrl, fileName: `reporte-${label}.pdf`, summary, resultado: summary };
  }

  if (name === "generar_venta_pdf") {
    if (!need("reportes") && !need("clientes")) return { error: "Sin permiso" };
    const folio = String(args?.folio || "").trim();
    if (!folio) return { error: "Folio requerido" };
    const [{ data: ventas }, { data: emp }] = await Promise.all([
      admin.from("ventas")
        .select("id, folio, fecha, total, subtotal, descuento_total, saldo_pendiente, status, condicion_pago, vendedor_id, clientes(nombre, telefono), venta_lineas(cantidad, precio_unitario, descuento_pct, total, productos(codigo, nombre)), cobro_aplicaciones(monto_aplicado, cobros(fecha, metodo_pago, referencia))")
        .eq("empresa_id", empresaId)
        .ilike("folio", `%${folio}%`)
        .order("fecha", { ascending: false })
        .limit(1),
      admin.from("empresas")
        .select("nombre, razon_social, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, moneda")
        .eq("id", empresaId).maybeSingle(),
    ]);
    const v: any = (ventas || [])[0];
    if (!v) return { error: `No encontré la venta "${folio}".` };
    let vendNombre = "—";
    if (v.vendedor_id) {
      const { data: prof } = await admin.from("profiles").select("nombre").eq("id", v.vendedor_id).maybeSingle();
      vendNombre = prof?.nombre || "—";
    }
    const pdfBytes = await generarVentaBotPdf({
      empresa: (emp as any) || {},
      venta: {
        folio: v.folio,
        fecha: v.fecha,
        cliente: v.clientes?.nombre || "—",
        cliente_telefono: v.clientes?.telefono || null,
        vendedor: vendNombre,
        condicion_pago: v.condicion_pago,
        status: v.status,
        subtotal: Number(v.subtotal || 0),
        descuento_total: Number(v.descuento_total || 0),
        total: Number(v.total || 0),
        saldo_pendiente: Number(v.saldo_pendiente || 0),
      },
      lineas: (v.venta_lineas || []).map((l: any) => ({
        codigo: l.productos?.codigo || "",
        nombre: l.productos?.nombre || "—",
        cantidad: Number(l.cantidad || 0),
        precio_unitario: Number(l.precio_unitario || 0),
        descuento_pct: Number(l.descuento_pct || 0),
        total: Number(l.total || 0),
      })),
      cobros: (v.cobro_aplicaciones || []).map((a: any) => ({
        fecha: a.cobros?.fecha,
        metodo: a.cobros?.metodo_pago,
        referencia: a.cobros?.referencia,
        monto: Number(a.monto_aplicado || 0),
      })),
    });
    const path = `${empresaId}/venta-${(v.folio || "sin-folio").replace(/[^\w-]/g, "_")}-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage.from("wa-bot-reports").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return { error: String(upErr) };
    const { data: signed } = await admin.storage.from("wa-bot-reports").createSignedUrl(path, 60*60*24);
    const summary = `📄 Nota ${v.folio} — ${v.clientes?.nombre || "—"} · Total ${fmt(Number(v.total || 0))}.`;
    return { pdfUrl: signed?.signedUrl, fileName: `venta-${v.folio || "nota"}.pdf`, summary, resultado: summary };
  }

    if (!need("stock")) return { error: "Sin permiso para stock" };
    const msg = await buildStockMessage(empresaId, args?.umbral ?? null, null);
    return { resultado: msg };
  }

  if (name === "consultar_stock_disponible") {
    if (!need("stock")) return { error: "Sin permiso para stock" };
    const lim = Math.min(Number(args?.limite || 15), 30);
    let q = activeProduct(admin.from("productos")
      .select(PRODUCTO_SELECT_BASE)
      .eq("empresa_id", empresaId)
      .gt("cantidad", 0)
      .order("cantidad", { ascending: false })
      .limit(lim));
    const query = cleanLike(args?.query);
    if (query) q = q.or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`);
    const { data, error } = await q;
    if (error) return { error: error.message };
    const productos = (data || []).map((p: any) => ({
      codigo: p.codigo, nombre: p.nombre, cantidad: Number(p.cantidad || 0),
      min: Number(p.min || 0), precio: Number(p.precio_principal || 0), unidad: unitFor(p),
    }));
    if (!productos.length) return { productos: [], mensaje: `No hay productos con stock disponible${query ? ` para "${query}"` : ""}.` };
    return { productos, total: productos.length };
  }

  if (name === "buscar_producto") {
    if (!need("stock")) return { error: "Sin permiso para productos" };
    const query = cleanLike(args?.query);
    const { data } = await activeProduct(admin.from("productos")
      .select(PRODUCTO_SELECT_BASE)
      .eq("empresa_id", empresaId)
      .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
      .limit(10));
    const productos = (data || []).map((p: any) => ({
      codigo: p.codigo, nombre: p.nombre, cantidad: Number(p.cantidad || 0),
      min: Number(p.min || 0), precio: Number(p.precio_principal || 0), unidad: unitFor(p),
    }));
    if (!productos.length) return { productos: [], mensaje: `No encontré productos para "${args?.query}".` };
    return { productos };
  }

  if (name === "consultar_cliente") {
    if (!need("clientes")) return { error: "Sin permiso para clientes" };
    const msg = await buildClienteMessage(empresaId, args.query);
    return { resultado: msg };
  }

  if (name === "buscar_clientes") {
    if (!need("clientes")) return { error: "Sin permiso para clientes" };
    const lim = Math.min(Number(args?.limite || 10), 30);
    const query = cleanLike(args?.query);
    const { data, error } = await admin.rpc("wa_clientes_saldos", {
      p_empresa: empresaId,
      p_query: query || null,
      p_solo_con_saldo: args?.con_saldo === true,
      p_limit: lim,
    });
    if (error) return { error: error.message };
    const clientes = (data || []) as any[];
    if (!clientes.length) return { resultado: `👤 No encontré clientes${query ? ` para "${query}"` : ""}.` };
    let resultado = `👤 *Clientes${args?.con_saldo ? " con saldo" : ""}${query ? ` (${query})` : ""}:*\n\n`;
    for (const c of clientes) {
      resultado += `• ${c.codigo || ""} ${c.nombre}\n  Tel: ${c.telefono || "—"} · Saldo: *${fmt(Number(c.saldo || 0))}* · Estado: ${c.status || "—"}\n`;
    }
    return { resultado, clientes };
  }


  if (name === "resumen_cobros") {
    if (!need("cobros")) return { error: "Sin permiso para cobros" };
    const fechaIso = parseFechaTz(args?.fecha, tz);
    const msg = await buildCobrosMessage(empresaId, fechaIso, args?.fecha || "hoy", tz);
    return { resultado: msg };
  }

  if (name === "resumen_ventas") {
    if (!need("reportes")) return { error: "Sin permiso para ventas" };
    const fechaIso = parseFechaTz(args?.fecha, tz);
    const { start, end } = dayRange(fechaIso, tz);
    const { data } = await admin.from("ventas")
      .select("folio, total, status, clientes(nombre)")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end);
    const v = (data||[]).filter((x:any)=>x.status!=="cancelada"&&x.status!=="cancelado");
    const total = v.reduce((s:number,x:any)=>s+Number(x.total||0),0);
    const top: Record<string,number> = {};
    for (const x of v as any[]) { const c = x.clientes?.nombre || "—"; top[c]=(top[c]||0)+Number(x.total||0); }
    const topArr = Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return { fecha: fechaIso, folios: v.length, total_ventas: total, top_clientes: topArr.map(([n,m])=>({cliente:n,monto:m})) };
  }

  if (name === "cuentas_por_cobrar") {
    if (!need("clientes")) return { error: "Sin permiso" };
    const lim = Math.min(Number(args?.limite || 10), 30);
    const { data } = await admin.rpc("wa_clientes_saldos", {
      p_empresa: empresaId, p_query: null, p_solo_con_saldo: true, p_limit: lim,
    });
    return { clientes: (data || []).map((c: any) => ({ nombre: c.nombre, telefono: c.telefono, saldo: c.saldo })) };
  }

  if (name === "consultar_saldos") {
    if (!need("clientes")) return { error: "Sin permiso para saldos" };
    const lim = Math.min(Number(args?.limite || 10), 30);
    const { data, error } = await admin.rpc("wa_clientes_saldos", {
      p_empresa: empresaId, p_query: null, p_solo_con_saldo: true, p_limit: lim,
    });
    if (error) return { error: error.message };
    const clientes = (data || []) as any[];
    const total = clientes.reduce((s: number, c: any) => s + Number(c.saldo || 0), 0);
    if (!clientes.length) return { resultado: "✅ No encontré saldos pendientes en clientes." };
    let resultado = `💰 *Saldos pendientes*\nTotal mostrado: *${fmt(total)}*\n\n`;
    for (const c of clientes) resultado += `• ${c.codigo || ""} ${c.nombre}: *${fmt(Number(c.saldo || 0))}*${c.telefono ? ` · ${c.telefono}` : ""}\n`;
    return { resultado, total_mostrado: total, clientes };
  }


  if (name === "consultar_venta") {
    if (!need("reportes") && !need("clientes")) return { error: "Sin permiso" };
    const folio = String(args?.folio || "").trim();
    if (!folio) return { error: "Folio requerido" };
    const { data: ventas } = await admin.from("ventas")
      .select("id, folio, fecha, total, subtotal, descuento_total, saldo_pendiente, status, condicion_pago, vendedor_id, clientes(nombre, telefono), venta_lineas(cantidad, precio_unitario, descuento_pct, subtotal, total, productos(codigo, nombre)), cobro_aplicaciones(monto_aplicado, cobros(fecha, metodo_pago, referencia))")
      .eq("empresa_id", empresaId)
      .ilike("folio", `%${folio}%`)
      .order("fecha", { ascending: false })
      .limit(3);
    if (!ventas || !ventas.length) return { error: `No encontré ventas con folio "${folio}"` };
    // Resolver vendedor (profiles)
    const vendIds = Array.from(new Set(ventas.map((v:any) => v.vendedor_id).filter(Boolean)));
    let vendMap = new Map<string,string>();
    if (vendIds.length) {
      const { data: profs } = await admin.from("profiles").select("id, nombre").in("id", vendIds);
      vendMap = new Map((profs||[]).map((p:any) => [p.id, p.nombre || "—"]));
    }
    return {
      ventas: ventas.map((v:any) => ({
        folio: v.folio,
        fecha: v.fecha,
        cliente: v.clientes?.nombre || "—",
        vendedor: vendMap.get(v.vendedor_id) || "—",
        condicion_pago: v.condicion_pago,
        subtotal: Number(v.subtotal||0),
        descuento_total: Number(v.descuento_total||0),
        total: Number(v.total||0),
        saldo_pendiente: Number(v.saldo_pendiente||0),
        status: v.status,
        lineas: (v.venta_lineas||[]).map((l:any) => ({
          producto: `${l.productos?.codigo||""} ${l.productos?.nombre||"—"}`.trim(),
          cantidad: Number(l.cantidad||0),
          precio_unitario: Number(l.precio_unitario||0),
          descuento_pct: Number(l.descuento_pct||0),
          total: Number(l.total||0),
        })),
        cobros: (v.cobro_aplicaciones||[]).map((a:any) => ({
          monto: Number(a.monto_aplicado||0),
          fecha: a.cobros?.fecha,
          metodo: a.cobros?.metodo_pago,
          referencia: a.cobros?.referencia,
        })),
      })),
    };
  }

  if (name === "consultar_ventas_recientes") {
    if (!need("reportes") && !need("clientes")) return { error: "Sin permiso" };
    const lim = Math.min(Number(args?.limite || 3), 10);
    let q = admin.from("ventas")
      .select("id, folio, tipo, fecha, created_at, total, subtotal, descuento_total, saldo_pendiente, status, condicion_pago, vendedor_id, clientes(nombre, telefono), venta_lineas(cantidad, precio_unitario, descuento_pct, subtotal, total, productos(codigo, nombre)), cobro_aplicaciones(monto_aplicado, cobros(fecha, metodo_pago, referencia))")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(lim);
    if (args?.tipo && ["pedido", "venta_directa"].includes(String(args.tipo))) q = q.eq("tipo", args.tipo);
    if (args?.status && ["borrador", "confirmado", "entregado", "facturado", "cancelado"].includes(String(args.status))) q = q.eq("status", args.status);
    if (args?.fecha) {
      const fechaIso = parseFechaTz(args.fecha, tz);
      const { start, end } = dayRange(fechaIso, tz);
      q = q.gte("fecha", start).lte("fecha", end);
    }
    const { data: ventas, error } = await q;
    if (error) return { error: error.message };
    const ventasActivas = (ventas || []).filter((v:any) => v.status !== "cancelada" && v.status !== "cancelado");
    if (!ventasActivas.length) return { resultado: "📭 No encontré ventas con esos filtros." };
    const vendIds = Array.from(new Set(ventasActivas.map((v:any) => v.vendedor_id).filter(Boolean)));
    let vendMap = new Map<string,string>();
    if (vendIds.length) {
      const { data: profs } = await admin.from("profiles").select("id, nombre").in("id", vendIds);
      vendMap = new Map((profs||[]).map((p:any) => [p.id, p.nombre || "—"]));
    }
    const detalle = ventasActivas.map((v:any) => ({
      folio: v.folio,
      tipo: v.tipo,
      fecha: v.fecha,
      cliente: v.clientes?.nombre || "—",
      vendedor: vendMap.get(v.vendedor_id) || "—",
      condicion_pago: v.condicion_pago,
      subtotal: Number(v.subtotal||0),
      descuento_total: Number(v.descuento_total||0),
      total: Number(v.total||0),
      saldo_pendiente: Number(v.saldo_pendiente||0),
      status: v.status,
      lineas: (v.venta_lineas||[]).map((l:any) => ({
        producto: `${l.productos?.codigo||""} ${l.productos?.nombre||"—"}`.trim(),
        cantidad: Number(l.cantidad||0),
        precio_unitario: Number(l.precio_unitario||0),
        descuento_pct: Number(l.descuento_pct||0),
        subtotal: Number(l.subtotal||0),
        total: Number(l.total||0),
      })),
      cobros: (v.cobro_aplicaciones||[]).map((a:any) => ({
        monto: Number(a.monto_aplicado||0),
        fecha: a.cobros?.fecha,
        metodo: a.cobros?.metodo_pago,
        referencia: a.cobros?.referencia,
      })),
    }));
    return { ventas: detalle, resultado: JSON.stringify(detalle).slice(0, 4000) };
  }

  return { error: "Herramienta desconocida" };
}

// Atajos mínimos: SOLO PDF directo y folio explícito. Todo lo demás lo decide el LLM.
function inferRequiredTool(text: string): { name: string; args: any } | null {
  const t = text.toLowerCase().trim();
  // Reporte PDF explícito
  if (/^(reporte|cierre|res(u|ú)men\s+del?\s+d(í|i)a)\b/.test(t) || /\bpdf\b/.test(t)) {
    const fecha = /ayer/.test(t) ? "ayer" : "hoy";
    return { name: "generar_reporte_pdf", args: { fecha } };
  }
  // Folio explícito (VTA-1234, PED-1, SAL-12)
  const folio = text.match(/\b(?:VTA|PED|SAL)-?\d+\b/i)?.[0];
  if (folio) return { name: "consultar_venta", args: { folio } };
  return null;
}

async function runAgent(opts: { empresaId: string; permisos: Record<string, boolean>; phone: string; userMessage: string }) {
  if (!LOVABLE_AI_KEY) {
    return { reply: "⚠️ El agente IA no está configurado (falta LOVABLE_API_KEY). Usa *ayuda* para ver comandos.", intent: "no_ai", pdfUrl: null as string | null, pdfName: null as string | null, toolsUsed: null as any };
  }

  // Empresa: nombre + zona horaria para el system prompt y las herramientas
  const { data: emp } = await admin.from("empresas").select("nombre, zona_horaria").eq("id", opts.empresaId).maybeSingle();
  const empresaNombre = emp?.nombre || "tu empresa";
  const tz = (emp?.zona_horaria as string | null) || DEFAULT_TZ;

  // Contexto breve: últimos 6 turnos de este teléfono
  const { data: prev } = await admin.from("wa_bot_logs")
    .select("inbound_text, response_summary")
    .eq("phone", opts.phone).eq("empresa_id", opts.empresaId)
    .order("created_at", { ascending: false }).limit(6);
  const history: any[] = [];
  for (const row of (prev || []).reverse()) {
    if (row.inbound_text) history.push({ role: "user", content: row.inbound_text });
    if (row.response_summary) history.push({ role: "assistant", content: row.response_summary });
  }

  const permisosTxt = Object.entries(opts.permisos).filter(([,v])=>v).map(([k])=>k).join(", ") || "ninguno";
  const hoyMx = (() => {
    try {
      return new Date().toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: tz });
    } catch {
      return new Date().toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: DEFAULT_TZ });
    }
  })();
  const hoyIso = todayInTz(tz);

  const system = `Eres *Jarvis*, el asistente IA del sistema RutApp para la empresa "${empresaNombre}". Hablas español de México por WhatsApp.

IDENTIDAD:
- Te llamas Jarvis. Eres el asistente operativo de RutApp (ventas, pedidos, inventario, cobranza, finanzas).
- Conoces el sistema. Cuando alguien pregunta cualquier dato del negocio (ventas, clientes, productos, stock, saldos, cobros, gastos, pedidos, vendedores), consultas el sistema con tus herramientas y respondes con datos reales.

REGLAS ABSOLUTAS:
- PROHIBIDO inventar nombres, folios, montos, cantidades o cualquier dato. Si una herramienta no devuelve resultados, dilo claro: "No encontré ese dato en el sistema".
- Para cualquier cifra, lista, cliente, producto, venta, cobro o saldo DEBES llamar a una herramienta primero. Nunca respondas un número de memoria.
- Para reportes/cierres del día llama SIEMPRE 'generar_reporte_pdf'. No resumas el día entero a mano.
- Usa el historial de conversación SOLO para entender referencias ("y de ayer", "y de ese cliente", "el mismo"). Los datos siempre vienen de las herramientas.
- Si el usuario pide algo fuera de sus permisos (${permisosTxt}), avísale con respeto que pida a su admin.

FORMATO WHATSAPP:
- Conciso, máximo ~12 líneas. Usa *negritas* y emojis con moderación (📦 💰 🧾 👤 📊).
- Montos en pesos: $1,234.56. Fechas DD/MM/YYYY.
- Para stock muestra la unidad real del producto (ej. "150 PZA", "12.5 kg") tal como viene del campo 'unidad' en el resultado.
- No uses markdown pesado (## o tablas); WhatsApp no las renderiza.

Hoy es ${hoyMx} (${hoyIso}) en la zona horaria *${tz}* de la empresa. Cuando uses "hoy" o "ayer" en parámetros de fecha de las herramientas, se interpretan en esa zona; nunca uses UTC.`;

  const messages: any[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: opts.userMessage },
  ];

  let pdfUrl: string | null = null;
  let pdfName: string | null = null;
  const toolsUsed: string[] = [];

  // Atajos deterministas mínimos (PDF / folio): igual ejecutan tool, pero después
  // la respuesta se compone con el mismo loop del LLM para que sea natural.
  const requiredTool = inferRequiredTool(opts.userMessage);
  if (requiredTool) {
    toolsUsed.push(requiredTool.name);
    const out: any = await execTool(requiredTool.name, requiredTool.args, { empresaId: opts.empresaId, permisos: opts.permisos, tz });
    if (out?.pdfUrl) { pdfUrl = out.pdfUrl; pdfName = out.fileName; }
    // Reporte PDF: caption directo, no necesita pasar por LLM
    if (requiredTool.name === "generar_reporte_pdf") {
      return { reply: out?.summary || "📄 Aquí tienes el reporte PDF.", intent: requiredTool.name, pdfUrl, pdfName, toolsUsed };
    }
    // Folio: inyectamos el resultado como tool call sintético para que el LLM lo redacte
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_seed", type: "function", function: { name: requiredTool.name, arguments: JSON.stringify(requiredTool.args) } }],
    });
    messages.push({ role: "tool", tool_call_id: "call_seed", content: JSON.stringify(out).slice(0, 8000) });
  }

  for (let step = 0; step < 6; step++) {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, messages, tools: TOOLS, tool_choice: "auto" }),
    });
    if (!res.ok) {
      const tx = await res.text();
      console.error("AI error", res.status, tx);
      if (res.status === 429) return { reply: "⚠️ Demasiadas consultas. Intenta en unos segundos.", intent: "rate_limit", pdfUrl, pdfName, toolsUsed };
      if (res.status === 402) return { reply: "⚠️ Se agotaron los créditos de IA. Avisa a soporte de RutApp.", intent: "no_credits", pdfUrl, pdfName, toolsUsed };
      return { reply: "⚠️ Error temporal del asistente. Intenta de nuevo en un momento.", intent: "ai_error", pdfUrl, pdfName, toolsUsed };
    }
    const json = await res.json();
    const msg = json.choices?.[0]?.message;
    if (!msg) return { reply: "⚠️ Respuesta vacía del asistente.", intent: "empty", pdfUrl, pdfName, toolsUsed };

    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
        toolsUsed.push(call.function.name);
        const out: any = await execTool(call.function.name, args, { empresaId: opts.empresaId, permisos: opts.permisos, tz });
        if (out?.pdfUrl) { pdfUrl = out.pdfUrl; pdfName = out.fileName; }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(out).slice(0, 8000),
        });
      }
      continue; // dejamos que el LLM lea las herramientas y redacte la respuesta final
    }

    const reply = (msg.content || "").trim();
    if (!reply) return { reply: "⚠️ No obtuve respuesta. Reformula tu pregunta.", intent: "empty_reply", pdfUrl, pdfName, toolsUsed };
    return { reply: reply.slice(0, 3500), intent: toolsUsed[toolsUsed.length-1] || "chat", pdfUrl, pdfName, toolsUsed };
  }

  return { reply: "⚠️ El asistente tardó demasiado. Intenta reformular más específico.", intent: "loop_limit", pdfUrl, pdfName, toolsUsed };
}
