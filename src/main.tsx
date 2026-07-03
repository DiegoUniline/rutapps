import "./lib/cryptoPolyfill";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { startAutoBackup, restoreFromStorageBackup } from "./lib/offlineBackup";
import { initObservability } from "./lib/observability";

// Monitoreo de errores en producción (no-op si no hay VITE_SENTRY_DSN).
initObservability();

// Start auto-backup of pending sync items & restore if needed
restoreFromStorageBackup().then(count => {
  if (count > 0) console.log(`Restored ${count} sync items from backup`);
});
startAutoBackup();

// Apply saved theme before first paint
(function() {
  const t = localStorage.getItem('theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();

// SW lifecycle is owned by src/pwa/registerSW.ts. It is registered ONLY from
// inside the authenticated app shell, and unregistered automatically on public
// pages (landing, partners, etc.) so new publishes are visible immediately
// without users needing to clear cache.

const isInIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  // Kill-switch: aggressively unregister any existing SW and clear caches in
  // Lovable preview / iframe contexts (never register an SW here).
  (async () => {
    if (!navigator.serviceWorker) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) return;
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    window.location.reload();
  })();
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
