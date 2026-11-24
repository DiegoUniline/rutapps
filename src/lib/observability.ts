// Monitoreo de errores en producción: Sentry (opcional, con DSN) + tabla interna app_errores (D-064).
//
// A PRUEBA DE FALLOS: si no hay VITE_SENTRY_DSN configurado, TODO esto es un
// no-op — la app funciona igual, no se rompe nada. Se activa en cuanto pongas el
// token (DSN) en las variables de entorno de producción (Cloudflare).
//
// Configurado para NO gastar cuota de más: solo errores (sin performance
// tracing ni session replay), y sin enviar datos personales por defecto.

import * as Sentry from '@sentry/react';
import { APP_VERSION } from '@/lib/appVersion';

let initialized = false;

/** No inicializar en dev ni dentro de un iframe. */
function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return false;
}

export function initObservability(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || isRefusedContext()) return; // sin token o contexto no-prod → no-op

  Sentry.init({
    dsn,
    environment: 'production',
    release: APP_VERSION,
    sendDefaultPii: false, // no enviar datos personales por defecto
    tracesSampleRate: 0, // sin performance tracing (ahorro de cuota)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Ruido esperado en una PWA offline: errores de red no son bugs.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
      'Non-Error promise rejection captured',
      /Failed to fetch/i,
      /Load failed/i,
      /NetworkError/i,
      /AbortError/i,
      /The operation was aborted/i,
    ],
  });
  initialized = true;
}

/** Asocia usuario/empresa (solo IDs, sin datos personales) para depurar. */
export function setObservabilityUser(userId?: string | null, empresaId?: string | null): void {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
  Sentry.setTag('empresa_id', empresaId ?? undefined);
}

/**
 * Reporta un error ya manejado, con contexto opcional.
 * - Sentry: solo si hay VITE_SENTRY_DSN (sin cambios).
 * - D-064: SIEMPRE (en producción) a la tabla interna `app_errores` por RPC, sin datos
 *   personales. Se carga aparte (import dinámico) y nunca rompe: si falla, console.warn.
 */
export function captureAppError(error: unknown, context?: Record<string, unknown>): void {
  if (initialized) Sentry.captureException(error, context ? { extra: context } : undefined);
  if (isRefusedContext()) return; // dev, pruebas o iframe: no se reporta
  import('@/lib/telemetriaRuntime')
    .then((m) => m.reportarErrorInterno(error, context))
    .catch((e) => console.warn('[telemetría] no se pudo cargar el reporte interno', e));
}

export { Sentry };
