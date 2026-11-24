/**
 * D-064 · Telemetría INTERNA (Supabase, no Sentry): errores de la app → `app_errores` por la RPC
 * `registrar_error_app`. Solo IDs técnicos, sin datos personales: sin correos, teléfonos,
 * tokens, nombres ni montos; ruta sin consulta ni ids; detalle con lista blanca de llaves.
 *
 * A PRUEBA DE FALLOS: nunca lanza. Si el envío falla, `console.warn` y la app sigue igual.
 * Freno en el teléfono: el mismo error (origen + mensaje) una vez por minuto y máx. 10 por minuto
 * (el servidor además limita 20/min y 300/h por usuario).
 */

/** Errores de red esperados en una PWA offline: no son bugs (misma lista que Sentry). */
const IGNORAR: RegExp[] = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError/i,
  /AbortError/i,
  /The operation was aborted/i,
];

/** Llaves del contexto que sí viajan (valores primitivos, recortados). Lo demás se descarta. */
const LLAVES_DETALLE = new Set([
  'tabla', 'operacion', 'fn', 'boundary', 'componentStack', 'codigo', 'code', 'status',
  'intentos', 'reintentos', 'motivo', 'pantalla', 'accion',
]);

const MAX_MENSAJE = 500;
const MAX_VALOR = 300;
const MAX_STACK = 600;

/** Quita correos, tokens JWT y números largos (teléfonos, tarjetas) de un texto. */
export function sinDatosPersonales(texto: string, max = MAX_MENSAJE): string {
  return String(texto ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?/g, '[token]')
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[numero]')
    .trim()
    .slice(0, max);
}

/** Solo la ruta: sin ?consulta, sin #ancla y con los ids largos como `:id`. */
export function rutaSinDatos(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  const limpia = ruta.split('?')[0].split('#')[0].replace(/[0-9a-fA-F-]{16,}/g, ':id');
  return limpia ? limpia.slice(0, 200) : null;
}

/** android | ios | windows | mac | linux | otro (sin modelo ni versión). */
export function plataformaActual(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  const s = ua.toLowerCase();
  if (s.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(s)) return 'ios';
  if (s.includes('windows')) return 'windows';
  if (s.includes('mac os')) return 'mac';
  if (s.includes('linux')) return 'linux';
  return 'otro';
}

function mensajeDe(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Error';
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; error_description?: unknown };
    if (typeof e.message === 'string') return e.message;
    if (typeof e.error_description === 'string') return e.error_description;
  }
  return 'Error desconocido';
}

export function esErrorIgnorable(error: unknown): boolean {
  const m = mensajeDe(error);
  return IGNORAR.some((r) => r.test(m));
}

export interface EntornoTelemetria {
  version: string;
  ruta: string | null;
  dispositivoId: string | null;
  plataforma: string;
}

export interface PayloadErrorApp {
  p_origen: string;
  p_mensaje: string;
  p_detalle: Record<string, string | number | boolean> | null;
  p_version: string | null;
  p_ruta: string | null;
  p_dispositivo_id: string | null;
  p_plataforma: string | null;
}

/** Arma lo que se manda a `registrar_error_app`, o null si el error es ruido de red. */
export function construirPayloadError(
  error: unknown,
  contexto: Record<string, unknown> | undefined,
  entorno: EntornoTelemetria,
): PayloadErrorApp | null {
  if (esErrorIgnorable(error)) return null;
  const origen = typeof contexto?.origen === 'string' && contexto.origen.trim()
    ? contexto.origen.trim().slice(0, 80)
    : 'app';

  const detalle: Record<string, string | number | boolean> = {};
  const nombre = error instanceof Error ? error.name : undefined;
  if (nombre && nombre !== 'Error') detalle.nombre = nombre.slice(0, 60);
  const codigoError = (error as { code?: unknown } | null)?.code;
  if (typeof codigoError === 'string' || typeof codigoError === 'number') detalle.codigo = String(codigoError).slice(0, 20);

  for (const [llave, valor] of Object.entries(contexto ?? {})) {
    if (llave === 'origen') continue;
    if (Array.isArray(valor)) {
      // De una lista solo viaja cuántos (p. ej. abonos rechazados), nunca su contenido.
      detalle[`${llave}_n`.slice(0, 40)] = valor.length;
      continue;
    }
    if (!LLAVES_DETALLE.has(llave)) continue;
    if (typeof valor === 'number' || typeof valor === 'boolean') detalle[llave] = valor;
    else if (typeof valor === 'string') {
      detalle[llave] = sinDatosPersonales(valor, llave === 'componentStack' ? MAX_STACK : MAX_VALOR);
    }
  }

  return {
    p_origen: origen,
    p_mensaje: sinDatosPersonales(mensajeDe(error)) || 'Error sin mensaje',
    p_detalle: Object.keys(detalle).length > 0 ? detalle : null,
    p_version: entorno.version ? entorno.version.slice(0, 40) : null,
    p_ruta: rutaSinDatos(entorno.ruta),
    p_dispositivo_id: entorno.dispositivoId ? entorno.dispositivoId.slice(0, 64) : null,
    p_plataforma: entorno.plataforma || null,
  };
}

/** Freno local: mismo error 1 vez por ventana y máx. `maxPorVentana` envíos por ventana. */
export function crearFreno(opts: { ventanaMs?: number; maxPorVentana?: number; ahora?: () => number } = {}) {
  const ventanaMs = opts.ventanaMs ?? 60_000;
  const max = opts.maxPorVentana ?? 10;
  const ahora = opts.ahora ?? (() => Date.now());
  const vistos = new Map<string, number>();
  let envios: number[] = [];
  return (clave: string): boolean => {
    const t = ahora();
    envios = envios.filter((x) => t - x < ventanaMs);
    for (const [k, v] of vistos) if (t - v >= ventanaMs) vistos.delete(k);
    if (vistos.has(clave) || envios.length >= max) return false;
    vistos.set(clave, t);
    envios.push(t);
    return true;
  };
}

type LlamadaRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;

export interface DepsReportador {
  rpc: LlamadaRpc;
  haySesion: () => Promise<boolean>;
  entorno: () => EntornoTelemetria;
  permitir?: (clave: string) => boolean;
}

/** Reportador con dependencias inyectables (pruebas). Nunca lanza. */
export function crearReportadorErrores(deps: DepsReportador) {
  const permitir = deps.permitir ?? crearFreno();
  return async (error: unknown, contexto?: Record<string, unknown>): Promise<boolean> => {
    try {
      const payload = construirPayloadError(error, contexto, deps.entorno());
      if (!payload) return false;
      if (!permitir(`${payload.p_origen}|${payload.p_mensaje}`)) return false;
      if (!(await deps.haySesion())) return false; // sin sesión no hay a quién atribuirlo
      const { error: rpcError } = await deps.rpc('registrar_error_app', payload as unknown as Record<string, unknown>);
      if (rpcError) {
        console.warn('[telemetría] no se pudo registrar el error en el servidor', rpcError);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[telemetría] falló el reporte interno de error', e);
      return false;
    }
  };
}
