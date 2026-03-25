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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      // Check for updates every 60s
      setInterval(() => registration.update(), 60_000);

      // When a new SW is waiting, show update banner
      const showUpdateBanner = () => {
        window.dispatchEvent(new Event('uniline:sw-update-available'));
      };

      if (registration.waiting) {
        showUpdateBanner();
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    });

    // Only reload on controllerchange if user explicitly requested it
    let userRequestedUpdate = false;
    window.addEventListener('uniline:sw-apply-update', () => { userRequestedUpdate = true; });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!userRequestedUpdate) return;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
