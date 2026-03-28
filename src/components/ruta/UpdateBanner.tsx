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

  // Apply update silently without visible reload
  useEffect(() => {
    if (!show) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    setShow(false);
  }, [show]);

  // This component no longer renders anything visible
  return null;
}
