// Reconciles Facturama CFDI state with our local database.
// 1) Polls cancellations stuck in `cancelacion_pendiente` and updates their final SAT status.
// 2) Pulls last 24h of CFDIs from Facturama and reports any UUIDs missing locally.
//
// Designed to be invoked by pg_cron every ~30 minutes via net.http_post.
// Authenticated callers (super admin) may also trigger it manually.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivilegedCaller } from "../_shared/privilegedCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACTURAMA_API = "https://api.facturama.mx";
const FACTURAMA_API_SANDBOX = "https://apisandbox.facturama.mx";

// Cada CFDI se consulta en el ambiente donde se timbró (D-013).
function fac(ambiente?: string | null) {
  const sandbox = ambiente === "sandbox";
  const u = Deno.env.get(sandbox ? "FACTURAMA_SANDBOX_USERNAME" : "FACTURAMA_USERNAME");
  const p = Deno.env.get(sandbox ? "FACTURAMA_SANDBOX_PASSWORD" : "FACTURAMA_PASSWORD");
  if (!u || !p) throw new Error(`Facturama credentials not configured (${sandbox ? "sandbox" : "produccion"})`);
  return { api: sandbox ? FACTURAMA_API_SANDBOX : FACTURAMA_API, auth: "Basic " + btoa(`${u}:${p}`) };
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const STATUS_MAP: Record<string, string> = {
  pending: "cancelacion_pendiente",
  rejected: "cancelacion_rechazada",
  canceled: "cancelado",
  accepted: "cancelado",
};

async function reconcileCancellations(db: any, table: "cfdis" | "cfdi_pagos") {
  const { data: pendientes } = await db
    .from(table)
    .select("id, facturama_id, status, facturama_ambiente")
    .eq("status", "cancelacion_pendiente")
    .not("facturama_id", "is", null)
    .limit(200);

  const updates: any[] = [];
  for (const row of pendientes ?? []) {
    try {
      const f = fac(row.facturama_ambiente);
      const res = await fetch(`${f.api}/api-lite/cfdis/${row.facturama_id}`, {
        headers: { Authorization: f.auth },
      });
      const text = await res.text();
      if (!res.ok) {
        updates.push({ id: row.id, ok: false, info: `HTTP ${res.status}` });
        continue;
      }
      const json = JSON.parse(text);
      // Some Facturama responses surface `Status` (cancellation), others `CancellationStatus`.
      const upstream = (json.CancellationStatus || json.Status || "").toString().toLowerCase();
      const mapped = STATUS_MAP[upstream];
      if (mapped && mapped !== row.status) {
        await db.from(table).update({
          status: mapped,
          cancel_status: upstream,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        // Cancelado: la cantidad facturada vuelve a quedar disponible en la venta (D-014, D-015).
        if (mapped === "cancelado" && table === "cfdis") {
          const { error: vlErr } = await db.rpc("recalcular_facturacion_cfdi", { p_cfdi_id: row.id });
          if (vlErr) console.error("recalcular venta del CFDI cancelado:", vlErr.message);
        }
        updates.push({ id: row.id, ok: true, from: row.status, to: mapped });
      } else {
        updates.push({ id: row.id, ok: true, unchanged: true, upstream });
      }
    } catch (e: any) {
      updates.push({ id: row.id, ok: false, info: e.message });
    }
  }
  return { checked: (pendientes ?? []).length, updates };
}

async function reconcileLast24h(db: any) {
  // Pull the most recent issued CFDIs from Facturama and detect any UUID missing locally.
  // Solo producción (cuenta compartida de todas las empresas).
  const f = fac("produccion");
  const res = await fetch(`${f.api}/api-lite/cfdis?page=1&size=100&type=issued`, {
    headers: { Authorization: f.auth },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, info: `HTTP ${res.status}`, body: text.slice(0, 200) };
  }
  const list = JSON.parse(text);
  const items: any[] = Array.isArray(list) ? list : (list?.Models || list?.Items || []);
  const ids = items.map((i) => i.Id).filter(Boolean);
  if (ids.length === 0) return { ok: true, fetched: 0, missing: [] };

  const { data: known } = await db
    .from("cfdis")
    .select("facturama_id")
    .in("facturama_id", ids);
  // Los complementos de pago (REP) también son CFDI emitidos.
  const { data: knownPagos } = await db.from("cfdi_pagos").select("facturama_id").in("facturama_id", ids);
  const knownSet = new Set([...(known ?? []), ...(knownPagos ?? [])].map((k: any) => k.facturama_id));
  const missing = items
    .filter((i) => !knownSet.has(i.Id))
    .map((i) => ({ id: i.Id, uuid: i.Complement?.TaxStamp?.Uuid, total: i.Total, date: i.Date }));

  return { ok: true, fetched: items.length, missing_count: missing.length, missing };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // S-14: el cron (pg_cron con la anon key) sigue corriendo la conciliación, pero el detalle
    // (Id, UUID, total de CFDI) solo se devuelve a cron secret / service_role / super admin.
    const privileged = await isPrivilegedCaller(req);
    const db = admin();
    const [cancel, audit] = await Promise.all([
      reconcileCancellations(db, "cfdis"),
      reconcileLast24h(db),
    ]);
    const cancelPagos = await reconcileCancellations(db, "cfdi_pagos");
    if (!privileged) {
      return new Response(JSON.stringify({
        ok: true,
        cancellations: { checked: cancel.checked, changed: cancel.updates.filter((u: any) => u.ok && u.to).length },
        cancellations_rep: { checked: cancelPagos.checked, changed: cancelPagos.updates.filter((u: any) => u.ok && u.to).length },
        audit: { ok: audit.ok, fetched: (audit as any).fetched ?? 0, missing_count: (audit as any).missing_count ?? 0 },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, cancellations: cancel, cancellations_rep: cancelPagos, audit }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("facturama-reconcile error:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
