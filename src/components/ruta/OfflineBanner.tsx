import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, CheckCircle2, CloudUpload, AlertTriangle } from 'lucide-react';
import { useRutaStore } from '@/stores/rutaStore';
import { hasRealConnection } from '@/lib/connectivity';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * Banner superior que SIEMPRE indica el estado de la conexión y de la cola
 * de sincronización. Tres estados:
 *  - offline                → barra roja "Sin conexión · N pendientes"
 *  - reconnected (transitorio)→ barra verde "Reconectado, sincronizando..."
 *  - online sin pendientes  → oculto
 *  - online con pendientes  → barra ámbar "N cambios por enviar"
 */
export default function OfflineBanner() {
  const { isOffline, setOffline } = useRutaStore();
  const { pendingCount, failedCount, isSyncing } = useNetworkStatus();
  const navigate = useNavigate();
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  // Probe real connectivity (navigator.onLine no es confiable en móvil)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const online = await hasRealConnection();
      if (!cancelled) setOffline(!online);
    };
    const onOnline = () => check();
    const onOffline = () => check();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onOnline);
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

  // Mostrar destello "Reconectado" cuando se pasa de offline → online
  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
      setJustReconnected(false);
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 4500);
      return () => clearTimeout(t);
    }
  }, [isOffline]);

  // FALLIDOS (dead-letter): registros que no se pudieron sincronizar.
  // Máxima prioridad y SIEMPRE visible (antes desaparecían del contador),
  // clickeable para ir a revisarlos/reintentarlos.
  if (failedCount > 0) {
    return (
      <button
        type="button"
        onClick={() => navigate('/ruta/pendientes')}
        className="w-full bg-destructive/15 border-b border-destructive/40 px-3 py-2 flex items-center gap-2 text-destructive text-xs font-semibold"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-left">
          {failedCount} registro{failedCount > 1 ? 's' : ''} no se pudo sincronizar — toca para revisar
        </span>
        <span className="ml-auto bg-destructive/25 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
          {failedCount}
        </span>
      </button>
    );
  }

  // OFFLINE
  if (isOffline) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-3 py-2 flex items-center gap-2 text-destructive text-xs font-medium">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Sin conexión — tus cambios se guardan en este dispositivo
        </span>
        {pendingCount > 0 && (
          <span className="ml-auto bg-destructive/20 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
            {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  }

  // RECONNECTED (transitorio)
  if (justReconnected) {
    return (
      <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-medium animate-in fade-in slide-in-from-top-1">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {pendingCount > 0 || isSyncing
            ? 'Reconectado — sincronizando tus cambios...'
            : 'Reconectado — todo al día ✓'}
        </span>
        {pendingCount > 0 && (
          <span className="ml-auto bg-emerald-500/20 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  // ONLINE con pendientes
  if (pendingCount > 0) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-2 flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-medium">
        <CloudUpload className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {isSyncing
            ? `Enviando ${pendingCount} cambio${pendingCount > 1 ? 's' : ''}...`
            : `${pendingCount} cambio${pendingCount > 1 ? 's' : ''} por sincronizar`}
        </span>
        <span className="ml-auto bg-amber-500/20 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
          {pendingCount}
        </span>
      </div>
    );
  }

  return null;
}
