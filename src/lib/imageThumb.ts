// Miniaturas con la Transformación de Imágenes de Supabase Storage.
//
// Problema de costo: hoy las imágenes de producto/catálogo se sirven a
// resolución completa (≈150–250 KB) aunque se muestren en miniaturas de
// 28–80 px. Eso es egress puro y evitable. Servirlas transformadas a
// `?width=80&quality=60` pesa ≈5–15 KB → hasta ~90% menos tráfico de imágenes.
//
// A PRUEBA DE FALLOS: la transformación requiere que el plan de Supabase la
// tenga habilitada. Por eso hacemos una PRUEBA de capacidad una sola vez:
//   - Mientras no se confirme, se devuelve la imagen ORIGINAL (nunca se rompe).
//   - Si la prueba confirma soporte, se empiezan a usar las miniaturas.
//   - Si la prueba falla, se queda en original para siempre (sin parpadeos ni
//     imágenes rotas). El resultado se recuerda en localStorage.

type State = boolean | null; // null = desconocido

const LS_KEY = 'img-transform-supported';

function readInitial(): State {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

let supported: State = readInitial();
let probeStarted = false;
const listeners = new Set<() => void>();

function setSupported(v: boolean) {
  supported = v;
  try {
    localStorage.setItem(LS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_PREFIX = '/storage/v1/render/image/public/';

/** Convierte una URL de objeto público de Storage en su URL transformada. */
function toRenderUrl(url: string, width: number, quality: number): string {
  const i = url.indexOf(OBJECT_MARKER);
  if (i === -1) return url; // no es una URL de objeto de Storage → no se toca
  const base = url.slice(0, i) + RENDER_PREFIX + url.slice(i + OBJECT_MARKER.length);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&quality=${quality}&resize=contain`;
}

/** Lanza la prueba de capacidad una sola vez usando una imagen real. */
function startProbe(sampleStorageUrl: string) {
  if (probeStarted || supported !== null) return;
  const test = toRenderUrl(sampleStorageUrl, 16, 40);
  if (test === sampleStorageUrl) return; // no era URL de Storage; no sirve como muestra
  probeStarted = true;
  const img = new Image();
  img.onload = () => setSupported(true);
  img.onerror = () => setSupported(false);
  img.src = test;
}

/**
 * Devuelve la URL de miniatura si la transformación está confirmada; si no,
 * devuelve la original. Seguro de usar directo en `src` de un <img>.
 */
export function thumbUrl(
  url: string | null | undefined,
  width: number,
  quality = 60,
): string | undefined {
  if (!url) return url ?? undefined;
  // Aún no sabemos si hay soporte → arrancamos la prueba y usamos la original.
  if (supported === null) {
    startProbe(url);
    return url;
  }
  if (supported === false) return url;
  return toRenderUrl(url, width, quality);
}

/** Suscribe un callback a cambios del estado de soporte (para re-render). */
export function subscribeThumbState(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
