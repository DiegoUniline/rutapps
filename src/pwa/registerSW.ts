// Single-source SW registration wrapper.
// Registers the PWA service worker ONLY inside the authenticated app,
// never on the public landing or in Lovable preview/dev contexts.
//
// Public marketing pages (/, /partners, etc.) must NEVER call this — they
// rely on the host CDN's cache headers so new deploys appear immediately.

let registered = false;

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
    const { notifyAppUpdateAvailable } = await import('@/lib/appUpdate');

    // updateSW(true) activa el worker nuevo y recarga la página. IMPORTANTE:
    // nunca lo ejecutamos automáticamente porque una recarga puede destruir
    // capturas no guardadas. El usuario aplica la actualización desde el banner.
    let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

    updateSWFn = registerSW({
      immediate: false,
      onNeedRefresh() {
        // Solo notificamos. PWAUpdatePrompt decide si es seguro actualizar.
        notifyAppUpdateAvailable();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        const check = () => registration.update().catch(() => {});
        // setInterval se frena en background móvil, por eso además hay triggers
        // por evento (foco, reconexión, reapertura de la PWA).
        setInterval(check, 30_000);
        window.addEventListener('focus', check);
        window.addEventListener('online', check);
        window.addEventListener('pageshow', check);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.addEventListener('uniline:check-sw-update', check);
        (window as any).__checkSWUpdate = check;
      },
    });

    // Camino manual de actualización. PWAUpdatePrompt valida primero que no
    // existan cambios sin guardar antes de invocarlo.
    (window as any).__applySWUpdate = () => updateSWFn?.(true);
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
