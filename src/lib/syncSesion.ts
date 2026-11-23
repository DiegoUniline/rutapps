// Sesión antes de subir la cola offline.
//
// Tras horas sin señal el token (JWT) del vendedor vence. Si la cola sube así, el servidor
// responde 401 y antes cada elemento gastaba intentos hasta quedar «fallido». Ahora:
//   1) antes de subir se refresca la sesión si está por vencer;
//   2) si el refresco falla por RED, no se sube nada (se reintenta luego, sin gastar intentos);
//   3) si la sesión ya no es válida (refresh token revocado/vencido), la cola queda INTACTA y
//      se pide al vendedor iniciar sesión. No se pierde nada.
//
// Recibe el cliente de auth como parámetro para poder probarlo sin red.

/** Margen: si al token le quedan menos de esto, se refresca antes de subir. */
export const MARGEN_REFRESCO_MS = 60_000;

export type EstadoSesion = 'ok' | 'sin_red' | 'vencida';

interface SesionMinima {
  expires_at?: number | null;
}

interface ErrorAuthMinimo {
  name?: string;
  status?: number;
  message?: string;
}

/** Lo mínimo de `supabase.auth` que se usa aquí. */
export interface AuthMinimo {
  getSession(): Promise<{ data: { session: SesionMinima | null }; error: ErrorAuthMinimo | null }>;
  refreshSession(): Promise<{ data: { session: SesionMinima | null }; error: ErrorAuthMinimo | null }>;
}

/** ¿El error de auth es de red (reintentable) y no una sesión inválida? */
export function esFallaDeRedAuth(error: ErrorAuthMinimo | null | undefined): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  if (error.status === 0 || (typeof error.status === 'number' && error.status >= 500)) return true;
  return /failed to fetch|network|timeout|load failed|fetch failed/i.test(error.message ?? '');
}

/**
 * Deja la sesión lista para subir. No lanza: devuelve el estado para que la cola decida.
 * `forzar`: refrescar aunque el token aún no esté por vencer (tras un 401 del servidor).
 */
export async function asegurarSesionParaSubir(
  auth: AuthMinimo,
  opts: { forzar?: boolean; ahora?: number } = {},
): Promise<EstadoSesion> {
  const ahora = opts.ahora ?? Date.now();
  const { data, error } = await auth.getSession();
  if (error) return esFallaDeRedAuth(error) ? 'sin_red' : 'vencida';
  const sesion = data.session;
  if (!sesion) return 'vencida';
  const venceMs = (sesion.expires_at ?? 0) * 1000;
  if (!opts.forzar && venceMs - ahora > MARGEN_REFRESCO_MS) return 'ok';

  const r = await auth.refreshSession();
  if (!r.error && r.data.session) return 'ok';
  return esFallaDeRedAuth(r.error) ? 'sin_red' : 'vencida';
}
