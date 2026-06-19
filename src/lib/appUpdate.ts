import { APP_VERSION } from '@/version';

// Caches we wipe on manual "Actualizar app". Includes the Workbox precache so
// the old bundled HTML/JS no longer wins over the freshly-fetched assets.
const APP_CACHE_RE = /precache|workbox|html-pages|static-assets/i;

export function notifyAppUpdateAvailable() {
  window.dispatchEvent(new Event('uniline:sw-update-available'));
}

async function clearAppCaches() {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => APP_CACHE_RE.test(n)).map((n) => caches.delete(n).catch(() => false)),
    );
  } catch {
    // best effort
  }
}

async function activateAndUnregisterSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (reg) => {
        try {
          // Trigger update check so a waiting worker becomes available.
          await reg.update().catch(() => undefined);
          // Tell any waiting worker to skip waiting (best effort).
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          // Unregister so the NEXT navigation is uncontrolled and bypasses
          // the precache entirely — this is what guarantees the user gets the
          // fresh HTML/JS from the CDN. The SW will re-register on app load.
          await reg.unregister().catch(() => false);
        } catch {
          // ignore
        }
      }),
    );
  } catch {
    // ignore
  }
}

export async function refreshAppVersion() {
  // Order matters: unregister SW first so the reload is not intercepted,
  // then nuke all app caches (precache included), then hard-reload with
  // cache-busting params.
  await activateAndUnregisterSW();
  await clearAppCaches();

  const url = new URL(window.location.href);
  url.searchParams.set('_v', APP_VERSION);
  url.searchParams.set('_r', Date.now().toString());
  window.location.replace(url.toString());
}
