// D-057: mueve la hora de cobro de las suscripciones de Stripe EXISTENTES a las
// 09:00 America/Mexico_City (15:00 UTC; CDMX sin horario de verano) del MISMO día
// que les toca, sin cobrar nada al moverlas.
//
// Modos (POST JSON):
//   { "modo": "simular" }  → solo lee Stripe y devuelve qué haría con cada una (no cambia nada).
//   { "modo": "aplicar", "confirmo": "CONFIRMO mover cobros 9am" } → aplica (trial_end = nueva hora,
//      proration_behavior none). Requiere que stripe-webhook ya conserve `active` en esos casos.
// Auth: header x-cron-secret igual al secreto CRON_SECRET de Edge Functions.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = "America/Mexico_City";
const CONFIRMACION = "CONFIRMO mover cobros 9am";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/** Día que le toca a las 09:00 CDMX (= 15:00 UTC). Si el cobro está a la medianoche UTC
 *  (18:00 CDMX del día anterior) se toma el día UTC (p. ej. el 1°), decisión del dueño;
 *  en los demás casos, el mismo día en CDMX. */
export function a9amMismoDia(d: Date): Date {
  const medianocheUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const ymd = medianocheUtc
    ? d.toISOString().slice(0, 10)
    : new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${ymd}T15:00:00.000Z`);
}
const cdmx = (d: Date) => d.toLocaleString("es-MX", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

Deno.serve(async (req) => {
  const secreto = Deno.env.get("CRON_SECRET");
  if (!secreto || req.headers.get("x-cron-secret") !== secreto) return json({ error: "No autorizado" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const modo = body?.modo === "aplicar" ? "aplicar" : "simular";
  if (modo === "aplicar" && body?.confirmo !== CONFIRMACION) {
    return json({ error: `Para aplicar envía confirmo: "${CONFIRMACION}"` }, 400);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

  const { data: subs, error } = await sb
    .from("subscriptions")
    .select("id, empresa_id, status, stripe_subscription_id, empresas:empresa_id(nombre)")
    .not("stripe_subscription_id", "is", null)
    .in("status", ["active", "past_due", "gracia", "trial"]);
  if (error) return json({ error: error.message }, 500);

  const ahora = Date.now();
  const filas: any[] = [];
  const resumen: Record<string, number> = {};
  for (const s of subs || []) {
    const fila: any = { empresa: (s as any).empresas?.nombre ?? s.empresa_id, rutapp_status: s.status };
    try {
      const st = await stripe.subscriptions.retrieve(s.stripe_subscription_id!);
      const cpeSec = (st.items.data[0] as any)?.current_period_end ?? (st as any).current_period_end;
      const finSec = st.status === "trialing" && st.trial_end ? st.trial_end : cpeSec;
      fila.stripe_status = st.status;
      fila.cancela_al_final = !!st.cancel_at_period_end;
      if (!finSec) { fila.accion = "omitir_sin_fecha"; }
      else {
        const actual = new Date(finSec * 1000);
        const nueva = a9amMismoDia(actual);
        fila.cobro_actual_cdmx = cdmx(actual);
        fila.cobro_nuevo_cdmx = cdmx(nueva);
        fila.diferencia_horas = Math.round((nueva.getTime() - actual.getTime()) / 36e5 * 10) / 10;
        if (!["active", "trialing"].includes(st.status)) fila.accion = "omitir_estado_" + st.status;
        else if (st.cancel_at_period_end) fila.accion = "omitir_cancela_al_final";
        else if (Math.abs(nueva.getTime() - actual.getTime()) < 60_000) fila.accion = "ya_esta_9am";
        else if (nueva.getTime() <= ahora + 10 * 60_000) fila.accion = "omitir_9am_ya_paso";
        else {
          fila.accion = modo === "aplicar" ? "movida" : "se_moveria";
          if (modo === "aplicar") {
            await stripe.subscriptions.update(st.id, {
              trial_end: Math.floor(nueva.getTime() / 1000),
              proration_behavior: "none",
              metadata: { ...st.metadata, reanchor_9am_cdmx: "true", reanchor_9am_sin_cobro_hasta: nueva.toISOString() },
            });
          }
        }
      }
    } catch (e) {
      fila.accion = "error";
      fila.error = (e as Error).message;
    }
    resumen[fila.accion] = (resumen[fila.accion] ?? 0) + 1;
    filas.push(fila);
  }
  filas.sort((a, b) => String(a.accion).localeCompare(String(b.accion)) || String(a.empresa).localeCompare(String(b.empresa)));
  return json({ modo, total: filas.length, resumen, filas });
});
