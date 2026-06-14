// Scheduler: envía el Reporte Diario PDF a cada usuario suscrito,
// en su zona horaria local, una sola vez al día.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { generarReporteBotPdf } from "./reportePdf.ts";
import { generarReporteBotXlsx } from "./reporteXlsx.ts";
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

function rangeUtcForDates(startLocal: string, endLocal: string, tz: string) {
  const probe = new Date(`${startLocal}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(probe);
  const get = (t: string) => parseInt(local.find((p) => p.type === t)?.value || "0", 10);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = asUtc - probe.getTime();
  const [ys, ms, ds] = startLocal.split("-").map(Number);
  const [ye, me, de] = endLocal.split("-").map(Number);
  const startUtc = Date.UTC(ys, ms - 1, ds, 0, 0, 0) - offsetMs;
  const endUtc = Date.UTC(ye, me - 1, de, 23, 59, 59) - offsetMs;
  return { start: new Date(startUtc).toISOString(), end: new Date(endUtc).toISOString() };
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function buildReporte(empresaId: string, startLocal: string, endLocal: string, tz: string, label: string) {
  const { start, end } = rangeUtcForDates(startLocal, endLocal, tz);
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

  const reporteInput = {
    empresa: empresaRes.data || {},
    label,
    fechaISO: endLocal,
    fechaLabel: label,
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
  };

  const pdfBytes = await generarReporteBotPdf(reporteInput as any);
  const xlsxBytes = generarReporteBotXlsx(reporteInput as any);

  return {
    pdfBytes,
    xlsxBytes,
    summary: `📊 *${label}*\nVentas: ${fmt(totalVentas)} (${ventas.length})\nCobros: ${fmt(totalCobros)}\nGastos: ${fmt(totalGastos)}`,
  };
}



async function run(opts: { force?: boolean; phone?: string } = {}) {
  let q = admin
    .from("wa_bot_authorized_numbers")
    .select("id, empresa_id, phone_e164, pref_hora_reporte_diario, pref_reporte_diario_frecuencia, pref_reporte_diario_formato, last_sent_reporte_diario, auto_intro_sent_at, empresas:empresa_id(zona_horaria)")
    .eq("activo", true);
  if (!opts.force) q = q.eq("pref_reporte_diario", true);
  if (opts.phone) q = q.eq("phone_e164", opts.phone);
  const { data: subs } = await q;

  if (!subs?.length) return { processed: 0 };

  const reportCache = new Map<string, { pdfUrl: string; xlsxUrl: string; summary: string }>();
  let processed = 0, sent = 0, failed = 0;

  for (const sub of subs as any[]) {
    const tz = sub.empresas?.zona_horaria || "America/Mexico_City";
    const parts = localParts(tz);
    const frecuencia = sub.pref_reporte_diario_frecuencia || "diario";
    const formato = sub.pref_reporte_diario_formato || "pdf";
    const targetHour = sub.pref_hora_reporte_diario || 9;

    if (!opts.force) {
      if (frecuencia === "semanal" && parts.dow !== 6) continue;
      if (parts.hour !== targetHour) continue;
      if (parts.hour < 9 || parts.hour > 20) continue;
      if (sub.last_sent_reporte_diario === parts.date) continue;
    }

    const endLocal = parts.date;
    const startLocal = frecuencia === "semanal" ? addDays(endLocal, -6) : endLocal;
    const label = frecuencia === "semanal"
      ? `Reporte semanal (${startLocal} al ${endLocal})`
      : `Reporte del día (${endLocal})`;

    processed++;
    const cacheKey = `${sub.empresa_id}::${frecuencia}::${endLocal}`;
    let report = reportCache.get(cacheKey);
    if (!report) {
      try {
        const { pdfBytes, xlsxBytes, summary } = await buildReporte(sub.empresa_id, startLocal, endLocal, tz, label);
        const stamp = Date.now();
        const pdfPath = `${sub.empresa_id}/auto-reporte-${frecuencia}-${endLocal}-${stamp}.pdf`;
        const xlsxPath = `${sub.empresa_id}/auto-reporte-${frecuencia}-${endLocal}-${stamp}.xlsx`;
        const [upPdf, upXlsx] = await Promise.all([
          admin.storage.from("wa-bot-reports").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true }),
          admin.storage.from("wa-bot-reports").upload(xlsxPath, xlsxBytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true }),
        ]);
        if (upPdf.error || upXlsx.error) { failed++; continue; }
        const [{ data: sPdf }, { data: sXlsx }] = await Promise.all([
          admin.storage.from("wa-bot-reports").createSignedUrl(pdfPath, 60 * 60 * 24 * 2),
          admin.storage.from("wa-bot-reports").createSignedUrl(xlsxPath, 60 * 60 * 24 * 2),
        ]);
        if (!sPdf?.signedUrl || !sXlsx?.signedUrl) { failed++; continue; }
        report = { pdfUrl: sPdf.signedUrl, xlsxUrl: sXlsx.signedUrl, summary };
        reportCache.set(cacheKey, report);
      } catch (e) {
        console.error("buildReporte error", e);
        failed++; continue;
      }
    }

    if (!sub.auto_intro_sent_at) {
      await waSendText(sub.phone_e164, buildIntroMessage(frecuencia === "semanal" ? "el Reporte Semanal" : "el Reporte Diario"));
      await sleep(2000);
    }

    const caption = `${report.summary}\n\n_Recibes este reporte automáticamente. Cambia formato/horario en RutApp → Bot WhatsApp, o escribe "desactivar reporte"._`;
    const sendPdf = formato === "pdf" || formato === "ambos";
    const sendXlsx = formato === "excel" || formato === "ambos";

    let anyOk = false;
    if (sendPdf) {
      const ok = await waSendFile(sub.phone_e164, report.pdfUrl, `reporte-${frecuencia}-${endLocal}.pdf`, caption);
      if (ok) anyOk = true;
      await sleep(2000);
    }
    if (sendXlsx) {
      const captionXlsx = sendPdf ? `📎 Versión Excel del reporte` : caption;
      const ok = await waSendFile(sub.phone_e164, report.xlsxUrl, `reporte-${frecuencia}-${endLocal}.xlsx`, captionXlsx);
      if (ok) anyOk = true;
    }

    if (anyOk) {
      sent++;
      await admin.from("wa_bot_authorized_numbers").update({
        last_sent_reporte_diario: endLocal,
        ...(sub.auto_intro_sent_at ? {} : { auto_intro_sent_at: new Date().toISOString() }),
      }).eq("id", sub.id);
      await admin.from("wa_bot_logs").insert({
        empresa_id: sub.empresa_id, phone: sub.phone_e164, inbound_text: "(auto)",
        intent: `auto_reporte_${frecuencia}_${formato}`, outcome: "ok", response_summary: report.summary,
      });
    } else failed++;

    await sleep(4000);
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
