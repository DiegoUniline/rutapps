import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { offlineDb } from '@/lib/offlineDb';
import { downloadAllData, MOBILE_QUICK_SYNC_TABLES, retryFailedTables, getFailedTables } from '@/lib/offlineSync';
import { processSyncQueue } from '@/lib/syncQueue';
import { hasRealConnection } from '@/lib/connectivity';

/**
 * On reconnect (browser online event or pageshow), push pending mutations,
 * then pull fresh critical tables. If the vendor's `carga_lineas` changed,
 * surface a toast so they know inventory was assigned/edited while offline.
 */
export function useOnlineReconnect() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const runningRef = useRef(false);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!empresa?.id || !user?.id) return;

    const run = async (trigger: string) => {
      const now = Date.now();
      if (runningRef.current) return;
      if (now - lastRunRef.current < 15000) return; // throttle: 15s
      runningRef.current = true;
      lastRunRef.current = now;
      try {
        const online = await hasRealConnection();
        if (!online) return;

        // Snapshot of vendor's carga signature before sync
        const beforeRows = await offlineDb.carga_lineas.toArray();
        const beforeSig = signature(beforeRows);

        // 1) Push pending mutations first
        await processSyncQueue().catch((e) => console.warn('[reconnect] push failed', e));

        // 2) Pull critical fresh data
        await downloadAllData(empresa.id, false, undefined, { tables: MOBILE_QUICK_SYNC_TABLES }).catch((e) => console.warn('[reconnect] pull failed', e));

        // 2.b) Second pass: if anything failed during the quick sync (timeout,
        // flaky link, partial response), retry ONLY those tables once. Cheap
        // and idempotent — keeps a foreign-vendor's offline cache complete
        // even when the first download was interrupted.
        try {
          const stillFailed = await getFailedTables();
          if (stillFailed.length > 0) {
            await retryFailedTables(empresa.id).catch((e) => console.warn('[reconnect] retry failed', e));
          }
        } catch { /* ignore */ }

        // 3) Detect new/changed carga lines
        const afterRows = await offlineDb.carga_lineas.toArray();
        const afterSig = signature(afterRows);

        if (beforeSig !== afterSig) {
          const newCount = afterRows.length - beforeRows.length;
          toast.success(
            newCount > 0
              ? `Llegó nueva carga (${newCount} producto${newCount === 1 ? '' : 's'} nuevo${newCount === 1 ? '' : 's'})`
              : 'Tu carga fue actualizada',
            { duration: 6000 },
          );
          // Refresh route screens
          ['mi-carga', 'mi-carga-hoy', 'stock-camion', 'ruta-stock', 'carga-lineas', 'cargas'].forEach((k) =>
            qc.invalidateQueries({ queryKey: [k] }),
          );
        }

        if (trigger !== 'mount') {
          // Always refresh entregas/ventas/cobros queries silently
          ['entregas', 'ruta-entregas', 'ventas', 'ruta-ventas', 'cobros', 'ruta-cuentas-pendientes'].forEach((k) =>
            qc.invalidateQueries({ queryKey: [k] }),
          );
        }
      } finally {
        runningRef.current = false;
      }
    };

    const onOnline = () => run('online');
    const onPageShow = () => run('pageshow');
    const onVisible = () => {
      if (document.visibilityState === 'visible') run('visibility');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);

    // Initial silent push on mount (in case we have pending mutations from previous session)
    run('mount').catch(() => {});

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [empresa?.id, user?.id, qc]);
}

function signature(rows: any[]): string {
  // Compact fingerprint: id + cantidad_cargada — captures additions, removals, and quantity edits
  return rows
    .map((r) => `${r.id}:${r.cantidad_cargada ?? 0}`)
    .sort()
    .join('|');
}
