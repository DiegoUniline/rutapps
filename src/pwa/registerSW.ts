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

    // updateSW(true) = método LIMPIO y rápido: le dice al worker nuevo que active
    // (skipWaiting) y recarga la página cuando toma control. Cambia el shell
    // COMPLETO (index.html + chunks) de golpe a la versión nueva. No borra el
    // offline (a diferencia del refresh pesado anterior).
    let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

    // Solo evitamos auto-recargar si el usuario está CAPTURANDO (input enfocado o
    // un diálogo abierto), para no interrumpir una venta a medias. En ese caso se
    // reintenta cada pocos segundos: en cuanto suelta el teclado, se actualiza.
    // Ya NO se bloquea /ruta: el vendedor también debe tener siempre la última
    // versión (la cola offline sobrevive a la recarga, no se pierde nada).
    const isSafeToReload = (): boolean => {
      try {
        const ae = document.activeElement as HTMLElement | null;
        if (ae) {
          const tag = ae.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
          if (ae.isContentEditable) return false;
        }
        if (document.querySelector('[role="dialog"][data-state="open"], [data-state="open"][role="alertdialog"]')) {
          return false;
        }
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
        if (isSafeToReload() && updateSWFn) {
          updateSWFn(true).catch(() => {});
        } else {
          // Reintentar pronto: en cuanto el vendedor deje de escribir, se aplica.
          autoApplyTimer = window.setTimeout(tick, 5_000);
        }
      };
      autoApplyTimer = window.setTimeout(tick, 1_500);
    };

    updateSWFn = registerSW({
      immediate: false,
      onNeedRefresh() {
        notifyAppUpdateAvailable(); // banner de respaldo por si acaso
        scheduleAutoApply();        // pero se auto-aplica solo, casi al instante
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

    // Camino RÁPIDO de actualización: activa el worker nuevo (skipWaiting) y
    // recarga. Solo baja los chunks con hash nuevo (unos KB), sin borrar el
    // precache ni forzar re-descarga del bundle completo.
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
