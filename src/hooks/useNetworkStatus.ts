import { useState, useEffect, useCallback } from 'react';
import { getPendingCount, processSyncQueue } from '@/lib/syncQueue';
import { downloadAllData, getLastSyncTime, isCacheStale } from '@/lib/offlineSync';
import { verifySyncedItems } from '@/lib/syncVerify';
import { useAuth } from '@/contexts/AuthContext';
import { getSyncConfig, isDataSaverEnabled, setDataSaverMode } from '@/lib/dataSaver';

const AUTO_SYNC_KEY = 'uniline_auto_sync';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
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

  // Track online/offline
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Refresh pending count periodically (respects data saver)
  useEffect(() => {
    const config = getSyncConfig();
    const refresh = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
      if (count === 0 && isOnline && empresa?.id) {
        const isVerified = await verifySyncedItems(empresa.id);
        setVerified(isVerified);
      } else {
        setVerified(false);
      }
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
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || !empresa?.id) return;
    setIsSyncing(true);
    try {
      const result = await processSyncQueue();
      console.log(`Sync: ${result.success} uploaded, ${result.failed} failed`);
      const { rowsDownloaded } = await downloadAllData(empresa.id);
      setLastSyncRows(rowsDownloaded);
      const count = await getPendingCount();
      setPendingCount(count);
      const time = await getLastSyncTime();
      setLastSync(time);
      
      if (count === 0) {
        const isVerified = await verifySyncedItems(empresa.id);
        setVerified(isVerified);
      }

      // Notify all useOfflineQuery hooks to refetch (folios, server-generated fields)
      window.dispatchEvent(new Event('uniline:sync-complete'));
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [empresa?.id]);

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
    isOnline, pendingCount, isSyncing, lastSync, syncNow,
    autoSync, setAutoSync, verified, lastSyncRows,
    dataSaver, setDataSaver,
  };
}
