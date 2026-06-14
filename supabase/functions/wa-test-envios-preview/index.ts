// Test único — dispara los 3 envíos automáticos REALES al número solicitado,
// como si estuviera suscrito a todo. Borrar después de la prueba.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const PHONE = "5213171035768";
const EMPRESA_ID = "6d849e12-6437-4b24-917d-a89cc9b2fa88";

async function invoke(fn: string, body: any) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { fn, status: r.status, body: text.slice(0, 500) };
}

Deno.serve(async () => {
  // 1) Asegurar que el número exista y tenga prefs ON (sin esperar a que llegue la hora)
  const { data: existing } = await admin
    .from("wa_bot_authorized_numbers")
    .select("id")
    .eq("phone_e164", PHONE)
    .eq("empresa_id", EMPRESA_ID)
    .maybeSingle();

  const prefs = {
    activo: true,
    pref_reporte_diario: true,
    pref_reporte_diario_formato: "ambos",
    pref_reporte_diario_frecuencia: "diario",
    pref_hora_reporte_diario: 9,
    pref_cobranza_diaria: true,
    pref_alertas_semanal: true,
    // limpiamos idempotencia para que el force pueda re-enviar
    last_sent_reporte_diario: null,
    last_sent_cobranza_diaria: null,
    last_sent_alertas_semanal: null,
  };

  if (existing?.id) {
    await admin.from("wa_bot_authorized_numbers").update(prefs).eq("id", existing.id);
  } else {
    await admin.from("wa_bot_authorized_numbers").insert({
      empresa_id: EMPRESA_ID,
      phone_e164: PHONE,
      etiqueta: "Test Diego",
      ...prefs,
    });
  }

  // 2) Disparar los 3 schedulers reales en modo force para ese teléfono
  const results: any[] = [];
  results.push(await invoke("wa-scheduler-reporte-diario", { force: true, phone: PHONE }));
  await new Promise((r) => setTimeout(r, 1500));
  results.push(await invoke("wa-scheduler-cobranza-diaria", { force: true, phone: PHONE }));
  await new Promise((r) => setTimeout(r, 1500));
  results.push(await invoke("wa-scheduler-alertas-semanal", { force: true, phone: PHONE }));

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
