// Scheduler: alertas inteligentes los lunes a las 9am local.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { localParts, sleep, waSendText, buildIntroMessage } from "../_shared/wa-scheduler-utils.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

async function buildAlertas(empresaId: string): Promise<string | null> {
  const sections: string[] = [];

  // 1. Clientes sin comprar >30 días (clientes con última venta >30d o sin ventas en 30d)
  const since30 = daysAgoIso(30);
  const { data: clientesAct } = await admin
    .from("clientes")
    .select("id, nombre")
    .eq("empresa_id", empresaId)
    .eq("activo", true);
  const ids = (clientesAct || []).map((c: any) => c.id);
  if (ids.length) {
    const { data: ventasRec } = await admin
      .from("ventas")
      .select("cliente_id")
      .eq("empresa_id", empresaId)
      .gte("fecha", since30)
      .in("cliente_id", ids);
    const compraronSet = new Set((ventasRec || []).map((v: any) => v.cliente_id));
    const inactivos = (clientesAct as any[]).filter((c) => !compraronSet.has(c.id)).slice(0, 10);
    if (inactivos.length) {
      sections.push(`😴 *${inactivos.length} cliente${inactivos.length > 1 ? "s" : ""} sin comprar en 30 días:*\n` +
        inactivos.slice(0, 5).map((c) => `• ${c.nombre}`).join("\n") +
        (inactivos.length > 5 ? `\n…y ${inactivos.length - 5} más` : ""));
    }
  }

  // 2. Productos bajo mínimo
  const { data: prods } = await admin
    .from("productos")
    .select("nombre, codigo, cantidad, min, es_granel, unidad_granel, unidad_venta:unidades!unidad_venta_id(abreviatura)")
    .eq("empresa_id", empresaId)
    .eq("status", "activo")
    .not("min", "is", null);
  const bajos = ((prods || []) as any[]).filter((p) => p.min > 0 && Number(p.cantidad || 0) <= Number(p.min)).slice(0, 10);
  if (bajos.length) {
    sections.push(`📦 *${bajos.length} producto${bajos.length > 1 ? "s" : ""} bajo mínimo:*\n` +
      bajos.slice(0, 5).map((p) => {
        const u = p.es_granel ? (p.unidad_granel || "kg") : (p.unidad_venta?.abreviatura || "pzs");
        return `• ${p.nombre} · ${p.cantidad ?? 0}/${p.min} ${u}`;
      }).join("\n") +
      (bajos.length > 5 ? `\n…y ${bajos.length - 5} más` : ""));
  }

  // 3. Ventas inusuales (últimos 7 días vs promedio 30 días anterior)
  const since7 = daysAgoIso(7);
  const since37 = daysAgoIso(37);
  const { data: vUlt } = await admin
    .from("ventas").select("total, fecha").eq("empresa_id", empresaId)
    .neq("status", "cancelada").gte("fecha", since37);
  const ult = (vUlt || []) as any[];
  if (ult.length > 5) {
    const sevenCut = new Date(since7).getTime();
    const recent = ult.filter((v) => new Date(v.fecha).getTime() >= sevenCut);
    const older = ult.filter((v) => new Date(v.fecha).getTime() < sevenCut);
    if (older.length >= 3 && recent.length) {
      const avg = older.reduce((s, v) => s + Number(v.total || 0), 0) / older.length;
      const altas = recent.filter((v) => Number(v.total || 0) > avg * 2.5).slice(0, 5);
      if (altas.length) {
        sections.push(`📈 *${altas.length} venta${altas.length > 1 ? "s" : ""} inusualmente alta${altas.length > 1 ? "s" : ""}* (promedio ${fmt(avg)}):\n` +
          altas.map((v) => `• ${fmt(v.total)} · ${new Date(v.fecha).toLocaleDateString("es-MX")}`).join("\n"));
      }
    }
  }

  // 4. Clientes que exceden crédito
  try {
    const { data: cli } = await admin
      .from("clientes")
      .select("nombre, limite_credito")
      .eq("empresa_id", empresaId)
      .gt("limite_credito", 0);
    const { data: saldosRpc } = await admin.rpc("wa_clientes_saldos", { p_empresa_id: empresaId, p_limit: 200 });
    if (cli && saldosRpc) {
      const sMap = new Map((saldosRpc as any[]).map((s) => [s.nombre, Number(s.saldo || 0)]));
      const excedidos = (cli as any[])
        .map((c) => ({ nombre: c.nombre, limite: Number(c.limite_credito), saldo: sMap.get(c.nombre) || 0 }))
        .filter((c) => c.saldo > c.limite)
        .sort((a, b) => (b.saldo - b.limite) - (a.saldo - a.limite))
        .slice(0, 10);
      if (excedidos.length) {
        sections.push(`🚨 *${excedidos.length} cliente${excedidos.length > 1 ? "s" : ""} excede${excedidos.length > 1 ? "n" : ""} su crédito:*\n` +
          excedidos.slice(0, 5).map((c) => `• ${c.nombre} · ${fmt(c.saldo)} / límite ${fmt(c.limite)}`).join("\n") +
          (excedidos.length > 5 ? `\n…y ${excedidos.length - 5} más` : ""));
      }
    }
  } catch (e) { console.warn("credito alerts skipped", e); }

  if (!sections.length) return null;
  return `🔔 *Alertas inteligentes — Semana*\n\n${sections.join("\n\n")}`;
}

async function run(opts: { force?: boolean; phone?: string } = {}) {
  let q = admin
    .from("wa_bot_authorized_numbers")
    .select("id, empresa_id, phone_e164, last_sent_alertas_semanal, auto_intro_sent_at, empresas:empresa_id(zona_horaria)")
    .eq("activo", true);
  if (!opts.force) q = q.eq("pref_alertas_semanal", true);
  if (opts.phone) q = q.eq("phone_e164", opts.phone);
  const { data: subs } = await q;
  if (!subs?.length) return { processed: 0 };
  const cache = new Map<string, string | null>();
  let sent = 0, failed = 0, processed = 0;

  for (const sub of subs as any[]) {
    const tz = sub.empresas?.zona_horaria || "America/Mexico_City";
    const parts = localParts(tz);
    if (!opts.force) {
      if (parts.dow !== 1 || parts.hour !== 9) continue;
      if (sub.last_sent_alertas_semanal === parts.date) continue;
    }

    processed++;
    const key = `${sub.empresa_id}::${parts.date}`;
    let msg = cache.get(key);
    if (msg === undefined) {
      msg = await buildAlertas(sub.empresa_id);
      cache.set(key, msg);
    }
    if (!msg) {
      await admin.from("wa_bot_authorized_numbers").update({ last_sent_alertas_semanal: parts.date }).eq("id", sub.id);
      continue;
    }

    if (!sub.auto_intro_sent_at) {
      await waSendText(sub.phone_e164, buildIntroMessage("las Alertas Inteligentes semanales"));
      await sleep(2000);
    }

    const footer = `\n\n_Recibes esto cada lunes a las 9am. Escribe "desactivar alertas" o configura en RutApp → Bot WhatsApp._`;
    const ok = await waSendText(sub.phone_e164, msg + footer);
    if (ok) {
      sent++;
      await admin.from("wa_bot_authorized_numbers").update({
        last_sent_alertas_semanal: parts.date,
        ...(sub.auto_intro_sent_at ? {} : { auto_intro_sent_at: new Date().toISOString() }),
      }).eq("id", sub.id);
      await admin.from("wa_bot_logs").insert({
        empresa_id: sub.empresa_id, phone: sub.phone_e164, inbound_text: "(auto)",
        intent: "auto_alertas_semanal", outcome: "ok", response_summary: msg.slice(0, 200),
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
