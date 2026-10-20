/**
 * Versión de la app, leída del <meta> que vite.config.ts inyecta en index.html.
 * No va horneada en el JS a propósito: así el chunk principal no cambia en cada
 * build y el celular no re-descarga la app completa en cada publicación.
 */
function meta(name: string): string | null {
  try {
    return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
  } catch {
    return null;
  }
}

export const APP_VERSION = meta('app-version') ?? '000000';
export const APP_BUILD_DATE = meta('app-build-date') ?? '';
