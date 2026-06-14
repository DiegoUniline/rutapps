// Scheduler: envía el Reporte Diario PDF a cada usuario suscrito,
// en su zona horaria local, una sola vez al día.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { generarReporteBotPdf } from "./reportePdf.ts";
import { localParts, sleep, waSendFile, waSendText, buildIntroMessage } from "../_shared/wa-scheduler-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function dayRangeUtc(dateLocal: string, tz: string): { start: string; end: string } {
  // Compute the offset for that date in tz
  const probe = new Date(`${dateLocal}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(probe);
  const get = (t: string) => parseInt(local.find((p) => p.type === t)?.value || "0", 10);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = asUtc - probe.getTime();
  const [y, m, d] = dateLocal.split("-").map(Number);
  const startUtc = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs;
  const endUtc = Date.UTC(y, m - 1, d, 23, 59, 59) - offsetMs;
  return { start: new Date(startUtc).toISOString(), end: new Date(endUtc).toISOString() };
}

async function buildReporte(empresaId: string, fechaIso: string, tz: string) {
  const { start, end } = dayRangeUtc(fechaIso, tz);
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
  const ventas = allVentas.filter((v) => v.status !== "cancelada" && v.status !== "cancelado");
  const canceladas = allVentas.filter((v) => v.status === "cancelada" || v.status === "cancelado");
  const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalContado = ventas.filter((v) => (v.condicion_pago || "").toLowerCase() === "contado").reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCredito = ventas.filter((v) => /cr[eé]dito/i.test(v.condicion_pago || "")).reduce((s, v) => s + Number(v.total || 0), 0);
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

  const pdfBytes = await generarReporteBotPdf({
    empresa: empresaRes.data || {},
    fechaLabel: `Reporte del día (hoy)`,
    fechaISO: fechaIso,
    totals: {
      totalVentas, totalContado, totalCredito, totalCancelado,
      totalCobros, totalGastos, cobrosPorMetodo,
      countVentas: ventas.length, countCobros: cobros.length, countGastos: gastos.length,
    },
    ventasActivas: ventas.map((v) => ({ folio: v.folio, cliente: v.clientes?.nombre || "—", condicion_pago: v.condicion_pago || "", total: Number(v.total || 0) })),
    ventasCanceladas: canceladas.map((v) => ({ folio: v.folio, cliente: v.clientes?.nombre || "—", total: Number(v.total || 0) })),
    productos,
    cobros: cobros.map((c) => ({ cliente: c.clientes?.nombre || "—", metodo_pago: c.metodo_pago || "", referencia: c.referencia, monto: Number(c.monto || 0) })),
    gastos: gastos.map((g) => ({ concepto: g.concepto, notas: g.notas, monto: Number(g.monto || 0) })),
  });

  return {
    pdfBytes,
    summary: `📊 *Reporte de hoy*\nVentas: ${fmt(totalVentas)} (${ventas.length})\nCobros: ${fmt(totalCobros)}\nGastos: ${fmt(totalGastos)}`,
  };
}

async function run() {
  // Trae preferencias activas
  const { data: subs } = await admin
    .from("wa_bot_authorized_numbers")
    .select("id, empresa_id, phone_e164, pref_hora_reporte_diario, last_sent_reporte_diario, auto_intro_sent_at, empresas:empresa_id(zona_horaria)")
    .eq("activo", true)
    .eq("pref_reporte_diario", true);

  if (!subs?.length) return { processed: 0 };

  // Cachea reportes por empresa+fecha
  const reportCache = new Map<string, { pdfUrl: string; summary: string }>();
  let processed = 0, sent = 0, failed = 0;

  for (const sub of subs as any[]) {
    const tz = sub.empresas?.zona_horaria || "America/Mexico_City";
    const parts = localParts(tz);
    const targetHour = sub.pref_hora_reporte_diario || 9;

    // Ventana: la hora objetivo (9-20), tolerancia 0-29 min (cron corre cada 30)
    if (parts.hour !== targetHour) continue;
    if (parts.hour < 9 || parts.hour > 20) continue;
    if (sub.last_sent_reporte_diario === parts.date) continue;

    processed++;
    const cacheKey = `${sub.empresa_id}::${parts.date}`;
    let report = reportCache.get(cacheKey);
    if (!report) {
      try {
        const { pdfBytes, summary } = await buildReporte(sub.empresa_id, parts.date, tz);
        const path = `${sub.empresa_id}/auto-reporte-${parts.date}-${Date.now()}.pdf`;
        const up = await admin.storage.from("wa-bot-reports").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
        if (up.error) { failed++; continue; }
        const { data: signed } = await admin.storage.from("wa-bot-reports").createSignedUrl(path, 60 * 60 * 24 * 2);
        if (!signed?.signedUrl) { failed++; continue; }
        report = { pdfUrl: signed.signedUrl, summary };
        reportCache.set(cacheKey, report);
      } catch (e) {
        console.error("buildReporte error", e);
        failed++; continue;
      }
    }

    // Intro la primera vez
    if (!sub.auto_intro_sent_at) {
      await waSendText(sub.phone_e164, buildIntroMessage("el Reporte Diario"));
      await sleep(2000);
    }

    const caption = `${report.summary}\n\n_Recibes este reporte automáticamente. Para cambiarlo escribe "desactivar reporte diario" o entra a RutApp → Bot WhatsApp._`;
    const ok = await waSendFile(sub.phone_e164, report.pdfUrl, `reporte-${parts.date}.pdf`, caption);
    if (ok) {
      sent++;
      await admin.from("wa_bot_authorized_numbers").update({
        last_sent_reporte_diario: parts.date,
        ...(sub.auto_intro_sent_at ? {} : { auto_intro_sent_at: new Date().toISOString() }),
      }).eq("id", sub.id);
      await admin.from("wa_bot_logs").insert({
        empresa_id: sub.empresa_id, phone: sub.phone_e164, inbound_text: "(auto)",
        intent: "auto_reporte_diario", outcome: "ok", response_summary: report.summary,
      });
    } else failed++;

    await sleep(4000); // anti-bloqueo
  }

  return { processed, sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const result = await run();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("scheduler error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
