import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shows a banner when a new version of the app is available.
 * Tapping "Actualizar" activates the waiting service worker → triggers reload.
 */
export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  const applyUpdate = () => {
    window.dispatchEvent(new Event('uniline:sw-apply-update'));
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  };

  if (!show) return null;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-4 py-3",
      "bg-primary text-primary-foreground shadow-lg",
      "safe-area-top animate-in slide-in-from-top duration-300"
    )}>
      <Download className="h-5 w-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold">Nueva versión disponible</p>
        <p className="text-[11px] opacity-80">Toca actualizar para obtener las últimas mejoras</p>
      </div>
      <button
        onClick={applyUpdate}
        className="shrink-0 bg-primary-foreground text-primary text-[12px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
      >
        Actualizar
      </button>
      <button onClick={() => setShow(false)} className="shrink-0 opacity-60 active:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
