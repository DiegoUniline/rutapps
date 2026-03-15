import { RefreshCw, Wifi, WifiOff, Check, AlertTriangle } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

export default function SyncStatusBar() {
  const { isOnline, pendingCount, isSyncing, lastSync, syncNow } = useNetworkStatus();

  const formatLastSync = (ts: number | null) => {
    if (!ts) return 'Nunca';
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `Hace ${diff}m`;
    return `Hace ${Math.floor(diff / 60)}h`;
  };

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors",
      !isOnline
        ? "bg-destructive/10 text-destructive"
        : pendingCount > 0
          ? "bg-warning/10 text-warning"
          : "bg-success/10 text-success"
    )}>
      {/* Status icon */}
      {!isOnline ? (
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
      ) : pendingCount > 0 ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Check className="h-3.5 w-3.5 shrink-0" />
      )}

      {/* Status text */}
      <span className="flex-1 truncate">
        {!isOnline
          ? `Sin conexión · ${pendingCount} cambios pendientes`
          : pendingCount > 0
            ? `${pendingCount} cambios por sincronizar`
            : `Sincronizado · ${formatLastSync(lastSync)}`
        }
      </span>

      {/* Sync button */}
      {isOnline && (
        <button
          onClick={syncNow}
          disabled={isSyncing}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all active:scale-95 shrink-0",
            pendingCount > 0
              ? "bg-warning text-warning-foreground"
              : "bg-primary/10 text-primary"
          )}
        >
          <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
    </div>
  );
}
