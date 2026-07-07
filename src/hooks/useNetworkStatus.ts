import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getPendingCount, getDeadLetterCount, processSyncQueue } from '@/lib/syncQueue';
import { downloadAllData, getLastSyncTime, isCacheStale, MOBILE_QUICK_SYNC_TABLES } from '@/lib/offlineSync';
import { verifySyncedItems } from '@/lib/syncVerify';
import { useAuth } from '@/contexts/AuthContext';
import { getSyncConfig, isDataSaverEnabled, setDataSaverMode } from '@/lib/dataSaver';
import { hasRealConnection } from '@/lib/connectivity';
import { APP_VERSION } from '@/version';

const SYNCED_APP_VERSION_KEY = 'uniline_synced_app_version';

const AUTO_SYNC_KEY = 'uniline_auto_sync';
type SyncNowResult = { ok: boolean; rowsDownloaded: number; pendingCount: number; reason?: string };
let activeSyncPromise: Promise<SyncNowResult> | null = null;
let lastGlobalSyncAt = 0;

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const prevFailedRef = useRef<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [lastSyncRows, setLastSyncRows] = useState(0);
  const [dataSaver, setDataSaverState] = useState(isDataSaverEnabled);
  const [autoSync, setAutoSyncState] = useState(() => {
    const saved = localStorage.getItem(AUTO_SYNC_KEY);
    return saved === null ? true : saved === 'true';
  });
  const { empresa } = useAuth();

  const setAutoSync = useCallback((value: boolean) => {
    setAutoSyncState(value);
    localStorage.setItem(AUTO_SYNC_KEY, String(value));
  }, []);

  const setDataSaver = useCallback((value: boolean) => {
    setDataSaverMode(value);
    setDataSaverState(value);
  }, []);

  // Track real online/offline; navigator.onLine is unreliable on mobile/PWA
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const online = await hasRealConnection();
      if (!cancelled) setIsOnline(online);
    };

    const recheck = () => check();
    check();
    const interval = setInterval(check, 15000);
    window.addEventListener('online', recheck);
    window.addEventListener('offline', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, []);

  // Refresh pending count periodically (respects data saver)
  useEffect(() => {
    const config = getSyncConfig();
    const refresh = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
      if (count > 0 || !isOnline) {
        setVerified(false);
      }
      // Dead-letter (fallidos): hacer visibles los registros que no
      // pudieron sincronizar. Avisar con toast SOLO cuando el número sube
      // (un fallo nuevo), no en cada refresco.
      const failed = await getDeadLetterCount();
      setFailedCount(failed);
      const prev = prevFailedRef.current;
      if (prev !== null && failed > prev) {
        toast.error(
          `${failed} registro${failed > 1 ? 's' : ''} no se pudo sincronizar`,
          { description: 'Revísalo en Ruta › Pendientes por sincronizar.', duration: 8000 },
        );
      }
      prevFailedRef.current = failed;
    };
    refresh();
    const interval = setInterval(refresh, config.pendingCheckInterval);
    return () => clearInterval(interval);
  }, [isOnline, empresa?.id, dataSaver]);

  // Load last sync time
  useEffect(() => {
    getLastSyncTime().then(setLastSync);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && autoSync) {
      syncNow();
    }
  }, [isOnline, autoSync]);

  // Auto-sync interval when enabled (respects data saver)
  useEffect(() => {
    if (!autoSync || !isOnline || !empresa?.id) return;
    const config = getSyncConfig();
    const interval = setInterval(() => {
      getPendingCount().then(count => {
        if (count > 0) syncNow();
      });
    }, config.autoSyncInterval);
    return () => clearInterval(interval);
  }, [autoSync, isOnline, empresa?.id, dataSaver]);

  // Full sync
  const syncNow = useCallback(async (): Promise<SyncNowResult> => {
    if (!empresa?.id) return { ok: false, rowsDownloaded: 0, pendingCount, reason: 'Sin empresa activa' };
    const now = Date.now();
    if (activeSyncPromise) {
      setIsSyncing(true);
      try {
        return await activeSyncPromise;
      } finally {
        setIsSyncing(false);
      }
    }
    if (now - lastGlobalSyncAt < 4000) return { ok: true, rowsDownloaded: lastSyncRows, pendingCount };
    lastGlobalSyncAt = now;
    setIsSyncing(true);
    activeSyncPromise = (async () => {
      const online = await hasRealConnection();
      setIsOnline(online);
      if (!online) return { ok: false, rowsDownloaded: 0, pendingCount, reason: 'Sin conexión real' };

      const result = await processSyncQueue();
      console.log(`Sync: ${result.success} uploaded, ${result.failed} failed`);
      const { rowsDownloaded } = await downloadAllData(empresa.id, false, undefined, { tables: MOBILE_QUICK_SYNC_TABLES });
      const count = await getPendingCount();
      return {
        ok: result.failed === 0,
        rowsDownloaded,
        pendingCount: count,
        reason: result.failed > 0 ? `${result.failed} cambios quedaron pendientes` : undefined,
      };
    })();

    try {
      const syncResult = await activeSyncPromise;
      const { rowsDownloaded, pendingCount: count } = syncResult;
      setLastSyncRows(rowsDownloaded);
      setPendingCount(count);
      const time = await getLastSyncTime();
      setLastSync(time);
      
      if (count === 0) {
        verifySyncedItems(empresa.id)
          .then(setVerified)
          .catch(() => setVerified(false));
      }

      // Notify all useOfflineQuery hooks to refetch (folios, server-generated fields)
      window.dispatchEvent(new Event('uniline:sync-complete'));
      return syncResult;
    } catch (err) {
      console.error('Sync error:', err);
      return { ok: false, rowsDownloaded: 0, pendingCount, reason: err instanceof Error ? err.message : 'Error de sincronización' };
    } finally {
      activeSyncPromise = null;
      setIsSyncing(false);
    }
  }, [empresa?.id, pendingCount]);

  // Al actualizar el CÓDIGO de la app (nueva versión), forzar UNA descarga
  // COMPLETA para limpiar cualquier dato viejo en caché (precios, categorías,
  // clientes…) sin que el vendedor tenga que tocar "Descargar todo" a mano.
  // Se corre una sola vez por versión: si tiene éxito, se guarda la versión;
  // si falla, no se guarda y se reintenta en el próximo arranque.
  useEffect(() => {
    if (!isOnline || !empresa?.id || !autoSync) return;
    if (localStorage.getItem(SYNCED_APP_VERSION_KEY) === APP_VERSION) return;
    let cancelled = false;
    (async () => {
      try {
        const online = await hasRealConnection();
        if (!online || cancelled) return;
        await downloadAllData(empresa.id, true);
        if (cancelled) return;
        localStorage.setItem(SYNCED_APP_VERSION_KEY, APP_VERSION);
        const t = await getLastSyncTime();
        setLastSync(t);
        // Avisar a los useOfflineQuery para que reflejen los datos frescos.
        window.dispatchEvent(new Event('uniline:sync-complete'));
      } catch (e) {
        console.warn('[app-update] refresco completo falló, se reintentará', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isOnline, empresa?.id, autoSync]);

  // Initial data download if cache is stale (respects autoSync & data saver)
  useEffect(() => {
    if (isOnline && empresa?.id && autoSync) {
      const config = getSyncConfig();
      isCacheStale(config.cacheStaleMinutes).then(stale => {
        if (stale) syncNow();
      });
    }
  }, [isOnline, empresa?.id, autoSync]);

  return {
    isOnline, pendingCount, failedCount, isSyncing, lastSync, syncNow,
    autoSync, setAutoSync, verified, lastSyncRows,
    dataSaver, setDataSaver,
  };
}
