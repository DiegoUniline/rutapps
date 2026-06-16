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
  const [ventasRes, cobrosRes, gastosRes, devsRes, visitasRes, entregasRes, empresaRes] = await Promise.all([
    admin.from("ventas")
      .select("id, folio, total, status, condicion_pago, cliente_id, clientes(nombre), venta_lineas(producto_id, cantidad, total, productos(codigo, nombre))")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("cobros")
      .select("id, monto, metodo_pago, referencia, fecha, clientes(nombre), cobro_aplicaciones(monto_aplicado, ventas(id, folio, fecha, condicion_pago))")
      .eq("empresa_id", empresaId).neq("status", "cancelado").gte("fecha", start).lte("fecha", end),
    admin.from("gastos")
      .select("id, monto, concepto, notas")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("devoluciones")
      .select("id, tipo, clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre, codigo))")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("visitas")
      .select("id, tipo, motivo, notas, clientes(nombre)")
      .eq("empresa_id", empresaId).gte("fecha", start).lte("fecha", end),
    admin.from("entregas")
      .select("id, status")
      .eq("empresa_id", empresaId).gte("fecha", startLocal).lte("fecha", endLocal),
    admin.from("empresas")
      .select("nombre, razon_social, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, moneda")
      .eq("id", empresaId).maybeSingle(),
  ]);
  const entregas = (entregasRes.data || []) as any[];
  const entregasHechas = entregas.filter((e) => e.status === "hecho").length;
  const entregasNoEntregadas = entregas.filter((e) => e.status === "no_entregado").length;

  const allVentas = (ventasRes.data || []) as any[];
  const ventas = allVentas.filter((v) => v.status !== "cancelada" && v.status !== "cancelado");
  const canceladas = allVentas.filter((v) => v.status === "cancelada" || v.status === "cancelado");
  const ventasContado = ventas.filter((v) => (v.condicion_pago || "").toLowerCase() === "contado");
  const ventasCredito = ventas.filter((v) => /cr[eé]dito/i.test(v.condicion_pago || ""));
  const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalContado = ventasContado.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCredito = ventasCredito.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCancelado = canceladas.reduce((s, v) => s + Number(v.total || 0), 0);
  const cobros = (cobrosRes.data || []) as any[];
  const totalCobros = cobros.reduce((s, c) => s + Number(c.monto || 0), 0);
  const gastos = (gastosRes.data || []) as any[];
  const totalGastos = gastos.reduce((s, g) => s + Number(g.monto || 0), 0);
  const devoluciones = (devsRes.data || []) as any[];
  const visitas = (visitasRes.data || []) as any[];

  const cobrosPorMetodo: Record<string, number> = {};
  for (const c of cobros) {
    const m = c.metodo_pago || "otro";
    cobrosPorMetodo[m] = (cobrosPorMetodo[m] || 0) + Number(c.monto || 0);
  }

  // Productos vendidos (agregado)
  const prodMap = new Map<string, { codigo: string; nombre: string; cantidad: number; total: number }>();
  for (const v of ventas) {
    for (const l of (v.venta_lineas || []) as any[]) {
      const pid = l.producto_id || `${l.productos?.codigo || ""}::${l.productos?.nombre || ""}`;
      const prev = prodMap.get(pid) || { codigo: l.productos?.codigo || "", nombre: l.productos?.nombre || "—", cantidad: 0, total: 0 };
      prev.cantidad += Number(l.cantidad || 0);
      prev.total += Number(l.total || 0);
      prodMap.set(pid, prev);
    }
  }
  const productos = Array.from(prodMap.values()).sort((a, b) => b.total - a.total);

  // Devoluciones (líneas planas)
  const ACCION_LABELS: Record<string, string> = { reposicion: "Reposición", nota_credito: "Nota crédito", descuento_venta: "Desc. venta", devolucion_dinero: "Dev. dinero" };
  const devLineas: any[] = [];
  for (const d of devoluciones) {
    for (const l of (d.devolucion_lineas || []) as any[]) {
      devLineas.push({
        nombre: l.productos?.nombre || "—",
        codigo: l.productos?.codigo || "",
        cantidad: Number(l.cantidad || 0),
        motivo: l.motivo || "—",
        accion: l.accion || "reposicion",
        monto_credito: Number(l.monto_credito || 0),
        cliente: d.clientes?.nombre || "—",
      });
    }
  }
  const totalDevUnidades = devLineas.reduce((s, d) => s + d.cantidad, 0);
  const totalDevCredito = devLineas.reduce((s, d) => s + d.monto_credito, 0);
  void ACCION_LABELS; // labels se aplican en el PDF

  // Visitas
  const visitasSinCompra = visitas.filter((v) => v.tipo === "sin_compra");

  // Clientes visitados (unión cliente_id de ventas + clientes.nombre de visitas)
  const clientesVisitadosSet = new Set<string>([
    ...ventas.map((v) => v.cliente_id).filter(Boolean),
    ...visitas.map((v) => v.clientes?.nombre).filter(Boolean),
  ]);

  // Abonos a crédito previo: cobros cuyo cobro_aplicaciones.ventas.fecha < startLocal
  const abonosPrevios: any[] = [];
  for (const c of cobros) {
    for (const ap of ((c as any).cobro_aplicaciones || []) as any[]) {
      const v = ap.ventas;
      if (!v?.fecha) continue;
      const vDate = String(v.fecha).slice(0, 10);
      if (vDate >= startLocal) continue;
      const dias = Math.max(0, Math.floor((new Date(c.fecha).getTime() - new Date(v.fecha).getTime()) / 86400000));
      abonosPrevios.push({
        cliente: c.clientes?.nombre || "—",
        venta_folio: v.folio || "—",
        venta_fecha: vDate,
        metodo_pago: c.metodo_pago || "efectivo",
        referencia: c.referencia || null,
        monto_aplicado: Number(ap.monto_aplicado || 0),
        dias_atraso: dias,
      });
    }
  }
  abonosPrevios.sort((a, b) => b.dias_atraso - a.dias_atraso);
  const totalAbonosPrevios = abonosPrevios.reduce((s, a) => s + a.monto_aplicado, 0);
  const clientesQueAbonaron = new Set(abonosPrevios.map((a) => a.cliente)).size;

  const reporteInput = {
    empresa: empresaRes.data || {},
    usuarioNombre: `Todos los usuarios`,
    fechaLabel: label,
    label,
    fechaISO: endLocal,
    totals: {
      totalVentas, totalContado, totalCredito, totalCancelado,
      totalCobros, totalGastos,
      totalDevUnidades, totalDevCredito,
      clientesVisitados: clientesVisitadosSet.size,
      visitasSinCompra: visitasSinCompra.length,
      cobrosPorMetodo,
      countVentas: ventas.length,
      countContado: ventasContado.length,
      countCredito: ventasCredito.length,
      countCobros: cobros.length,
      countGastos: gastos.length,
      countDevoluciones: devoluciones.length,
    },
    ventasActivas: ventas.map((v) => ({ folio: v.folio, cliente: v.clientes?.nombre || "—", condicion_pago: v.condicion_pago || "", total: Number(v.total || 0) })),
    ventasCanceladas: canceladas.map((v) => ({ folio: v.folio, cliente: v.clientes?.nombre || "—", total: Number(v.total || 0) })),
    productos,
    cobros: cobros.map((c) => ({ cliente: c.clientes?.nombre || "—", metodo_pago: c.metodo_pago || "", referencia: c.referencia, monto: Number(c.monto || 0) })),
    gastos: gastos.map((g) => ({ concepto: g.concepto, notas: g.notas, monto: Number(g.monto || 0) })),
    devoluciones: devLineas,
    visitasSinCompra: visitasSinCompra.map((v) => ({ cliente: v.clientes?.nombre, motivo: v.motivo, notas: v.notas })),
    abonosCreditoPrevio: abonosPrevios.length > 0
      ? { items: abonosPrevios, totalMonto: totalAbonosPrevios, clientesUnicos: clientesQueAbonaron }
      : undefined,
  };

  const pdfBytes = await generarReporteBotPdf(reporteInput as any);
  const xlsxBytes = generarReporteBotXlsx(reporteInput as any);

  // Resumen ejecutivo en texto (acompaña al PDF) — limpio, con negritas
  const utilidadAprox = totalCobros - totalGastos;
  const topProducto = productos[0];
  const metodoTop = Object.entries(cobrosPorMetodo).sort((a, b) => (b[1] as number) - (a[1] as number))[0];

  const lines: string[] = [];
  lines.push(`📊 *${label}*`);
  lines.push(`_${(empresaRes.data as any)?.nombre || ""}_`);
  lines.push("");
  lines.push(`💰 *Ventas:* ${fmt(totalVentas)}  ·  ${ventas.length} tickets`);
  if (ventasContado.length || ventasCredito.length) {
    const parts: string[] = [];
    if (ventasContado.length) parts.push(`Contado ${fmt(totalContado)}`);
    if (ventasCredito.length) parts.push(`Crédito ${fmt(totalCredito)}`);
    lines.push(`    ${parts.join("  ·  ")}`);
  }
  lines.push(`💵 *Cobros:* ${fmt(totalCobros)}  ·  ${cobros.length} pagos`);
  if (metodoTop) lines.push(`    Top: ${metodoTop[0]} ${fmt(metodoTop[1] as number)}`);
  if (entregas.length) {
    lines.push(`🚚 *Entregas:* ${entregasHechas} de ${entregas.length}${entregasNoEntregadas ? `  ·  ${entregasNoEntregadas} no entregadas` : ""}`);
  }
  if (totalGastos > 0) lines.push(`📉 *Gastos:* ${fmt(totalGastos)}`);
  lines.push("");
  lines.push(`✅ *Flujo neto:* ${fmt(utilidadAprox)}`);
  if (clientesVisitadosSet.size) lines.push(`👥 Clientes atendidos: ${clientesVisitadosSet.size}`);
  if (topProducto) lines.push(`🏆 Top producto: ${topProducto.nombre} (${topProducto.cantidad} u)`);

  const summary = lines.join("\n");

  return { pdfBytes, xlsxBytes, summary };
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

    // 1) Enviar resumen de texto con los datos clave
    const footer = `\n\n_Recibes este reporte automáticamente. Cambia formato/horario en RutApp → Bot WhatsApp, o escribe "desactivar reporte"._`;
    await waSendText(sub.phone_e164, report.summary + footer);
    await sleep(1500);

    // 2) Enviar archivos con caption corto
    const sendPdf = formato === "pdf" || formato === "ambos";
    const sendXlsx = formato === "excel" || formato === "ambos";

    let anyOk = false;
    if (sendPdf) {
      const ok = await waSendFile(sub.phone_e164, report.pdfUrl, `reporte-${frecuencia}-${endLocal}.pdf`, `📄 ${label} — detalle completo`);
      if (ok) anyOk = true;
      await sleep(2000);
    }
    if (sendXlsx) {
      const ok = await waSendFile(sub.phone_e164, report.xlsxUrl, `reporte-${frecuencia}-${endLocal}.xlsx`, `📊 ${label} — versión Excel`);
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
    let opts: { force?: boolean; phone?: string } = {};
    if (req.method === "POST") { try { opts = await req.json(); } catch { /**/ } }
    const result = await run(opts);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("scheduler error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
