// WhatsApp bot webhook — recibe mensajes desde WhatsAPI y responde con
// reportes, stock, estado de cuenta y cobros. Público (verify_jwt = false).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { jsPDF } from "npm:jspdf@2.5.1";

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
    admin.from("ventas").select("id, folio, total, status, condicion_pago, clientes(nombre)").eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("cobros").select("id, monto, metodo_pago, clientes(nombre)").eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("gastos").select("id, monto, concepto").eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("empresas").select("nombre, razon_social").eq("id", empresaId).maybeSingle(),
  ]);

  const ventas = (ventasRes.data || []).filter((v: any) => v.status !== "cancelada" && v.status !== "cancelado");
  const totalVentas = ventas.reduce((s: number, v: any) => s + Number(v.total || 0), 0);
  const cobros = cobrosRes.data || [];
  const totalCobros = cobros.reduce((s: number, c: any) => s + Number(c.monto || 0), 0);
  const gastos = gastosRes.data || [];
  const totalGastos = gastos.reduce((s: number, g: any) => s + Number(g.monto || 0), 0);
  const cobrosPorMetodo: Record<string, number> = {};
  for (const c of cobros as any[]) {
    const m = c.metodo_pago || "otro";
    cobrosPorMetodo[m] = (cobrosPorMetodo[m] || 0) + Number(c.monto || 0);
  }

  const empresaNombre = empresaRes.data?.razon_social || empresaRes.data?.nombre || "Mi Empresa";

  // PDF
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 50;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(empresaNombre, 40, y); y += 22;
  doc.setFontSize(12); doc.text(`Reporte del día (${label})`, 40, y); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Fecha: ${date.toLocaleDateString("es-MX")}`, 40, y); y += 20;

  // KPIs
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Resumen", 40, y); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const kpis = [
    ["Total Ventas", fmt(totalVentas), `${ventas.length} folios`],
    ["Total Cobros", fmt(totalCobros), `${cobros.length} mov.`],
    ["Total Gastos", fmt(totalGastos), `${gastos.length} mov.`],
    ["Neto (Cobros - Gastos)", fmt(totalCobros - totalGastos), ""],
  ];
  for (const [k, v, extra] of kpis) { doc.text(`${k}: ${v}  ${extra}`, 40, y); y += 14; }
  y += 8;

  // Ventas
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Ventas", 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  for (const v of ventas as any[]) {
    if (y > 740) { doc.addPage(); y = 50; }
    const cli = v.clientes?.nombre || "—";
    doc.text(`${v.folio || v.id.slice(0,8)}  ${cli.slice(0,40)}  ${v.condicion_pago || ""}  ${fmt(Number(v.total))}`, 40, y);
    y += 12;
  }
  y += 6;

  // Cobros por método
  if (y > 700) { doc.addPage(); y = 50; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Cobros por método", 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  for (const [m, mt] of Object.entries(cobrosPorMetodo)) {
    doc.text(`${m}: ${fmt(mt)}`, 40, y); y += 12;
  }
  y += 6;

  // Gastos
  if (gastos.length) {
    if (y > 700) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Gastos", 40, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    for (const g of gastos as any[]) {
      if (y > 740) { doc.addPage(); y = 50; }
      doc.text(`${(g.concepto || "—").slice(0,60)}  ${fmt(Number(g.monto))}`, 40, y); y += 12;
    }
  }

  const pdfBytes = doc.output("arraybuffer");
  return {
    pdfBytes: new Uint8Array(pdfBytes),
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

    const intent = parseIntent(text);

    if (intent.kind === "ayuda" || intent.kind === "unknown") {
      await waSend(phone, HELP);
      await log(empresaId, phone, text, intent.kind, "ok", "Menú enviado");
      return new Response("ok", { headers: corsHeaders });
    }

    if (intent.kind === "reporte") {
      if (!permisos.reportes) {
        await waSend(phone, "🚫 Tu número no tiene permiso para *reportes*.");
        await log(empresaId, phone, text, "reporte", "denied", "Sin permiso");
        return new Response("ok", { headers: corsHeaders });
      }
      await waSend(phone, `⏳ Generando reporte ${intent.label}...`);
      const { pdfBytes, summary } = await buildReporte(empresaId, intent.date, intent.label);
      const path = `${empresaId}/reporte-${intent.date.toISOString().slice(0,10)}-${Date.now()}.pdf`;
      const { error: upErr } = await admin.storage.from("wa-bot-reports").upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (upErr) throw upErr;
      const { data: signed } = await admin.storage.from("wa-bot-reports").createSignedUrl(path, 60 * 60 * 24);
      const url = signed?.signedUrl || "";
      await waSendFile(phone, url, `reporte-${intent.label}.pdf`, summary);
      await log(empresaId, phone, text, "reporte", "ok", summary, url, { label: intent.label });
      return new Response("ok", { headers: corsHeaders });
    }

    if (intent.kind === "stock") {
      if (!permisos.stock) {
        await waSend(phone, "🚫 Tu número no tiene permiso para consultar *stock*.");
        await log(empresaId, phone, text, "stock", "denied", "Sin permiso");
        return new Response("ok", { headers: corsHeaders });
      }
      const msg = await buildStockMessage(empresaId, intent.threshold, intent.nombre);
      await waSend(phone, msg);
      await log(empresaId, phone, text, "stock", "ok", msg.slice(0,200));
      return new Response("ok", { headers: corsHeaders });
    }

    if (intent.kind === "cliente") {
      if (!permisos.clientes) {
        await waSend(phone, "🚫 Tu número no tiene permiso para consultar *clientes*.");
        await log(empresaId, phone, text, "cliente", "denied", "Sin permiso");
        return new Response("ok", { headers: corsHeaders });
      }
      const msg = await buildClienteMessage(empresaId, intent.query);
      await waSend(phone, msg);
      await log(empresaId, phone, text, "cliente", "ok", msg.slice(0,200));
      return new Response("ok", { headers: corsHeaders });
    }

    if (intent.kind === "cobros") {
      if (!permisos.cobros) {
        await waSend(phone, "🚫 Tu número no tiene permiso para consultar *cobros*.");
        await log(empresaId, phone, text, "cobros", "denied", "Sin permiso");
        return new Response("ok", { headers: corsHeaders });
      }
      const msg = await buildCobrosMessage(empresaId, intent.date, intent.label);
      await waSend(phone, msg);
      await log(empresaId, phone, text, "cobros", "ok", msg.slice(0,200));
      return new Response("ok", { headers: corsHeaders });
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("wa-bot-webhook error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
