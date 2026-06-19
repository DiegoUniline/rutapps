import { useEffect } from 'react';

/**
 * Shows a banner when a new version of the app is available.
 * Tapping "Actualizar" activates the waiting service worker → triggers reload.
 */
export default function UpdateBanner() {
  useEffect(() => {
    const handler = () => {
      // The visible update controls live in AppLayout and MobileLayout.
      // This compatibility component intentionally does not auto-reload.
    };
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  // This component no longer renders anything visible
  return null;
}
