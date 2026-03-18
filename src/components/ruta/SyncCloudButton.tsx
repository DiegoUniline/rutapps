import { Cloud, CloudOff, CloudUpload, Check, Loader2 } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export default function SyncCloudButton() {
  const { isOnline, pendingCount, isSyncing, lastSync, syncNow, autoSync, setAutoSync, verified } = useNetworkStatus();
  const [showPanel, setShowPanel] = useState(false);
  const [tapped, setTapped] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  // Brief "tapped" pulse for instant visual feedback
  useEffect(() => {
    if (tapped) {
      const t = setTimeout(() => setTapped(false), 600);
      return () => clearTimeout(t);
    }
  }, [tapped]);

  const formatLastSync = (ts: number | null) => {
    if (!ts) return 'Nunca';
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h`;
  };

  const getCloudState = () => {
    if (!isOnline) return 'offline';
    if (isSyncing) return 'syncing';
    if (pendingCount > 0) return 'pending';
    if (verified) return 'verified';
    return 'synced';
  };

  const state = getCloudState();

  const handleTap = useCallback(() => {
    if (didLongPress.current) return;
    if (!isOnline) {
      toast.error('Sin conexión');
      return;
    }
    if (isSyncing) return;
    // Instant visual feedback
    setTapped(true);
    toast('Sincronizando...', { icon: '🔄', duration: 1500 });
    syncNow()
      .then(() => toast.success('✓ Sincronizado'))
      .catch(() => toast.error('Error al sincronizar'));
  }, [isOnline, isSyncing, syncNow]);

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setShowPanel(true);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      handleTap();
    }
  }, [handleTap]);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const cloudIcon = () => {
    switch (state) {
      case 'offline':
        return <CloudOff className="h-5 w-5" />;
      case 'syncing':
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case 'pending':
        return <CloudUpload className="h-5 w-5" />;
      case 'verified':
        return (
          <div className="relative">
            <Cloud className="h-5 w-5" />
            <Check className="h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5 stroke-[3]" />
          </div>
        );
      default:
        return <Cloud className="h-5 w-5" />;
    }
  };

  const stateColors: Record<string, string> = {
    offline: 'text-destructive',
    syncing: 'text-primary',
    pending: 'text-orange-500',
    verified: 'text-emerald-500',
    synced: 'text-muted-foreground',
  };

  return (
    <div className="relative">
      {/* Cloud button — tap = sync, long press = panel */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-90 select-none touch-none",
          tapped ? 'text-primary scale-110 bg-primary/10' : stateColors[state],
        )}
      >
        {cloudIcon()}
        {pendingCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white px-1">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>

      {/* Dropdown panel (long press) */}
      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          
          <div className="absolute right-0 top-12 z-50 w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            <div className={cn(
              "px-4 py-3 flex items-center gap-3",
              state === 'offline' ? 'bg-destructive/10' :
              state === 'pending' ? 'bg-orange-500/10' :
              state === 'verified' ? 'bg-emerald-500/10' :
              'bg-muted/50'
            )}>
              <div className={cn("shrink-0", stateColors[state])}>
                {cloudIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {state === 'offline' && 'Sin conexión'}
                  {state === 'syncing' && 'Sincronizando...'}
                  {state === 'pending' && `${pendingCount} cambios pendientes`}
                  {state === 'verified' && '✓ Verificado en servidor'}
                  {state === 'synced' && 'Sincronizado'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {state === 'offline' 
                    ? 'Los datos se guardan localmente'
                    : state === 'verified'
                      ? 'Los datos ya son visibles en escritorio'
                      : `Última sync: ${formatLastSync(lastSync)}`
                  }
                </p>
              </div>
            </div>

            <div className="px-4 py-3 flex items-center justify-between border-b border-border">
              <div>
                <p className="text-xs font-semibold text-foreground">Sync automático</p>
                <p className="text-[10px] text-muted-foreground">Enviar datos en tiempo real</p>
              </div>
              <button
                onClick={() => setAutoSync(!autoSync)}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  autoSync ? "bg-primary" : "bg-input"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow-md transition-transform",
                  autoSync && "translate-x-5"
                )} />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  state === 'verified' ? "bg-emerald-500" :
                  state === 'pending' ? "bg-orange-500 animate-pulse" :
                  state === 'offline' ? "bg-destructive" :
                  "bg-muted-foreground"
                )} />
                <p className="text-[11px] text-muted-foreground">
                  {state === 'verified' 
                    ? 'Datos confirmados en el servidor — visibles en escritorio'
                    : state === 'pending'
                      ? 'Hay cambios que aún no llegan al servidor'
                      : state === 'offline'
                        ? 'Se sincronizará al recuperar conexión'
                        : 'Datos enviados al servidor'
                  }
                </p>
              </div>
            </div>

            <div className="p-3 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Cloud className="h-3 w-3 shrink-0" />
              <span>Toque = sincronizar · Toque largo = este panel</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}