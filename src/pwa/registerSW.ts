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
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // autoUpdate handles activation; controllerchange triggers reload below.
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Check for updates periodically while the app is open.
        setInterval(() => registration.update().catch(() => {}), 60_000);
      },
    });

    // When a new SW takes control after publish, reload once to pick up the
    // latest assets without forcing the user to clear cache.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

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
