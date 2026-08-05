/**
 * Snapshot de SEGURIDAD offline (fail-closed).
 *
 * Problema que resuelve: `usePermisos` solo consultaba el servidor. Sin señal,
 * la consulta fallaba y —peor— cuando `supabase` devolvía error, el código
 * ignoraba `error`, veía cero roles y concluía "usuario sin rol = acceso total".
 * Eso amplía permisos por ausencia de información.
 *
 * Ahora: la última respuesta VÁLIDA del servidor se persiste por
 * (empresa, usuario) en IndexedDB y se reutiliza sin conexión. Si no hay
 * snapshot para ese contexto exacto, se niega el acceso.
 */
import { offlineDb } from './offlineDb';
import { fromSnapshot, type OfflineDataState } from './offlineState';

export interface Permiso {
  modulo: string;
  accion: string;
  permitido: boolean;
}

export interface SecuritySnapshot {
  /** `${empresaId}:${userId}` — aislamiento estricto por contexto. */
  id: string;
  empresa_id: string;
  user_id: string;
  hasRole: boolean;
  permisos: Permiso[];
  roleSoloMovil: boolean;
  roleId: string | null;
  savedAt: number;
}

function key(empresaId: string, userId: string) {
  return `${empresaId}:${userId}`;
}

export async function saveSecuritySnapshot(
  empresaId: string,
  userId: string,
  payload: Omit<SecuritySnapshot, 'id' | 'empresa_id' | 'user_id' | 'savedAt'>,
): Promise<void> {
  if (!empresaId || !userId) return;
  try {
    await offlineDb.securitySnapshots.put({
      id: key(empresaId, userId),
      empresa_id: empresaId,
      user_id: userId,
      savedAt: Date.now(),
      ...payload,
    });
  } catch { /* la persistencia nunca debe romper el login */ }
}

/**
 * Lee el snapshot del contexto EXACTO (empresa + usuario). Nunca cae en el
 * snapshot de otro usuario o de otra empresa.
 */
export async function readSecuritySnapshot(
  empresaId: string,
  userId: string,
): Promise<OfflineDataState<SecuritySnapshot>> {
  if (!empresaId || !userId) return { status: 'missing' };
  let row: SecuritySnapshot | undefined;
  try {
    row = await offlineDb.securitySnapshots.get(key(empresaId, userId));
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e : new Error('IndexedDB') };
  }
  if (!row) return { status: 'missing' };
  if (row.empresa_id !== empresaId || row.user_id !== userId) {
    return { status: 'invalid', reason: 'El snapshot local pertenece a otro usuario o empresa' };
  }
  if (!Array.isArray(row.permisos)) {
    return { status: 'invalid', reason: 'Snapshot de permisos incompleto' };
  }
  return fromSnapshot(row, row.savedAt, 'permisos');
}

/** Al cerrar sesión o cambiar de contexto: fuera todo lo que no sea el actual. */
export async function purgeForeignSecuritySnapshots(empresaId: string | null, userId: string | null): Promise<void> {
  try {
    const all = await offlineDb.securitySnapshots.toArray();
    const keep = empresaId && userId ? key(empresaId, userId) : null;
    const drop = all.filter((r: SecuritySnapshot) => r.id !== keep).map((r: SecuritySnapshot) => r.id);
    if (drop.length) await offlineDb.securitySnapshots.bulkDelete(drop);
  } catch { /* ignore */ }
}
