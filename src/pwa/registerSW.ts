// Single-source SW registration wrapper.
// Registers the PWA service worker ONLY inside the authenticated app,
// never on the public landing or in Lovable preview/dev contexts.
//
// Public marketing pages (/, /partners, etc.) must NEVER call this — they
// rely on the host CDN's cache headers so new deploys appear immediately.

let registered = false;
let controllerListenerAttached = false;

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;

  // Inside an iframe (Lovable editor preview embeds the app in an iframe)
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;

  // Kill switch
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;

  return false;
}

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
        })
        .map((r) => r.unregister()),
    );
  } catch {
    // ignore
  }
}

async function clearAppShellCaches() {
  if (!("caches" in window)) return;
  try {
    const names = await caches.keys();
    const toDelete = names.filter((n) => /precache-v\d+|workbox-|html-pages|static-assets/.test(n));
    await Promise.all(toDelete.map((n) => caches.delete(n)));
  } catch {
    // ignore
  }
}

/**
 * Register the PWA service worker. Safe to call multiple times.
 * Refuses to register in dev, Lovable preview, iframes, or with ?sw=off.
 */
export async function registerAppSW() {
  if (registered) return;
  registered = true;

  if (isRefusedContext()) {
    await unregisterAppSW();
    return;
  }

  if (!("serviceWorker" in navigator)) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    const { notifyAppUpdateAvailable, refreshAppVersion } = await import('@/lib/appUpdate');

    // Auto-apply the update when it's safe (no input focused, no open modal/dialog,
    // no dirty form). Otherwise notify and try again later. This way published
    // changes appear without users needing to Ctrl+Shift+R.
    const isSafeToReload = (): boolean => {
      try {
        const ae = document.activeElement as HTMLElement | null;
        if (ae) {
          const tag = ae.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
          if (ae.isContentEditable) return false;
        }
        // Any open Radix dialog / sheet / popover means the user is mid-task.
        if (document.querySelector('[role="dialog"][data-state="open"], [data-state="open"][role="alertdialog"]')) {
          return false;
        }
        // Mobile route view: never auto-reload (they may be offline capturing sales).
        if (location.pathname.startsWith('/ruta')) return false;
        return true;
      } catch {
        return false;
      }
    };

    let autoApplyTimer: number | null = null;
    const scheduleAutoApply = () => {
      if (autoApplyTimer != null) return;
      const tick = () => {
        autoApplyTimer = null;
        if (isSafeToReload()) {
          refreshAppVersion().catch(() => {});
        } else {
          // Try again in 30s while still showing the manual prompt as fallback.
          autoApplyTimer = window.setTimeout(tick, 30_000);
        }
      };
      autoApplyTimer = window.setTimeout(tick, 2_000);
    };

    const updateSW = registerSW({
      immediate: false,
      onNeedRefresh() {
        notifyAppUpdateAvailable();
        scheduleAutoApply();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Check for updates more often so a fresh deploy is picked up quickly.
        setInterval(() => registration.update().catch(() => {}), 60_000);
        // Also check when the tab regains focus.
        window.addEventListener('focus', () => registration.update().catch(() => {}));
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      },
    });

    // If a new worker takes control after the user accepts the update, remove
    // only the app-shell caches. Do not auto-reload here; active forms/POS stay usable.
    if (!controllerListenerAttached) {
      controllerListenerAttached = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        clearAppShellCaches().catch(() => {});
      });
    }

    void updateSW;
  } catch (err) {
    console.warn("[pwa] SW registration skipped:", err);
  }
}

/**
 * For public pages: unregister any previously installed app SW and clear its
 * caches so visitors who installed an older PWA see fresh content immediately.
 * Runs at most once per tab.
 */
let publicCleanupDone = false;
export async function ensureNoSWForPublicPage() {
  if (publicCleanupDone) return;
  publicCleanupDone = true;
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const appRegs = regs.filter((r) => {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
    });
    if (appRegs.length === 0) return;

    await Promise.all(appRegs.map((r) => r.unregister()));

    // Clear caches the app SW created (workbox precache + runtime caches).
    if ("caches" in window) {
      const names = await caches.keys();
      const toDelete = names.filter((n) =>
        /precache-v\d+|workbox-|html-pages|static-assets|images|fonts|supabase-storage/.test(n),
      );
      await Promise.all(toDelete.map((n) => caches.delete(n)));
    }

    // Reload once so the now-un-controlled tab fetches fresh HTML/JS from CDN.
    window.location.reload();
  } catch {
    // ignore
  }
}
