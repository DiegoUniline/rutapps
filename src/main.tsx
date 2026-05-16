import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startAutoBackup, restoreFromStorageBackup } from "./lib/offlineBackup";

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

const isInIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreviewHost = window.location.hostname.includes("id-preview--") || window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      // Check for updates every 60s
      setInterval(() => registration.update(), 60_000);
    });

    // Auto-reload cuando el nuevo SW toma control (publicación nueva)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
} // end else-if serviceWorker

createRoot(document.getElementById("root")!).render(<App />);
