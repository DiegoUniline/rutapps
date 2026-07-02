// Respaldo one-time: trae a la tabla `facturas` las facturas que existen en
// Stripe pero NO están en la base de datos, para que el cliente pueda ver su
// historial completo (pagadas o vencidas).
//
// SEGURIDAD / "sin afectar":
//   - mode:"dry_run" (default) → NO escribe nada. Solo lee Stripe, compara con
//     la BD y reporta qué falta y qué es basura. Corre esto primero.
//   - mode:"execute" → inserta las que faltan con su estado real:
//       * pagadas  → estado 'pagada'
//       * impagas  → estado 'vencida'  (VISIBLE en el historial pero NO dispara
//                    el bloqueo de daily-billing, que solo actúa sobre
//                    'pendiente'/'procesando'/'past_due'). El bloqueo se activa
//                    en una fase aparte, con revisión manual.
//   - Basura ignorada SIEMPRE: void, draft (borrador) y facturas de $0.
//   - Idempotente: nunca duplica (compara por stripe_invoice_id).
//
// Invocación (igual que el bridge, vía SQL net.http_post):
//   body := '{"mode":"dry_run"}'                     -> todas las empresas Stripe
//   body := '{"mode":"dry_run","empresa_ids":["..."]}' -> solo esas
//   body := '{"mode":"execute"}'                     -> inserta de verdad

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const log = (step: string, details?: unknown) =>
  console.log(`[BACKFILL-FACTURAS] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

// Estado con el que se guardan las impagas: visible en historial, NO bloquea.
const UNPAID_STATUS = "vencida";

function invoicePeriod(inv: Stripe.Invoice): { inicio: string; fin: string } {
  const lp = inv.lines?.data?.[0]?.period;
  const start = lp?.start ?? (inv as any).period_start ?? inv.created;
  const end = lp?.end ?? (inv as any).period_end ?? inv.created;
  return {
    inicio: new Date(start * 1000).toISOString().slice(0, 10),
    fin: new Date(end * 1000).toISOString().slice(0, 10),
  };
}

function invoiceUsers(inv: Stripe.Invoice): number {
  const metaU = inv.metadata?.num_usuarios ? parseInt(inv.metadata.num_usuarios, 10) : 0;
  if (metaU > 0) return metaU;
  let qty = 0;
  for (const l of inv.lines?.data ?? []) qty += (l as any).quantity ?? 0;
  return qty > 0 ? qty : 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // ─── AUTH: x-internal-secret (reutiliza el del bridge) o JWT de super admin ───
  const internalSecret = Deno.env.get("BILLING_BRIDGE_INTERNAL_SECRET");
  const provided = req.headers.get("x-internal-secret");
  let authorized = !!(internalSecret && provided && provided === internalSecret);
  if (!authorized) {
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
        const sub = (claims?.claims as any)?.sub;
        const email = ((claims?.claims as any)?.email || "").toLowerCase();
        if (email === "diego.leon@uniline.mx") authorized = true;
        else if (sub) {
          const { data: isSA } = await supabase.rpc("is_super_admin", { p_user_id: sub });
          if (isSA) authorized = true;
        }
      } catch (_) { /* noop */ }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY no configurado");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.json().catch(() => ({}));
    const mode: "dry_run" | "execute" = body?.mode === "execute" ? "execute" : "dry_run";
    const empresaFilter: string[] = Array.isArray(body?.empresa_ids) ? body.empresa_ids : [];

    // 1) Empresas con Stripe (customer o subscription id)
    let q = supabase
      .from("subscriptions")
      .select("empresa_id, stripe_customer_id, stripe_subscription_id, es_manual, status, empresas:empresa_id(nombre)")
      .or("stripe_customer_id.not.is.null,stripe_subscription_id.not.is.null");
    if (empresaFilter.length) q = q.in("empresa_id", empresaFilter);
    const { data: subs, error: subsErr } = await q;
    if (subsErr) throw subsErr;

    log("Empresas Stripe a revisar", { count: subs?.length || 0, mode });

    const totals = {
      empresas: 0, stripe_facturas: 0, ya_en_bd: 0,
      basura_void: 0, basura_draft: 0, basura_cero: 0,
      importar_pagadas: 0, importar_impagas: 0, insertadas: 0,
    };
    const report: any[] = [];

    for (const s of subs || []) {
      const empresaId = s.empresa_id;
      const nombre = (s.empresas as any)?.nombre || "(sin nombre)";
      let customerId = s.stripe_customer_id as string | null;

      // Fallback: sacar customer desde la subscription si no está guardado
      if (!customerId && s.stripe_subscription_id) {
        try {
          const ss = await stripe.subscriptions.retrieve(s.stripe_subscription_id);
          customerId = typeof ss.customer === "string" ? ss.customer : ss.customer?.id ?? null;
        } catch (_) { /* noop */ }
      }
      if (!customerId) continue;

      totals.empresas++;
      const r: any = {
        empresa: nombre, empresa_id: empresaId, es_manual: s.es_manual, status: s.status,
        stripe_customer: customerId,
        stripe_total: 0, ya_en_bd: 0, basura: 0,
        importar_pagadas: 0, importar_impagas: 0,
        detalle: [] as any[],
      };

      // Facturas ya presentes en la BD (por stripe_invoice_id)
      const { data: existentes } = await supabase
        .from("facturas")
        .select("stripe_invoice_id")
        .eq("empresa_id", empresaId)
        .not("stripe_invoice_id", "is", null);
      const yaEnBd = new Set((existentes || []).map((f: any) => f.stripe_invoice_id));

      // Facturas en Stripe de este customer
      let stripeInvoices: Stripe.Invoice[] = [];
      try {
        const list = await stripe.invoices.list({ customer: customerId, limit: 100 });
        stripeInvoices = list.data;
      } catch (e) {
        r.error = `No se pudo listar Stripe: ${(e as Error).message}`;
        report.push(r);
        continue;
      }
      r.stripe_total = stripeInvoices.length;
      totals.stripe_facturas += stripeInvoices.length;

      const paraInsertar: any[] = [];
      for (const inv of stripeInvoices) {
        const total = (inv.total ?? 0) / 100;
        // ── Clasificación / basura ──
        if (inv.status === "void") { r.basura++; totals.basura_void++; continue; }
        if (inv.status === "draft") { r.basura++; totals.basura_draft++; continue; }
        if (total === 0) { r.basura++; totals.basura_cero++; continue; }
        if (inv.id && yaEnBd.has(inv.id)) { r.ya_en_bd++; totals.ya_en_bd++; continue; }

        const pagada = inv.status === "paid";
        const periodo = invoicePeriod(inv);
        const nUsers = invoiceUsers(inv);
        const fila = {
          empresa_id: empresaId,
          suscripcion_id: null as string | null,
          periodo_inicio: periodo.inicio,
          periodo_fin: periodo.fin,
          num_usuarios: nUsers,
          precio_unitario: nUsers > 0 ? Math.round((total / nUsers) * 100) / 100 : total,
          subtotal: total,
          total,
          estado: pagada ? "pagada" : UNPAID_STATUS,
          es_prorrateo: false,
          fecha_emision: inv.created ? new Date(inv.created * 1000).toISOString() : new Date().toISOString(),
          fecha_pago: pagada
            ? new Date(((inv.status_transitions?.paid_at ?? inv.created) * 1000)).toISOString()
            : null,
          stripe_invoice_id: inv.id,
        };

        r.detalle.push({
          stripe_invoice_id: inv.id,
          numero_stripe: (inv as any).number || null,
          stripe_status: inv.status,
          total_mxn: total.toFixed(2),
          periodo: `${periodo.inicio} → ${periodo.fin}`,
          creada: fila.fecha_emision.slice(0, 10),
          se_guardaria_como: fila.estado,
        });

        if (pagada) { r.importar_pagadas++; totals.importar_pagadas++; }
        else { r.importar_impagas++; totals.importar_impagas++; }
        paraInsertar.push(fila);
      }

      // ── EXECUTE: insertar las que faltan ──
      if (mode === "execute" && paraInsertar.length) {
        const { error: insErr, count } = await supabase
          .from("facturas")
          .insert(paraInsertar, { count: "exact" });
        if (insErr) r.error_insert = insErr.message;
        else { r.insertadas = count ?? paraInsertar.length; totals.insertadas += r.insertadas; }
      }

      report.push(r);
    }

    return new Response(
      JSON.stringify({ mode, resumen: totals, empresas: report }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log("ERROR", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
