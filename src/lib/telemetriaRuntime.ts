/**
 * D-064 · Conexión de la telemetría interna con Supabase (errores y salud del dispositivo).
 * Solo en producción y fuera de iframes (mismo criterio que Sentry). Nunca lanza.
 */
import { supabase } from './supabase';
import { getDeviceId } from './dataUsage';
import { APP_VERSION } from './appVersion';
import { crearReportadorErrores, plataformaActual, type EntornoTelemetria } from './telemetriaInterna';
import { construirPayloadSalud, crearReporteSalud, type EstadoSaludDispositivo } from './saludDispositivo';

export function telemetriaHabilitada(): boolean {
  if (!import.meta.env.PROD) return false;
  try {
    return window.self === window.top;
  } catch {
    return false; // iframe de otro origen: no se reporta
  }
}

function dispositivoId(): string | null {
  try {
    return getDeviceId();
  } catch (e) {
    console.warn('[telemetría] sin id de dispositivo (almacenamiento bloqueado)', e);
    return null;
  }
}

function entorno(): EntornoTelemetria {
  return {
    version: APP_VERSION,
    ruta: typeof window !== 'undefined' ? window.location.pathname : null,
    dispositivoId: dispositivoId(),
    plataforma: plataformaActual(),
  };
}

async function haySesion(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

type RpcLibre = (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
const rpc: RpcLibre = (fn, args) => (supabase.rpc as unknown as RpcLibre)(fn, args);

const reportador = crearReportadorErrores({ rpc, haySesion, entorno });

/** Manda un error a `app_errores` (sin datos personales). No-op fuera de producción. */
export function reportarErrorInterno(error: unknown, contexto?: Record<string, unknown>): Promise<boolean> {
  if (!telemetriaHabilitada()) return Promise.resolve(false);
  return reportador(error, contexto);
}

const reporteSalud = crearReporteSalud({
  enviar: async (estado: EstadoSaludDispositivo) => {
    const id = dispositivoId();
    if (!id || !(await haySesion())) return;
    const payload = construirPayloadSalud(estado, { dispositivoId: id, version: APP_VERSION, plataforma: plataformaActual() });
    const { error } = await rpc('registrar_salud_dispositivo', payload as unknown as Record<string, unknown>);
    if (error) console.warn('[salud] el servidor no aceptó el reporte del dispositivo', error);
  },
});

/** Programa el reporte de salud (freno 1/min con envío final; `forzar` al abrir la app). */
export function programarSaludDispositivo(estado: EstadoSaludDispositivo, forzar = false): Promise<void> {
  if (!telemetriaHabilitada()) return Promise.resolve();
  return reporteSalud.programar(estado, forzar);
}
