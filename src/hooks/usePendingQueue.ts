import { useEffect, useState, useCallback } from 'react';
import { listQueueItems, type PendingQueueItem } from '@/lib/syncQueue';

/**
 * Reads the IndexedDB sync queue and refreshes every 3s.
 * Used by the "Pendientes de sincronizar" page and the header badge.
 */
export function usePendingQueue(refreshMs: number = 3000) {
  const [items, setItems] = useState<PendingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await listQueueItems();
      setItems(data);
    } catch (e) {
      console.warn('usePendingQueue reload failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    reload();
    const t = setInterval(() => { if (alive) reload(); }, refreshMs);
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload, refreshMs]);

  const pending = items.filter(i => i.status === 'pending').length;
  const retrying = items.filter(i => i.status === 'retrying').length;
  const failed = items.filter(i => i.status === 'failed').length;

  return { items, pending, retrying, failed, total: items.length, loading, reload };
}
