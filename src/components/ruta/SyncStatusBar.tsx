import { RefreshCw, Wifi, WifiOff, Check, AlertTriangle, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function SyncStatusBar() {
  const {
    isOnline, pendingCount, isSyncing, lastSync, syncNow,
    autoSync, setAutoSync, lastSyncRows, dataSaver, setDataSaver,
  } = useNetworkStatus();
  const [expanded, setExpanded] = useState(false);

  const formatLastSync = (ts: number | null) => {
    if (!ts) return 'Nunca';
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `Hace ${diff}m`;
    return `Hace ${Math.floor(diff / 60)}h`;
  };

  return (
    <div className="border-b border-border">
      {/* Main bar - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
          !isOnline
            ? "bg-destructive/10 text-destructive"
            : pendingCount > 0
              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        )}
      >
        {!isOnline ? (
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
        ) : pendingCount > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="flex-1 truncate text-left">
          {!isOnline
            ? `Sin conexión · ${pendingCount} pendientes`
            : pendingCount > 0
              ? `${pendingCount} cambios por sincronizar`
              : `Sincronizado · ${formatLastSync(lastSync)}`
          }
        </span>

        {dataSaver && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold shrink-0 flex items-center gap-0.5">
            <Zap className="h-2.5 w-2.5" />
            AHORRO
          </span>
        )}

        {autoSync && isOnline && !dataSaver && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">
            AUTO
          </span>
        )}

        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 py-3 bg-muted/50 space-y-3">
          {/* Data saver toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Ahorro de datos
              </p>
              <p className="text-[10px] text-muted-foreground">
                Reduce consumo de internet al mínimo
              </p>
            </div>
            <Switch
              checked={dataSaver}
              onCheckedChange={setDataSaver}
            />
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Sincronización automática</p>
              <p className="text-[10px] text-muted-foreground">
                {dataSaver
                  ? 'Envía cambios cada 2min mientras haya internet'
                  : 'Envía cambios cada 30s mientras haya internet'
                }
              </p>
            </div>
            <Switch
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-2 text-xs">
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className="text-muted-foreground">
              {isOnline ? 'Conectado a internet' : 'Sin conexión — los datos se guardan localmente'}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="bg-background rounded-md p-2 text-center">
              <p className="text-lg font-bold text-foreground">{pendingCount}</p>
              <p className="text-muted-foreground">Pendientes</p>
            </div>
            <div className="bg-background rounded-md p-2 text-center">
              <p className="text-lg font-bold text-foreground">{formatLastSync(lastSync)}</p>
              <p className="text-muted-foreground">Última sync</p>
            </div>
            <div className="bg-background rounded-md p-2 text-center">
              <p className="text-lg font-bold text-foreground">{lastSyncRows}</p>
              <p className="text-muted-foreground">Registros</p>
            </div>
          </div>

          {dataSaver && (
            <div className="bg-amber-500/10 rounded-lg p-2 text-[10px] text-amber-700 dark:text-amber-300">
              <strong>Modo ahorro activo:</strong> Las imágenes se comprimen antes de subir. 
              Los datos se sincronizan con menor frecuencia. Usa "Sincronizar ahora" para forzar una actualización.
            </div>
          )}

          {/* Manual sync button */}
          <button
            onClick={(e) => { e.stopPropagation(); syncNow(); }}
            disabled={isSyncing || !isOnline}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98]",
              !isOnline
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground"
            )}
          >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            {isSyncing ? 'Sincronizando...' : !isOnline ? 'Sin conexión' : 'Sincronizar ahora'}
          </button>

          {!isOnline && (
            <p className="text-[10px] text-muted-foreground text-center">
              🔒 Tus datos están seguros. Se enviarán automáticamente cuando vuelva la conexión.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
