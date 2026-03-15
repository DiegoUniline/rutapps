import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useRutaStore } from '@/stores/rutaStore';

export default function OfflineBanner() {
  const { isOffline, setOffline, pendingSyncCount } = useRutaStore();

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [setOffline]);

  if (!isOffline) return null;

  return (
    <div className="bg-destructive/10 border-b border-destructive/20 px-3 py-2 flex items-center gap-2 text-destructive text-xs font-medium">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Sin conexión — guardando localmente</span>
      {pendingSyncCount > 0 && (
        <span className="ml-auto bg-destructive/20 rounded-full px-2 py-0.5 text-[10px] font-bold">
          {pendingSyncCount} pendiente{pendingSyncCount > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
