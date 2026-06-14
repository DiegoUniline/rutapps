// Test único — manda al número de prueba: 1) el Reporte Diario REAL (mismo del módulo Ventas)
// y 2) tres Reportes Generales en PDF (Ventas por Cliente, Ventas por Producto, Utilidad).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { fetchReportesGenerales } from "../_shared/reportes-generales-data.ts";
import { generarReporteGeneralPdf } from "../_shared/reportes-generales-pdf.ts";
import { localParts, waSendFile, sleep } from "../_shared/wa-scheduler-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const PHONE = "5213171035768";
const EMPRESA_ID = "6d849e12-6437-4b24-917d-a89cc9b2fa88";

async function invokeForce(fn: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ force: true, phone: PHONE }),
  });
  return { fn, status: r.status, body: (await r.text()).slice(0, 400) };
}

async function uploadAndSign(path: string, bytes: Uint8Array, contentType: string): Promise<string | null> {
  const up = await admin.storage.from("wa-bot-reports").upload(path, bytes, { contentType, upsert: true });
  if (up.error) { console.error("upload error", up.error); return null; }
  const sig = await admin.storage.from("wa-bot-reports").createSignedUrl(path, 60 * 60 * 24 * 2);
  return sig.data?.signedUrl || null;
}

Deno.serve(async () => {
  // Asegurar suscripción activa con todo encendido + reset de idempotencia
  const { data: existing } = await admin
    .from("wa_bot_authorized_numbers")
    .select("id").eq("phone_e164", PHONE).eq("empresa_id", EMPRESA_ID).maybeSingle();
  const prefs = {
    activo: true,
    pref_reporte_diario: true,
    pref_reporte_diario_formato: "pdf",
    pref_reporte_diario_frecuencia: "diario",
    pref_hora_reporte_diario: 9,
    pref_cobranza_diaria: true,
    pref_alertas_semanal: true,
    last_sent_reporte_diario: null,
    last_sent_cobranza_diaria: null,
    last_sent_alertas_semanal: null,
  };
  if (existing?.id) {
    await admin.from("wa_bot_authorized_numbers").update(prefs).eq("id", existing.id);
  } else {
    await admin.from("wa_bot_authorized_numbers").insert({ empresa_id: EMPRESA_ID, phone_e164: PHONE, etiqueta: "Test Diego", ...prefs });
  }

  const results: any[] = [];

  // 1) Reporte Diario REAL (idéntico al del módulo Ventas) vía scheduler force
  results.push(await invokeForce("wa-scheduler-reporte-diario"));
  await sleep(2000);

  // 2) Reportes Generales — últimos 30 días
  const { data: emp } = await admin.from("empresas").select("zona_horaria").eq("id", EMPRESA_ID).maybeSingle();
  const tz = emp?.zona_horaria || "America/Mexico_City";
  const today = localParts(tz).date;
  const d = new Date(today);
  d.setDate(d.getDate() - 30);
  const desde = d.toISOString().slice(0, 10);

  try {
    const data = await fetchReportesGenerales(EMPRESA_ID, desde, today);
    const reports: Array<{ key: "ventas-cliente" | "ventas-producto" | "utilidad"; label: string }> = [
      { key: "ventas-cliente", label: "Ventas por Cliente" },
      { key: "ventas-producto", label: "Ventas por Producto" },
      { key: "utilidad", label: "Utilidad" },
    ];
    for (const r of reports) {
      const bytes = generarReporteGeneralPdf(r.key, data);
      const path = `${EMPRESA_ID}/test-${r.key}-${today}-${Date.now()}.pdf`;
      const url = await uploadAndSign(path, bytes, "application/pdf");
      if (!url) { results.push({ fn: r.key, error: "upload failed" }); continue; }
      const caption = `📑 *Reporte General: ${r.label}*\nPeríodo: ${desde} al ${today}\n\n_Prueba — así llegarían los reportes generales seleccionados._`;
      const ok = await waSendFile(PHONE, url, `${r.key}-${today}.pdf`, caption);
      results.push({ fn: r.key, sent: ok });
      await sleep(2500);
    }
  } catch (e) {
    console.error("generales error", e);
    results.push({ fn: "generales", error: String(e) });
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), { headers: { "Content-Type": "application/json" } });
});
