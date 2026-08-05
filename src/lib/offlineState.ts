/**
 * Estados explícitos para datos que pueden venir de la copia local (offline).
 *
 * REGLA DE ORO (fail-closed): una lista vacía NUNCA puede significar al mismo
 * tiempo "no hay registros" y "no se pudo cargar". Todo consumidor debe poder
 * distinguir ambos casos y, ante la duda, NEGAR el acceso o bloquear la acción.
 *
 * Antipatrón prohibido en el proyecto:
 *   try { return await cargarDatos(); } catch { return []; }
 */

export type OfflineDataState<T> =
  | { status: 'ready'; data: T; syncedAt: string }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'stale'; data: T; syncedAt: string }
  | { status: 'invalid'; reason: string }
  | { status: 'error'; error: Error };

/** ¿Se puede usar el dato para tomar una decisión de negocio/seguridad? */
export function isUsable<T>(s: OfflineDataState<T>): s is
  | { status: 'ready'; data: T; syncedAt: string }
  | { status: 'stale'; data: T; syncedAt: string } {
  return s.status === 'ready' || s.status === 'stale';
}

/** Dato o `null`. Nunca devuelve un valor "vacío" inventado ante un error. */
export function dataOrNull<T>(s: OfflineDataState<T>): T | null {
  return isUsable(s) ? s.data : null;
}

/**
 * Decisión fail-closed: solo concede cuando el dato es utilizable y el
 * predicado lo permite. Cargando, faltante, inválido o con error → NIEGA.
 */
export function allowIfKnown<T>(s: OfflineDataState<T>, predicate: (data: T) => boolean): boolean {
  return isUsable(s) ? predicate(s.data) : false;
}

/** Política de vigencia por entidad (ms). Configurable a futuro por empresa. */
export const MAX_AGE_MS: Record<string, number> = {
  permisos: 24 * 60 * 60 * 1000,      // roles/permisos: 24 h
  configuracion: 24 * 60 * 60 * 1000, // configuraciones de empresa
  promociones: 12 * 60 * 60 * 1000,   // promociones y sus condiciones
  precios: 24 * 60 * 60 * 1000,       // tarifas y listas de precio
  clientes: 48 * 60 * 60 * 1000,      // clientes y asignaciones
  inventario: 12 * 60 * 60 * 1000,    // existencias (advertencia, no bloqueo)
  cartera: 24 * 60 * 60 * 1000,
};

export function ageStatus(syncedAtMs: number | null | undefined, entity: keyof typeof MAX_AGE_MS | string): 'fresh' | 'stale' | 'unknown' {
  if (!syncedAtMs) return 'unknown';
  const max = MAX_AGE_MS[entity] ?? 24 * 60 * 60 * 1000;
  return Date.now() - syncedAtMs <= max ? 'fresh' : 'stale';
}

/**
 * Envuelve un snapshot local en un OfflineDataState aplicando vigencia.
 * `null` → 'missing' (nunca un arreglo vacío silencioso).
 */
export function fromSnapshot<T>(
  data: T | null | undefined,
  syncedAtMs: number | null | undefined,
  entity: string,
): OfflineDataState<T> {
  if (data === null || data === undefined) return { status: 'missing' };
  const age = ageStatus(syncedAtMs, entity);
  const syncedAt = new Date(syncedAtMs ?? Date.now()).toISOString();
  return age === 'fresh'
    ? { status: 'ready', data, syncedAt }
    : { status: 'stale', data, syncedAt };
}
