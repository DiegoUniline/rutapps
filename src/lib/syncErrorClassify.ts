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
 */
export type SyncErrorAction = 'transient' | 'defer' | 'dead-letter' | 'retry';

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

  if (isTransient) return 'transient';
  if (isDeferrable) return newRetries >= maxRetries ? 'dead-letter' : 'defer';
  if (isNotFound || newRetries >= maxRetries) return 'dead-letter';
  return 'retry';
}
