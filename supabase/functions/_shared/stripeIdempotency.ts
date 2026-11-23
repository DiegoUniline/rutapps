// Fase 3 «Inventario y cobros»: claves de idempotencia para las llamadas a Stripe
// que crean o cambian cobros.
//
// Cómo funciona Stripe: guarda 24 h la respuesta de cada `idempotencyKey`. Si llega
// otra petición con la MISMA clave y los MISMOS parámetros, devuelve la respuesta
// original sin volver a ejecutar (no cobra dos veces). Con la misma clave y otros
// parámetros responde error (no ejecuta nada).
//
// Regla de RutApp: la clave describe la INTENCIÓN, no el momento.
//   rutapp:<intención>:<partes que fijan el estado de partida>:<fecha CDMX>:<huella de parámetros>
// - Un reintento del mismo día con el mismo estado de partida → misma clave → no duplica.
// - Un cambio distinto (otra cantidad, otro punto de partida, otro día) → otra clave → sí pasa.
// - La huella de los parámetros evita el error de Stripe «misma clave, otros parámetros».
// Catálogo de claves: docs/04-FLUJOS-DE-NEGOCIO.md § 10.1.
//
// Sin dependencias de Deno: lo importan las edge functions y las pruebas (vitest).

export type ParteClave = string | number | boolean | null | undefined;

export interface OpcionesClave {
  /** Parámetros exactos que se mandan a Stripe; su huella entra en la clave. */
  parametros?: unknown;
  /** Día (CDMX) que entra en la clave. `null` = sin fecha (la intención ya es única, p. ej. un id de sesión). */
  fecha?: Date | null;
  /** Ventana corta en minutos (CDMX) para intenciones sin estado de partida (sesiones de pago). */
  ventanaMinutos?: number;
}

const TZ_CDMX = "America/Mexico_City";
const MAX_CLAVE = 255; // límite de Stripe

function partesCdmx(d: Date): Record<string, string> {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_CDMX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of partes) out[p.type] = p.value;
  return out;
}

/** Fecha calendario en Ciudad de México (YYYY-MM-DD). D-057: los cobros se rigen por el día CDMX. */
export function fechaCdmx(d: Date = new Date()): string {
  const p = partesCdmx(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** JSON con llaves ordenadas: el mismo objeto da siempre el mismo texto. */
function jsonCanonico(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const llaves = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${llaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`).join(",")}}`;
}

/** Huella corta y estable (FNV-1a 32 bits, base 36) de un valor. */
export function huellaParametros(v: unknown): string {
  const texto = jsonCanonico(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function limpiar(parte: ParteClave): string {
  if (parte === null || parte === undefined || parte === "") return "-";
  return String(parte).replace(/[^A-Za-z0-9_.>-]/g, "_");
}

/**
 * Arma la clave de idempotencia de una llamada a Stripe.
 * Ejemplo: claveIdempotencia("qty", ["sub_123", "5>6", "in_9"], { parametros })
 *   → "rutapp:qty:sub_123:5>6:in_9:2026-11-23:1x8k2p"
 */
export function claveIdempotencia(intencion: string, partes: ParteClave[], opciones: OpcionesClave = {}): string {
  const segmentos = ["rutapp", limpiar(intencion), ...partes.map(limpiar)];
  if (opciones.fecha !== null) {
    const d = opciones.fecha ?? new Date();
    segmentos.push(fechaCdmx(d));
    if (opciones.ventanaMinutos && opciones.ventanaMinutos > 0) {
      const p = partesCdmx(d);
      const minutoDelDia = Number(p.hour) * 60 + Number(p.minute);
      segmentos.push(`v${opciones.ventanaMinutos}m${Math.floor(minutoDelDia / opciones.ventanaMinutos)}`);
    }
  }
  if (opciones.parametros !== undefined) segmentos.push(huellaParametros(opciones.parametros));
  const clave = segmentos.join(":");
  if (clave.length <= MAX_CLAVE) return clave;
  return `${clave.slice(0, MAX_CLAVE - 10)}:${huellaParametros(clave)}`.slice(0, MAX_CLAVE);
}

/** Id de un objeto de Stripe que puede venir expandido o como texto. */
export function idStripe(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const id = (v as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/**
 * true si Stripe devolvió, por la clave de idempotencia, un RECHAZO DE PAGO guardado
 * de un intento anterior (402 / StripeCardError con `idempotent-replayed: true`).
 * Ese intento no aplicó nada, así que el reintento del cliente (p. ej. tras cambiar
 * de tarjeta) debe mandarse con una clave nueva en lugar de quedar bloqueado 24 h.
 */
export function esRechazoRepetidoPorIdempotencia(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { type?: unknown; statusCode?: unknown; headers?: unknown };
  const esRechazoDePago = err.type === "StripeCardError" || err.statusCode === 402;
  if (!esRechazoDePago || !err.headers || typeof err.headers !== "object") return false;
  for (const [k, v] of Object.entries(err.headers as Record<string, unknown>)) {
    if (k.toLowerCase() === "idempotent-replayed") return String(v).toLowerCase() === "true";
  }
  return false;
}
