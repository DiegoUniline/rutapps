// Scheduler: aviso de cobranza a la 1pm local. Lista facturas que vencen mañana.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { localParts, sleep, waSendText, buildIntroMessage } from "../_shared/wa-scheduler-utils.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function buildMessage(empresaId: string, todayLocal: string): Promise<string | null> {
  const manana = addDays(todayLocal, 1);
  const { data: vencenMan } = await admin
    .from("ventas")
    .select("folio, total, saldo_pendiente, fecha_vencimiento, clientes(nombre)")
    .eq("empresa_id", empresaId)
    .eq("fecha_vencimiento", manana)
    .gt("saldo_pendiente", 0)
    .neq("status", "cancelada");

  const { data: vencidas } = await admin
    .from("ventas")
    .select("folio, total, saldo_pendiente, fecha_vencimiento, clientes(nombre)")
    .eq("empresa_id", empresaId)
    .lt("fecha_vencimiento", todayLocal)
    .gt("saldo_pendiente", 0)
    .neq("status", "cancelada")
    .order("fecha_vencimiento", { ascending: true })
    .limit(10);

  const lstMan = (vencenMan || []) as any[];
  const lstVen = (vencidas || []) as any[];
  if (!lstMan.length && !lstVen.length) return null;

  const totalMan = lstMan.reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0);
  const totalVen = lstVen.reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0);

  let msg = `💰 *Recordatorio de cobranza*\n\n`;
  if (lstMan.length) {
    msg += `📅 *Mañana vencen ${lstMan.length} factura${lstMan.length > 1 ? "s" : ""} por ${fmt(totalMan)}:*\n`;
    for (const v of lstMan.slice(0, 5)) {
      msg += `• ${v.folio || "—"} · ${v.clientes?.nombre || "—"} · ${fmt(v.saldo_pendiente)}\n`;
    }
    if (lstMan.length > 5) msg += `…y ${lstMan.length - 5} más\n`;
    msg += `\n`;
  }
  if (lstVen.length) {
    msg += `⚠️ *Vencidas: ${lstVen.length} por ${fmt(totalVen)}*\n`;
    for (const v of lstVen.slice(0, 5)) {
      msg += `• ${v.folio || "—"} · ${v.clientes?.nombre || "—"} · ${fmt(v.saldo_pendiente)}\n`;
    }
  }
  return msg;
}

async function run(opts: { force?: boolean; phone?: string } = {}) {
  let q = admin
    .from("wa_bot_authorized_numbers")
    .select("id, empresa_id, phone_e164, last_sent_cobranza_diaria, auto_intro_sent_at, empresas:empresa_id(zona_horaria)")
    .eq("activo", true);
  if (!opts.force) q = q.eq("pref_cobranza_diaria", true);
  if (opts.phone) q = q.eq("phone_e164", opts.phone);
  const { data: subs } = await q;

  if (!subs?.length) return { processed: 0 };
  const cache = new Map<string, string | null>();
  let sent = 0, failed = 0, processed = 0;

  for (const sub of subs as any[]) {
    const tz = sub.empresas?.zona_horaria || "America/Mexico_City";
    const parts = localParts(tz);
    if (!opts.force) {
      if (parts.hour !== 13) continue;
      if (sub.last_sent_cobranza_diaria === parts.date) continue;
    }

    processed++;
    const key = `${sub.empresa_id}::${parts.date}`;
    let msg = cache.get(key);
    if (msg === undefined) {
      msg = await buildMessage(sub.empresa_id, parts.date);
      cache.set(key, msg);
    }
    if (!msg) {
      // Nada que cobrar — marca el día para no recalcular y respetar idempotencia
      await admin.from("wa_bot_authorized_numbers").update({ last_sent_cobranza_diaria: parts.date }).eq("id", sub.id);
      continue;
    }

    if (!sub.auto_intro_sent_at) {
      await waSendText(sub.phone_e164, buildIntroMessage("los Recordatorios de Cobranza diarios"));
      await sleep(2000);
    }

    const footer = `\n\n_Recibes esto cada día a la 1pm. Escribe "desactivar cobranza" o configura en RutApp → Bot WhatsApp._`;
    const ok = await waSendText(sub.phone_e164, msg + footer);
    if (ok) {
      sent++;
      await admin.from("wa_bot_authorized_numbers").update({
        last_sent_cobranza_diaria: parts.date,
        ...(sub.auto_intro_sent_at ? {} : { auto_intro_sent_at: new Date().toISOString() }),
      }).eq("id", sub.id);
      await admin.from("wa_bot_logs").insert({
        empresa_id: sub.empresa_id, phone: sub.phone_e164, inbound_text: "(auto)",
        intent: "auto_cobranza_diaria", outcome: "ok", response_summary: msg.slice(0, 200),
      });
    } else failed++;
    await sleep(4000);
  }
  return { processed, sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const r = await run();
    return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
