import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useRutaStore } from '@/stores/rutaStore';
import { hasRealConnection } from '@/lib/connectivity';

export default function OfflineBanner() {
  const { isOffline, setOffline, pendingSyncCount } = useRutaStore();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const online = await hasRealConnection();
      if (!cancelled) setOffline(!online);
    };

    // Eventos del navegador (rápidos pero poco confiables) → disparan recheck real
    const onOnline = () => check();
    const onOffline = () => check();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onOnline);

    // Probe inicial + cada 15s
    check();
    const interval = setInterval(check, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onOnline);
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
