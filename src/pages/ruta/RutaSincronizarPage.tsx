import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Upload, RefreshCw, CheckCircle2, AlertTriangle,
  Database, Wifi, WifiOff, Shield, Zap, Loader2, ChevronDown, ChevronUp,
  HardDrive, CloudUpload, Clock, BarChart3, FileDown, FileUp, Save,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { downloadAllData, getLocalDataSummary, type SyncProgress } from '@/lib/offlineSync';
import { getPendingCount, getDeadLetterCount, retryDeadLetters, processSyncQueue } from '@/lib/syncQueue';
import { offlineDb } from '@/lib/offlineDb';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  exportFullBackup, importFullBackup,
  getBackupTimestamp, getBackupItemCount, backupSyncQueueToStorage,
} from '@/lib/offlineBackup';

export default function RutaSincronizarPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const { isOnline, pendingCount, isSyncing, syncNow, dataSaver, setDataSaver } = useNetworkStatus();

  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<SyncProgress[]>([]);
  const [localSummary, setLocalSummary] = useState<{ table: string; label: string; count: number; lastSync: number | null }[]>([]);
  const [showLocalData, setShowLocalData] = useState(false);
  const [deadLetters, setDeadLetters] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ success: number; failed: number } | null>(null);
  const [downloadResult, setDownloadResult] = useState<{ total: number } | null>(null);
  const [backupTs, setBackupTs] = useState<number | null>(getBackupTimestamp());
  const [backupCount, setBackupCount] = useState(getBackupItemCount());
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load local data summary
  const loadSummary = useCallback(async () => {
    const summary = await getLocalDataSummary();
    setLocalSummary(summary);
    const dl = await getDeadLetterCount();
    setDeadLetters(dl);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const totalLocalRecords = localSummary.reduce((s, r) => s + r.count, 0);
  const oldestSync = localSummary.reduce((min, r) => {
    if (!r.lastSync) return min;
    return min === null ? r.lastSync : Math.min(min, r.lastSync);
  }, null as number | null);

  // DOWNLOAD: Get everything from server
  const handleFullDownload = async () => {
    if (!empresa?.id || !isOnline) return;
    setDownloading(true);
    setDownloadResult(null);
    setDownloadProgress([]);
    try {
      const result = await downloadAllData(empresa.id, true, (progress) => {
        setDownloadProgress(progress);
      });
      setDownloadResult({ total: result.rowsDownloaded });
      toast.success(`✅ Descarga completa: ${result.rowsDownloaded.toLocaleString()} registros guardados en tu dispositivo`);
      await loadSummary();
    } catch (err: any) {
      toast.error('Error al descargar: ' + (err?.message || 'Error desconocido'));
    } finally {
      setDownloading(false);
    }
  };

  // UPLOAD: Send all pending changes to server
  const handleUpload = async () => {
    if (!isOnline) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await processSyncQueue();
      setUploadResult(result);
      if (result.failed === 0) {
        toast.success(`✅ ${result.success} cambios enviados correctamente al servidor`);
      } else {
        toast.warning(`⚠️ ${result.success} enviados, ${result.failed} fallaron (se reintentarán)`);
      }
      await loadSummary();
    } catch (err: any) {
      toast.error('Error al enviar: ' + (err?.message || 'Error desconocido'));
    } finally {
      setUploading(false);
    }
  };

  const handleRetryDeadLetters = async () => {
    const count = await retryDeadLetters();
    toast.info(`${count} registros puestos en cola para reintento`);
    await loadSummary();
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return 'Nunca';
    return new Date(ts).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatTimeAgo = (ts: number | null) => {
    if (!ts) return 'Nunca';
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return 'Ahora mismo';
    if (diff < 60) return `Hace ${diff} min`;
    if (diff < 1440) return `Hace ${Math.floor(diff / 60)}h`;
    return `Hace ${Math.floor(diff / 1440)} días`;
  };

  const downloadingCount = downloadProgress.filter(p => p.status === 'downloading').length;
  const doneCount = downloadProgress.filter(p => p.status === 'done').length;
  const totalTables = downloadProgress.length || 22;
  const progressPct = downloadProgress.length > 0 ? Math.round((doneCount / totalTables) * 100) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-[16px] font-bold text-foreground">Centro de sincronización</h1>
      </div>

      <div className="flex-1 p-4 space-y-4 pb-8">

        {/* Connection status */}
        <div className={cn(
          "rounded-2xl p-4 flex items-center gap-3",
          isOnline ? "bg-emerald-500/10" : "bg-destructive/10"
        )}>
          {isOnline ? <Wifi className="h-5 w-5 text-emerald-500 shrink-0" /> : <WifiOff className="h-5 w-5 text-destructive shrink-0" />}
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {isOnline ? 'Conectado a internet' : 'Sin conexión'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isOnline ? 'Puedes descargar y enviar datos' : 'Trabaja con los datos guardados. Se enviarán cuando tengas conexión.'}
            </p>
          </div>
        </div>

        {/* Data safety banner */}
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 flex gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Tus datos están seguros</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Todo se guarda en tu dispositivo de forma permanente. Puedes hacer miles de ventas sin internet. 
              Nada se pierde. Cuando tengas WiFi, presiona "Enviar al servidor" y listo.
            </p>
          </div>
        </div>

        {/* ── STEP 1: DOWNLOAD ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-foreground">1. Descargar datos</p>
                <p className="text-[11px] text-muted-foreground">
                  Baja clientes, productos, precios, promociones y todo lo que necesitas para trabajar
                </p>
              </div>
            </div>

            {/* Download progress */}
            {downloading && downloadProgress.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Descargando...</span>
                  <span className="font-semibold text-foreground">{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {downloadProgress.map(p => (
                    <div key={p.table} className="flex items-center gap-2 text-[11px]">
                      {p.status === 'waiting' && <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
                      {p.status === 'downloading' && <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />}
                      {p.status === 'done' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                      {p.status === 'error' && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                      <span className={cn(
                        "flex-1",
                        p.status === 'downloading' ? 'text-primary font-medium' :
                        p.status === 'done' ? 'text-muted-foreground' : 'text-muted-foreground/60'
                      )}>
                        {p.label}
                      </span>
                      {p.rowCount > 0 && (
                        <span className="text-muted-foreground font-mono">{p.rowCount.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download result */}
            {downloadResult && !downloading && (
              <div className="mt-3 bg-emerald-500/10 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  <strong>{downloadResult.total.toLocaleString()}</strong> registros descargados y guardados
                </p>
              </div>
            )}

            <button
              onClick={handleFullDownload}
              disabled={downloading || !isOnline}
              className={cn(
                "w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]",
                !isOnline ? "bg-muted text-muted-foreground cursor-not-allowed" :
                downloading ? "bg-primary/50 text-primary-foreground" :
                "bg-primary text-primary-foreground"
              )}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? 'Descargando...' : 'Descargar todo'}
            </button>
          </div>
        </div>

        {/* ── STEP 2: WORK OFFLINE (status) ── */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-foreground">2. Datos en tu dispositivo</p>
              <p className="text-[11px] text-muted-foreground">
                Todo guardado localmente — trabaja sin internet
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground">{totalLocalRecords.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Registros locales</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground">{pendingCount}</p>
              <p className="text-[10px] text-muted-foreground">Por enviar</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground">{formatTimeAgo(oldestSync)}</p>
              <p className="text-[10px] text-muted-foreground">Última descarga</p>
            </div>
          </div>

          {/* Expandable local data detail */}
          <button
            onClick={() => { setShowLocalData(!showLocalData); if (!showLocalData) loadSummary(); }}
            className="w-full flex items-center justify-between text-xs text-muted-foreground py-2"
          >
            <span className="flex items-center gap-1">
              <Database className="h-3.5 w-3.5" />
              Ver detalle por tabla
            </span>
            {showLocalData ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showLocalData && (
            <div className="space-y-1 mt-1 max-h-60 overflow-y-auto">
              {localSummary.map(item => (
                <div key={item.table} className="flex items-center justify-between text-[11px] py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-foreground">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground">{item.count.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground/60 w-16 text-right">
                      {item.lastSync ? formatTimeAgo(item.lastSync) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── STEP 3: UPLOAD ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Upload className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-foreground">3. Enviar al servidor</p>
                <p className="text-[11px] text-muted-foreground">
                  {pendingCount > 0
                    ? `Tienes ${pendingCount} ${pendingCount === 1 ? 'cambio' : 'cambios'} por enviar (ventas, cobros, etc.)`
                    : 'No hay cambios pendientes por enviar'
                  }
                </p>
              </div>
            </div>

            {/* Upload result */}
            {uploadResult && !uploading && (
              <div className={cn(
                "mt-2 rounded-xl p-3 flex items-center gap-2",
                uploadResult.failed === 0 ? "bg-emerald-500/10" : "bg-amber-500/10"
              )}>
                {uploadResult.failed === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <p className="text-xs">
                  <strong>{uploadResult.success}</strong> enviados correctamente
                  {uploadResult.failed > 0 && (
                    <span className="text-amber-600 dark:text-amber-400"> · {uploadResult.failed} fallaron (se reintentarán)</span>
                  )}
                </p>
              </div>
            )}

            {/* Dead letters warning */}
            {deadLetters > 0 && (
              <div className="mt-2 bg-destructive/10 rounded-xl p-3">
                <p className="text-xs text-destructive font-medium mb-1">
                  ⚠️ {deadLetters} registros no se pudieron enviar después de varios intentos
                </p>
                <button
                  onClick={handleRetryDeadLetters}
                  className="text-[11px] text-destructive underline"
                >
                  Reintentar todos
                </button>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || !isOnline || pendingCount === 0}
              className={cn(
                "w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]",
                !isOnline || pendingCount === 0
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : uploading
                    ? "bg-emerald-600/50 text-white"
                    : "bg-emerald-600 text-white"
              )}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {uploading ? 'Enviando...' : pendingCount === 0 ? 'Todo enviado ✓' : `Enviar ${pendingCount} cambios`}
            </button>
          </div>
        </div>

        {/* ── DATA SAVER ── */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Modo ahorro de datos</p>
                <p className="text-[11px] text-muted-foreground">
                  Minimiza el consumo de internet móvil
                </p>
              </div>
            </div>
            <Switch checked={dataSaver} onCheckedChange={setDataSaver} />
          </div>
          {dataSaver && (
            <div className="mt-3 bg-amber-500/5 rounded-xl p-3 text-[11px] text-muted-foreground space-y-1">
              <p>• Sincronización automática cada 2 minutos (en vez de 30s)</p>
              <p>• Usa datos locales sin consultar el servidor</p>
              <p>• Imágenes se comprimen antes de subir</p>
              <p>• Descarga y envío solo cuando tú lo decides</p>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="bg-muted/30 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-primary" />
            Recomendaciones
          </p>
          <ul className="text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
            <li>📥 <strong>Antes de salir:</strong> Descarga todo con WiFi de la oficina</li>
            <li>📱 <strong>En ruta:</strong> Trabaja sin internet, todo se guarda aquí</li>
            <li>📤 <strong>Al regresar:</strong> Conéctate al WiFi y envía todos los cambios</li>
            <li>🔒 Los datos persisten aunque cierres la app o reinicies el celular</li>
            <li>⚡ Activa "Ahorro de datos" para gastar menos internet</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
