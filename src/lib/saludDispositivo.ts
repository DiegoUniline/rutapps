/**
 * D-064 · Salud del dispositivo: estado de la cola offline de ESTE usuario en ESTA instalación
 * → `dispositivos_sync` por la RPC `registrar_salud_dispositivo` (la empresa y el usuario los
 * pone el servidor). Se reporta al abrir la app y después de cada pasada de sincronización,
 * con freno de 1 por minuto y envío «al final» (trailing): el último estado siempre llega,
 * aunque la pasada caiga dentro del minuto (si no, el panel mostraría pendientes ya subidos).
 *
 * A PRUEBA DE FALLOS: nunca lanza; si el envío falla, `console.warn`.
 */
import { sinDatosPersonales } from './telemetriaInterna';

export interface EstadoSaludDispositivo {
  pendientes: number;
  fallidas: number;
  /** Último error de la cola (se limpia de datos personales antes de enviarse). */
  ultimoError: string | null;
  /** Epoch ms de la última pasada sin fallas y sin pendientes (null si nunca). */
  ultimoSyncOk: number | null;
}

export interface PayloadSaludDispositivo {
  p_dispositivo_id: string;
  p_version: string | null;
  p_pendientes: number;
  p_fallidas: number;
  p_ultimo_sync_ok: string | null;
  p_ultimo_error: string | null;
  p_plataforma: string | null;
}

export function construirPayloadSalud(
  estado: EstadoSaludDispositivo,
  entorno: { dispositivoId: string; version: string | null; plataforma: string | null },
): PayloadSaludDispositivo {
  const entero = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return {
    p_dispositivo_id: entorno.dispositivoId.slice(0, 64),
    p_version: entorno.version ? entorno.version.slice(0, 40) : null,
    p_pendientes: entero(estado.pendientes),
    p_fallidas: entero(estado.fallidas),
    p_ultimo_sync_ok: estado.ultimoSyncOk ? new Date(estado.ultimoSyncOk).toISOString() : null,
    p_ultimo_error: estado.ultimoError ? sinDatosPersonales(estado.ultimoError, 300) || null : null,
    p_plataforma: entorno.plataforma,
  };
}

export interface DepsReporteSalud {
  enviar: (estado: EstadoSaludDispositivo) => Promise<void>;
  intervaloMs?: number;
  ahora?: () => number;
  programarTimer?: (fn: () => void, ms: number) => unknown;
}

/**
 * Freno con envío final: `programar(estado)` manda de inmediato si pasó el intervalo desde el
 * último envío; si no, guarda el estado más reciente y lo manda al cumplirse el intervalo.
 * `forzar` (al abrir la app) manda ya, sin esperar.
 */
export function crearReporteSalud(deps: DepsReporteSalud) {
  const intervalo = deps.intervaloMs ?? 60_000;
  const ahora = deps.ahora ?? (() => Date.now());
  const programarTimer = deps.programarTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  let ultimoEnvio = Number.NEGATIVE_INFINITY;
  let pendiente: EstadoSaludDispositivo | null = null;
  let timerActivo = false;

  const enviarAhora = async (estado: EstadoSaludDispositivo) => {
    ultimoEnvio = ahora();
    try {
      await deps.enviar(estado);
    } catch (e) {
      console.warn('[salud] no se pudo reportar la salud del dispositivo', e);
    }
  };

  return {
    programar(estado: EstadoSaludDispositivo, forzar = false): Promise<void> {
      const t = ahora();
      if (forzar || t - ultimoEnvio >= intervalo) {
        pendiente = null;
        return enviarAhora(estado);
      }
      pendiente = estado;
      if (!timerActivo) {
        timerActivo = true;
        programarTimer(() => {
          timerActivo = false;
          const estadoFinal = pendiente;
          pendiente = null;
          if (estadoFinal) void enviarAhora(estadoFinal);
        }, Math.max(intervalo - (t - ultimoEnvio), 0));
      }
      return Promise.resolve();
    },
  };
}
