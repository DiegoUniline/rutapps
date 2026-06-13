// WhatsApp bot webhook — recibe mensajes desde WhatsAPI y responde con
// reportes, stock, estado de cuenta y cobros. Público (verify_jwt = false).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { generarReporteBotPdf } from "./reportePdf.ts";

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
  `🤖 *RutApp Bot* — comandos disponibles:\n\n` +
  `📊 *reporte hoy* / *reporte ayer* / *reporte 12/06*\n` +
  `   Genera el PDF del día con ventas, cobros, gastos.\n\n` +
  `📦 *stock bajo* / *stock bajo 10*\n` +
  `   Lista productos con inventario debajo del mínimo (o umbral).\n` +
  `📦 *stock <producto>*\n` +
  `   Inventario de un producto.\n\n` +
  `👤 *cliente <nombre>*\n` +
  `   Saldo y últimas ventas del cliente.\n\n` +
  `💰 *cobros hoy* / *cobros ayer*\n` +
  `   Resumen de cobros recibidos.\n\n` +
  `Escribe *ayuda* para ver este menú.`;

// ----------------- Data helpers -----------------
function dayRange(d: Date) {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function buildReporte(empresaId: string, date: Date, label: string) {
  const { start, end } = dayRange(date);
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
    fechaISO: date.toISOString().slice(0, 10),
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
    const { data } = await admin.from("productos")
      .select("id, codigo, nombre, cantidad, stock_min")
      .eq("empresa_id", empresaId)
      .or(`nombre.ilike.%${nombre}%,codigo.ilike.%${nombre}%`)
      .limit(10);
    if (!data || !data.length) return `❌ No encontré productos que coincidan con "${nombre}".`;
    let msg = `📦 Resultados para "${nombre}":\n\n`;
    for (const p of data) {
      msg += `• ${p.codigo || ""} ${p.nombre}\n   Stock: ${p.cantidad ?? 0}  Mín: ${p.stock_min ?? 0}\n`;
    }
    return msg;
  }
  // stock bajo
  const t = threshold;
  let q = admin.from("productos")
    .select("id, codigo, nombre, cantidad, stock_min")
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .order("cantidad", { ascending: true })
    .limit(30);
  const { data } = await q;
  let items = (data || []).filter((p: any) => {
    const c = Number(p.cantidad || 0);
    if (t !== null) return c <= t;
    const min = Number(p.stock_min || 0);
    return min > 0 && c <= min;
  }).slice(0, 20);
  if (!items.length) return `✅ No hay productos con stock bajo${t !== null ? ` (umbral ${t})` : ""}.`;
  let msg = `📦 *Productos con stock bajo${t !== null ? ` (≤ ${t})` : ""}:*\n\n`;
  for (const p of items) {
    msg += `• ${p.codigo || ""} ${p.nombre} — ${p.cantidad ?? 0}${p.stock_min ? ` / min ${p.stock_min}` : ""}\n`;
  }
  return msg;
}

async function buildClienteMessage(empresaId: string, query: string) {
  const { data: clientes } = await admin.from("clientes")
    .select("id, nombre, telefono, saldo")
    .eq("empresa_id", empresaId)
    .or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
    .limit(5);
  if (!clientes || !clientes.length) return `❌ No encontré clientes con "${query}".`;
  if (clientes.length > 1) {
    let msg = `🔎 ${clientes.length} clientes coinciden con "${query}":\n\n`;
    for (const c of clientes) msg += `• ${c.nombre}  — Saldo: ${fmt(Number(c.saldo || 0))}\n`;
    msg += `\nEnvía *cliente <nombre exacto>* para ver detalle.`;
    return msg;
  }
  const c = clientes[0];
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

async function buildCobrosMessage(empresaId: string, date: Date, label: string) {
  const { start, end } = dayRange(date);
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

function parseFecha(input: string | undefined | null): Date {
  const now = new Date();
  if (!input) return now;
  const t = input.toLowerCase().trim();
  if (t === "hoy" || t === "today") return now;
  if (t === "ayer" || t === "yesterday") { const d = new Date(now); d.setDate(d.getDate()-1); return d; }
  // ISO yyyy-mm-dd
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3]);
  // dd/mm/yyyy o dd-mm
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (m) {
    const day = +m[1], mon = +m[2]-1;
    const yr = m[3] ? (m[3].length === 2 ? 2000+ +m[3] : +m[3]) : now.getFullYear();
    return new Date(yr, mon, day);
  }
  return now;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "generar_reporte_pdf",
      description: "Genera el reporte diario en PDF (ventas, cobros, gastos) para una fecha y lo devuelve como URL para enviar al cliente. Úsala cuando el usuario pida 'reporte', 'cierre del día', 'resumen del día' etc.",
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
      description: "Devuelve productos reales con stock disponible (> 0). Úsala cuando pregunten qué productos hay disponibles, existencias, inventario actual o stock disponible.",
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
      description: "Consulta ventas reales recientes o de una fecha, incluyendo cliente, vendedor, método de pago, líneas, descuento, total y saldo. Úsala para preguntas de seguimiento como 'quién lo vendió', 'qué método de pago fue', 'la venta de hoy' o 'última venta'.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Opcional: 'hoy', 'ayer', dd/mm/yyyy o yyyy-mm-dd." },
          limite: { type: "number", description: "Máximo de ventas, default 3." },
        },
      },
    },
  },
];

async function execTool(name: string, args: any, ctx: { empresaId: string; permisos: Record<string, boolean> }) {
  const { empresaId, permisos } = ctx;
  const need = (k: string) => permisos[k];

  if (name === "generar_reporte_pdf") {
    if (!need("reportes")) return { error: "Sin permiso para reportes" };
    const date = parseFecha(args?.fecha);
    const label = args?.fecha || "hoy";
    const { pdfBytes, summary } = await buildReporte(empresaId, date, label);
    const path = `${empresaId}/reporte-${date.toISOString().slice(0,10)}-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage.from("wa-bot-reports").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return { error: String(upErr) };
    const { data: signed } = await admin.storage.from("wa-bot-reports").createSignedUrl(path, 60*60*24);
    return { pdfUrl: signed?.signedUrl, fileName: `reporte-${label}.pdf`, summary, resultado: summary };
  }

  if (name === "consultar_stock_bajo") {
    if (!need("stock")) return { error: "Sin permiso para stock" };
    const msg = await buildStockMessage(empresaId, args?.umbral ?? null, null);
    return { resultado: msg };
  }

  if (name === "consultar_stock_disponible") {
    if (!need("stock")) return { error: "Sin permiso para stock" };
    const lim = Math.min(Number(args?.limite || 15), 30);
    let q = admin.from("productos")
      .select("codigo, nombre, cantidad, stock_min, precio")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .gt("cantidad", 0)
      .order("cantidad", { ascending: false })
      .limit(lim);
    const query = String(args?.query || "").trim();
    if (query) q = q.or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`);
    const { data, error } = await q;
    if (error) return { error: error.message };
    const productos = data || [];
    if (!productos.length) return { resultado: `📦 No encontré productos con stock disponible${query ? ` para "${query}"` : ""}.` };
    let resultado = `📦 *Productos con stock disponible${query ? ` (${query})` : ""}:*\n\n`;
    for (const p of productos as any[]) {
      resultado += `• ${p.codigo || ""} ${p.nombre} — Stock: *${Number(p.cantidad || 0)}*${p.precio != null ? ` · Precio: ${fmt(Number(p.precio || 0))}` : ""}\n`;
    }
    if (productos.length === lim) resultado += `\nMostré los primeros ${lim}. Puedes pedirme un producto por nombre o código.`;
    return { resultado, productos };
  }

  if (name === "buscar_producto") {
    if (!need("stock")) return { error: "Sin permiso para productos" };
    const { data } = await admin.from("productos")
      .select("codigo, nombre, cantidad, stock_min, precio")
      .eq("empresa_id", empresaId)
      .or(`nombre.ilike.%${args.query}%,codigo.ilike.%${args.query}%`)
      .limit(10);
    const productos = data || [];
    if (!productos.length) return { resultado: `❌ No encontré productos que coincidan con "${args.query}".` };
    let resultado = `📦 *Productos encontrados:*\n\n`;
    for (const p of productos as any[]) resultado += `• ${p.codigo || ""} ${p.nombre}\n   Stock: *${Number(p.cantidad || 0)}* · Precio: ${fmt(Number(p.precio || 0))}\n`;
    return { resultado, productos };
  }

  if (name === "consultar_cliente") {
    if (!need("clientes")) return { error: "Sin permiso para clientes" };
    const msg = await buildClienteMessage(empresaId, args.query);
    return { resultado: msg };
  }

  if (name === "resumen_cobros") {
    if (!need("cobros")) return { error: "Sin permiso para cobros" };
    const date = parseFecha(args?.fecha);
    const msg = await buildCobrosMessage(empresaId, date, args?.fecha || "hoy");
    return { resultado: msg };
  }

  if (name === "resumen_ventas") {
    if (!need("reportes")) return { error: "Sin permiso para ventas" };
    const date = parseFecha(args?.fecha);
    const { start, end } = dayRange(date);
    const { data } = await admin.from("ventas")
      .select("folio, total, status, clientes(nombre)")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end);
    const v = (data||[]).filter((x:any)=>x.status!=="cancelada"&&x.status!=="cancelado");
    const total = v.reduce((s:number,x:any)=>s+Number(x.total||0),0);
    const top: Record<string,number> = {};
    for (const x of v as any[]) { const c = x.clientes?.nombre || "—"; top[c]=(top[c]||0)+Number(x.total||0); }
    const topArr = Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return { fecha: date.toISOString().slice(0,10), folios: v.length, total_ventas: total, top_clientes: topArr.map(([n,m])=>({cliente:n,monto:m})) };
  }

  if (name === "cuentas_por_cobrar") {
    if (!need("clientes")) return { error: "Sin permiso" };
    const lim = args?.limite || 10;
    const { data } = await admin.from("clientes")
      .select("nombre, telefono, saldo")
      .eq("empresa_id", empresaId).gt("saldo", 0)
      .order("saldo", { ascending: false }).limit(lim);
    return { clientes: data || [] };
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
      .select("id, folio, fecha, created_at, total, subtotal, descuento_total, saldo_pendiente, status, condicion_pago, vendedor_id, clientes(nombre, telefono), venta_lineas(cantidad, precio_unitario, descuento_pct, subtotal, total, productos(codigo, nombre)), cobro_aplicaciones(monto_aplicado, cobros(fecha, metodo_pago, referencia))")
      .eq("empresa_id", empresaId)
      .neq("status", "cancelada")
      .neq("status", "cancelado")
      .order("created_at", { ascending: false })
      .limit(lim);
    if (args?.fecha) {
      const date = parseFecha(args.fecha);
      const { start, end } = dayRange(date);
      q = q.gte("fecha", start).lte("fecha", end);
    }
    const { data: ventas, error } = await q;
    if (error) return { error: error.message };
    if (!ventas || !ventas.length) return { resultado: "📭 No encontré ventas con esos filtros." };
    const vendIds = Array.from(new Set(ventas.map((v:any) => v.vendedor_id).filter(Boolean)));
    let vendMap = new Map<string,string>();
    if (vendIds.length) {
      const { data: profs } = await admin.from("profiles").select("id, nombre").in("id", vendIds);
      vendMap = new Map((profs||[]).map((p:any) => [p.id, p.nombre || "—"]));
    }
    const detalle = ventas.map((v:any) => ({
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

async function runAgent(opts: { empresaId: string; permisos: Record<string, boolean>; phone: string; userMessage: string }) {
  if (!LOVABLE_AI_KEY) {
    return { reply: "⚠️ El agente IA no está configurado (falta LOVABLE_API_KEY). Usa *ayuda* para ver comandos.", intent: "no_ai", pdfUrl: null as string | null, pdfName: null as string | null, toolsUsed: null as any };
  }

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
  const system = `Eres *Jarvis*, el asistente de IA de RutApp por WhatsApp para una empresa. Respondes SIEMPRE en español, breve y claro, con emojis y formato WhatsApp (*negritas*).

REGLAS ESTRICTAS:
- Solo puedes usar datos de la empresa actual mediante las herramientas. NUNCA inventes datos.
- Si la pregunta no se puede responder con las herramientas, dilo y sugiere lo que sí puedes hacer.
- Si el usuario pide algo fuera de permisos (${permisosTxt}), explícale amablemente que no tiene permiso y que pida a su admin.
- Para reportes diarios usa SIEMPRE 'generar_reporte_pdf' (no resumas tú el día completo en texto).
- Sé conciso: máximo ~15 líneas en la respuesta final.
- Cuando una herramienta devuelva 'resultado' como string, úsalo prácticamente tal cual.

Hoy es ${new Date().toLocaleDateString("es-MX")}.`;

  const messages: any[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: opts.userMessage },
  ];

  let pdfUrl: string | null = null;
  let pdfName: string | null = null;
  const toolsUsed: string[] = [];

  for (let step = 0; step < 5; step++) {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, messages, tools: TOOLS, tool_choice: "auto" }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("AI error", res.status, t);
      if (res.status === 429) return { reply: "⚠️ Demasiadas solicitudes. Intenta en un momento.", intent: "rate_limit", pdfUrl: null, pdfName: null, toolsUsed };
      if (res.status === 402) return { reply: "⚠️ Sin créditos de IA. Avisa a soporte de RutApp.", intent: "no_credits", pdfUrl: null, pdfName: null, toolsUsed };
      return { reply: "⚠️ Error del asistente. Usa *ayuda* para ver comandos disponibles.", intent: "ai_error", pdfUrl: null, pdfName: null, toolsUsed };
    }
    const json = await res.json();
    const msg = json.choices?.[0]?.message;
    if (!msg) return { reply: "⚠️ Respuesta vacía del asistente.", intent: "empty", pdfUrl: null, pdfName: null, toolsUsed };

    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
        toolsUsed.push(call.function.name);
        const out = await execTool(call.function.name, args, { empresaId: opts.empresaId, permisos: opts.permisos });
        if (out && (out as any).pdfUrl) { pdfUrl = (out as any).pdfUrl; pdfName = (out as any).fileName; }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(out).slice(0, 8000),
        });
      }
      continue;
    }

    const reply = (msg.content || "").trim() || "✅";
    return { reply, intent: toolsUsed[0] || "chat", pdfUrl, pdfName, toolsUsed };
  }

  return { reply: "⚠️ El asistente tardó demasiado. Intenta reformular.", intent: "loop_limit", pdfUrl, pdfName, toolsUsed };
}
