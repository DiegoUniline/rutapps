import { APP_VERSION } from '@/version';

const APP_SHELL_RUNTIME_CACHE_RE = /html-pages|static-assets/;

export function notifyAppUpdateAvailable() {
  window.dispatchEvent(new Event('uniline:sw-update-available'));
}

async function clearAppShellCaches() {
  if (!('caches' in window)) return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => APP_SHELL_RUNTIME_CACHE_RE.test(name))
      .map((name) => caches.delete(name).catch(() => false)),
  );
}

async function waitForControllerChange(timeoutMs = 1500) {
  if (!('serviceWorker' in navigator)) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}

async function activateWaitingWorker() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (reg) => {
      try {
        await reg.update().catch(() => undefined);
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // Best-effort only; the cache-busted reload below still refreshes the app shell.
      }
    }),
  );
}

export async function refreshAppVersion() {
  await activateWaitingWorker();
  await waitForControllerChange();
  await clearAppShellCaches();

  const url = new URL(window.location.href);
  url.searchParams.set('_v', APP_VERSION);
  url.searchParams.set('_r', Date.now().toString());
  window.location.replace(url.toString());
}