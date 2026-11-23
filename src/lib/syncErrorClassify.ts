// Clasificación PURA de errores de la cola de sincronización offline.
//
// Sin dependencias de BD/red → 100% testeable (ver syncQueueClassify.test.ts).
// Es el cerebro de "qué hacer cuando falla subir un cambio": decide si se
// reintenta por red, se espera al padre, o se descarta a dead-letter. De esto
// depende que una venta/cobro hecho sin señal NUNCA se pierda.

export const SYNC_MAX_RETRIES = 5;

/**
 * Tablas hijas cuya violación de RLS (42501) significa "el padre aún no llegó":
 * se difieren (esperar al padre) en vez de descartarse.
 */
export const CHILD_TABLES_RLS_DEFER = [
  'devoluciones', 'devolucion_lineas', 'venta_lineas', 'entrega_lineas',
  'cobro_aplicaciones', 'compra_lineas', 'cotizacion_lineas', 'merma_lineas',
  'traspaso_lineas', 'carga_lineas', 'descarga_ruta_lineas', 'cfdi_lineas',
  'movimientos_inventario',
];

/**
 * - 'transient'   : falla de RED (sin código PG, o 5xx/timeout/408/429/sin
 *                   conexión). NO es culpa del dato → reintentar indefinidamente
 *                   con backoff, SIN gastar el presupuesto de dead-letter. Una
 *                   venta/cobro NUNCA se marca "muerto" por mala señal.
 * - 'defer'       : el padre aún no sincroniza (FK faltante / RLS en cascada /
 *                   fila destino aún no existe). Esperar al padre… con tope.
 * - 'dead-letter' : diferible que agotó reintentos (huérfano), tabla inexistente,
 *                   o error real que llegó al tope. Se marca fallido.
 * - 'retry'       : error de dato desconocido, aún con reintentos disponibles.
 * - 'auth'        : la sesión (JWT) venció o no es válida. NO es culpa del dato: se
 *                   refresca la sesión y se reintenta sin gastar intentos; si no se
 *                   puede, la cola se conserva intacta y se pide iniciar sesión.
 */
export type SyncErrorAction = 'transient' | 'defer' | 'dead-letter' | 'retry' | 'auth';

/** Códigos de PostgREST de JWT vencido / inválido / ausente. */
const AUTH_CODES = ['PGRST301', 'PGRST302', 'PGRST303'];

/** ¿El error es de sesión (token vencido o inválido) y no del dato? */
type ErrorParecido = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  error_description?: unknown;
  originalError?: { status?: unknown } | null;
};
export function esErrorDeSesion(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as ErrorParecido;
  if (typeof e.code === 'string' && AUTH_CODES.includes(e.code)) return true;
  const httpStatus = e.status ?? e.originalError?.status;
  if (httpStatus === 401) return true;
  const msg = String(e.message || e.error_description || '');
  return /jwt expired|invalid jwt|jwt.*(expired|invalid|malformed)|token.*expired/i.test(msg);
}

export function classifySyncError(params: {
  err: any;
  table: string;
  newRetries: number;
  maxRetries?: number;
}): SyncErrorAction {
  const { err, table, newRetries, maxRetries = SYNC_MAX_RETRIES } = params;
  const code = err?.code;

  const isFkMissing = code === '23503';
  const isNotFound = code === '42P01' || code === 'PGRST116';
  const isRowNotYet = code === 'ROW_NOT_YET';
  const isRlsViolation = code === '42501' && CHILD_TABLES_RLS_DEFER.includes(table);
  const isDevolucionEnumIssue = (code === '22P02' || code === '23514') &&
    (table === 'devoluciones' || table === 'devolucion_lineas');

  const errorMsg = err?.message || err?.error_description || String(err);
  const httpStatus = err?.status ?? err?.originalError?.status;
  const isTransient = !code && (
    httpStatus === undefined || httpStatus === 0 || httpStatus >= 500 ||
    httpStatus === 408 || httpStatus === 429 ||
    /failed to fetch|network\s?error|networkerror|timeout|load failed|fetch failed|ECONN|ENOTFOUND|dns/i.test(errorMsg)
  );
  const isDeferrable = isFkMissing || isRlsViolation || isDevolucionEnumIssue || isRowNotYet;

  // Sesión vencida tras horas sin red: se refresca y se reintenta; nunca dead-letter.
  if (esErrorDeSesion(err)) return 'auth';
  if (isTransient) return 'transient';
  // RPC aún no publicada (orden de despliegue front/BD): esperar sin gastar intentos.
  if (table.startsWith('rpc:') && code === 'PGRST202') return 'transient';
  // Una RPC rechazada por regla de negocio (permiso, versión, validación) no cambia al reintentar.
  if (table.startsWith('rpc:') && ['P0001', 'P0002', '22023', '40001', '42501'].includes(code)) return 'dead-letter';
  if (isDeferrable) return newRetries >= maxRetries ? 'dead-letter' : 'defer';
  if (isNotFound || newRetries >= maxRetries) return 'dead-letter';
  return 'retry';
}
