/**
 * Ámbito de sincronización del dispositivo (quién soy y qué puedo ver).
 *
 * El motor de descarga (`offlineSync.ts`) no vive dentro de React, así que no
 * puede leer el contexto de autenticación. Aquí se guarda —en localStorage, para
 * que sobreviva a un reinicio sin conexión— lo mínimo que necesita:
 *
 *  - `licencia`  : para consultar las banderas por empresa.
 *  - `vendedorId`: perfil del vendedor activo (filtrado por vendedor).
 *  - `userId`    : usuario de auth (tablas que guardan `user_id`, ej. visitas).
 *  - `seeAll`    : si el usuario puede ver datos de TODA la empresa. Cuando es
 *                  `true` NO se filtra por vendedor (vería menos de lo que le
 *                  corresponde).
 *
 * Nada de esto cambia el comportamiento por sí solo: el filtrado se activa con
 * la bandera `ruta_sync_v2`.
 */
import { getFeatureFlagsCache, isFeatureEnabled } from '@/lib/featureFlags';

const KEY = 'uniline_sync_scope_v1';

export interface SyncScope {
  licencia?: string | null;
  vendedorId?: string | null;
  userId?: string | null;
  seeAll?: boolean;
}

let memo: SyncScope = {};

try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (raw) memo = JSON.parse(raw) as SyncScope;
} catch {
  memo = {};
}

export function setSyncScope(scope: SyncScope): void {
  memo = { ...memo, ...scope };
  try {
    localStorage.setItem(KEY, JSON.stringify(memo));
  } catch {
    /* cuota llena: se sigue usando el valor en memoria */
  }
}

export function getSyncScope(): SyncScope {
  return memo;
}

/**
 * ¿Esta licencia usa el motor de sincronización v2 (menos megas)?
 *
 * Fail-safe: si las banderas todavía no se han cargado, devuelve `false`, es
 * decir se conserva EXACTAMENTE el comportamiento actual. Nunca se recorta la
 * descarga "por si acaso".
 */
export function syncV2Habilitado(): boolean {
  const flags = getFeatureFlagsCache();
  if (!flags.some((f) => f.clave === 'ruta_sync_v2')) return false;
  const lic = String(memo.licencia ?? '').trim();
  if (!lic) return false;
  return isFeatureEnabled('ruta_sync_v2', lic);
}

/**
 * ¿Se debe acotar la descarga a los datos del vendedor activo?
 *
 * Aplica al CATÁLOGO (clientes): si el usuario tiene permiso de "ver todos",
 * necesita el catálogo completo, así que no se recorta.
 */
export function vendedorScopeActivo(): boolean {
  if (!syncV2Habilitado()) return false;
  if (memo.seeAll) return false;
  return !!memo.vendedorId;
}

/**
 * ¿Se acotan las tablas TRANSACCIONALES (ventas, visitas, gastos,
 * devoluciones) al vendedor activo?
 *
 * A diferencia del catálogo, aquí el permiso "ver todos" NO amplía la descarga
 * móvil: en `/Ruta` cada quien opera lo suyo, y bajar las ventas de todos es
 * puro gasto de megas. La consulta online del escritorio no se ve afectada.
 */
export function vendedorScopeTransaccional(): boolean {
  if (!syncV2Habilitado()) return false;
  return !!memo.vendedorId;
}

