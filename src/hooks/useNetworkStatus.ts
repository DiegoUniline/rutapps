import { useState, useEffect, useCallback } from 'react';
import { getPendingCount, processSyncQueue } from '@/lib/syncQueue';
import { downloadAllData, getLastSyncTime, isCacheStale } from '@/lib/offlineSync';
import { useAuth } from '@/contexts/AuthContext';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const { empresa } = useAuth();

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

  // Refresh pending count periodically
  useEffect(() => {
    const refresh = () => getPendingCount().then(setPendingCount);
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load last sync time
  useEffect(() => {
    getLastSyncTime().then(setLastSync);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncNow();
    }
  }, [isOnline]);

  // Full sync: upload pending + download fresh data
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || !empresa?.id) return;
    setIsSyncing(true);
    try {
      // 1. Upload pending changes
      const result = await processSyncQueue();
      console.log(`Sync: ${result.success} uploaded, ${result.failed} failed`);

      // 2. Download fresh data
      await downloadAllData(empresa.id);

      // 3. Update state
      const count = await getPendingCount();
      setPendingCount(count);
      const time = await getLastSyncTime();
      setLastSync(time);
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [empresa?.id]);

  // Initial data download if cache is stale
  useEffect(() => {
    if (isOnline && empresa?.id) {
      isCacheStale(15).then(stale => {
        if (stale) syncNow();
      });
    }
  }, [isOnline, empresa?.id]);

  return { isOnline, pendingCount, isSyncing, lastSync, syncNow };
}
