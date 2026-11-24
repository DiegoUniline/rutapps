// D-064 · Alertas de salud por correo (cron cada hora, minuto 17).
// Revisa: crons fallidos y llamadas HTTP con error en la última hora, celulares con operaciones
// fallidas o con pendientes sin subir más de N horas, y picos de errores de la app. Manda UN
// correo resumen (Resend, plantilla `alertas-salud`) por destinatario SOLO si hay algo nuevo;
// lo ya avisado queda en `alertas_enviadas` (dedupe).
//
// Auth: x-cron-secret (cron), service_role o super admin (isPrivilegedCaller).
// POST {"simular": true} → devuelve los hallazgos sin enviar ni marcar nada.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isPrivilegedCaller } from "../_shared/privilegedCaller.ts";
import { sendAppEmail } from "../_shared/app-email.ts";
import {
  armarResumen,
  destinatariosValidos,
  evaluarHallazgos,
  horaClave,
  type DispositivoSalud,
  type ErrorHttp,
  type FallaCron,
  type GrupoErrores,
} from "../_shared/alertasSalud.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!(await isPrivilegedCaller(req))) return json({ error: "Unauthorized" }, 401);

  let simular = false;
  try {
    const body = await req.json();
    simular = body?.simular === true;
  } catch (_e) {
    simular = false; // cuerpo vacío o no JSON: corrida normal del cron
  }

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ahora = new Date();

    const { data: config, error: errConfig } = await sb.from("alertas_config")
      .select("destinatarios, activo, umbral_errores_hora, horas_pendientes").eq("id", 1).maybeSingle();
    if (errConfig) throw errConfig;
    const umbral = config?.umbral_errores_hora ?? 20;
    const horasPendientes = config?.horas_pendientes ?? 6;

    const desdeHora = new Date(ahora.getTime() - 60 * 60 * 1000).toISOString();
    const [crons, dispositivos, conteoErrores, grupos] = await Promise.all([
      sb.rpc("admin_salud_crons", { p_horas: 1 }),
      sb.rpc("admin_salud_dispositivos"),
      sb.from("app_errores").select("id", { count: "exact", head: true }).gt("created_at", desdeHora),
      sb.rpc("admin_salud_errores", { p_horas: 1 }),
    ]);
    if (crons.error) throw crons.error;
    if (dispositivos.error) throw dispositivos.error;
    if (conteoErrores.error) throw conteoErrores.error;
    if (grupos.error) throw grupos.error;

    const datosCron = (crons.data ?? {}) as { fallas?: FallaCron[]; http_errores?: ErrorHttp[] };
    const gruposOrdenados = ((grupos.data ?? []) as GrupoErrores[])
      .slice()
      .sort((a, b) => Number(b.conteo) - Number(a.conteo));

    const hallazgos = evaluarHallazgos({
      ahora,
      config: { umbral_errores_hora: umbral, horas_pendientes: horasPendientes },
      fallasCron: datosCron.fallas ?? [],
      erroresHttp: datosCron.http_errores ?? [],
      dispositivos: (dispositivos.data ?? []) as DispositivoSalud[],
      erroresUltimaHora: conteoErrores.count ?? 0,
      gruposErrores: gruposOrdenados,
    });

    const destinatarios = destinatariosValidos(config?.destinatarios);
    if (simular) {
      return json({ simulado: true, hora: horaClave(ahora), destinatarios: destinatarios.length, hallazgos });
    }
    if (hallazgos.length === 0) return json({ enviado: false, motivo: "sin hallazgos" });
    if (!config?.activo || destinatarios.length === 0) {
      return json({ enviado: false, motivo: "alertas apagadas o sin destinatarios", hallazgos: hallazgos.length });
    }

    // Reclamar las claves nuevas (una corrida a la vez no avisa dos veces lo mismo).
    const { data: reclamadas, error: errClaim } = await sb.from("alertas_enviadas")
      .upsert(hallazgos.map((h) => ({ clave: h.clave, tipo: h.tipo })), { onConflict: "clave", ignoreDuplicates: true })
      .select("clave");
    if (errClaim) throw errClaim;
    const nuevasClaves = new Set((reclamadas ?? []).map((r: { clave: string }) => r.clave));
    const nuevos = hallazgos.filter((h) => nuevasClaves.has(h.clave));
    if (nuevos.length === 0) return json({ enviado: false, motivo: "nada nuevo", hallazgos: hallazgos.length });

    const { asunto, secciones } = armarResumen(nuevos, ahora);
    const panelUrl = `${(Deno.env.get("SITE_URL") || "https://rutapp.mx").replace(/\/$/, "")}/super-admin`;
    let enviados = 0;
    const fallos: string[] = [];
    for (const to of destinatarios) {
      const r = await sendAppEmail("alertas-salud", to, {
        templateData: { asunto, secciones, panelUrl },
        idempotencyKey: `alertas-salud:${horaClave(ahora)}:${to}:${nuevos.length}`,
      });
      if (r.sent) enviados++;
      else fallos.push(r.reason === "failed" ? r.error.slice(0, 200) : r.reason);
    }

    if (enviados === 0) {
      // Nadie lo recibió: se sueltan las claves para avisar en la siguiente corrida.
      const { error: errSoltar } = await sb.from("alertas_enviadas").delete().in("clave", [...nuevasClaves]);
      if (errSoltar) console.error("[alertas-salud] no se pudieron soltar las claves", errSoltar);
      console.error("[alertas-salud] ningún correo enviado", fallos);
      return json({ enviado: false, motivo: "no se pudo enviar", fallos }, 502);
    }
    return json({ enviado: true, destinatarios: enviados, nuevos: nuevos.length, fallos });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
    console.error("[alertas-salud]", message);
    return json({ error: message }, 500);
  }
});
