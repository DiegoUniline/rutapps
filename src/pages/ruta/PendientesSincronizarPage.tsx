import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, AlertTriangle, Clock, CheckCircle2, Loader2, CloudOff, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { usePendingQueue } from '@/hooks/usePendingQueue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  retryQueueItem,
  discardQueueItem,
  retryAllQueueItems,
  processSyncQueue,
  type PendingQueueItem,
  type QueueItemStatus,
} from '@/lib/syncQueue';

const TABLE_LABEL: Record<string, string> = {
  ventas: 'Venta',
  venta_lineas: 'Línea de venta',
  cobros: 'Cobro',
  cobro_aplicaciones: 'Aplicación de cobro',
  entregas: 'Entrega',
  entrega_lineas: 'Línea de entrega',
  clientes: 'Cliente',
  productos: 'Producto',
  visitas: 'Visita',
  gastos: 'Gasto',
  devoluciones: 'Devolución',
  devolucion_lineas: 'Línea de devolución',
  cargas: 'Carga',
  carga_lineas: 'Línea de carga',
  descarga_ruta: 'Liquidación de ruta',
  cotizaciones: 'Cotización',
};

const OP_LABEL: Record<string, string> = {
  insert: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
};

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function getReference(item: PendingQueueItem): string {
  const d = item.data || {};
  return (
    d.folio ||
    d.numero ||
    d.codigo ||
    d.nombre ||
    d.nombre_comercial ||
    (item.keyValue ? String(item.keyValue).slice(0, 8) : '—')
  );
}

const STATUS_CONFIG: Record<QueueItemStatus, { label: string; cls: string; icon: any }> = {
  pending:  { label: 'Pendiente',  cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
  retrying: { label: 'Reintentando', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Loader2 },
  failed:   { label: 'Fallida',    cls: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

export default function PendientesSincronizarPage() {
  const navigate = useNavigate();
  const { isOnline, syncNow, isSyncing } = useNetworkStatus();
  const { items, pending, retrying, failed, total, loading, reload } = usePendingQueue();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const handleRetry = async (item: PendingQueueItem) => {
    if (!item.id) return;
    setBusyId(item.id);
    try {
      await retryQueueItem(item.id);
      if (isOnline) await processSyncQueue();
      toast.success('Operación reintentada');
      await reload();
    } catch (e: any) {
      toast.error('No se pudo reintentar', { description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (item: PendingQueueItem) => {
    if (!item.id) return;
    const label = `${OP_LABEL[item.operation] || item.operation} · ${TABLE_LABEL[item.table] || item.table}`;
    if (!confirm(`¿Descartar esta operación pendiente?\n\n${label} (${getReference(item)})\n\nNo se enviará al servidor. Esta acción no se puede deshacer.`)) return;
    setBusyId(item.id);
    try {
      await discardQueueItem(item.id);
      toast.success('Operación descartada');
      await reload();
    } catch (e: any) {
      toast.error('No se pudo descartar', { description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryAll = async () => {
    setBusyAll(true);
    try {
      const n = await retryAllQueueItems();
      if (n === 0) {
        toast.info('No hay operaciones para reintentar');
      } else {
        toast.success(`Reintentando ${n} operación${n === 1 ? '' : 'es'}`);
        if (isOnline) await syncNow();
      }
      await reload();
    } catch (e: any) {
      toast.error('Error al reintentar', { description: e?.message });
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-accent"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold">Pendientes de sincronizar</h1>
            <p className="text-[11px] text-muted-foreground">
              {total === 0 ? 'Sin operaciones en cola' : `${total} operación${total === 1 ? '' : 'es'} en cola`}
            </p>
          </div>
          {!isOnline && (
            <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              <CloudOff className="h-3 w-3" /> Sin conexión
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
            <div className="text-[10px] text-slate-600">Pendientes</div>
            <div className="text-lg font-bold text-slate-900">{pending}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-center">
            <div className="text-[10px] text-amber-700">Reintentando</div>
            <div className="text-lg font-bold text-amber-900">{retrying}</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-center">
            <div className="text-[10px] text-red-700">Fallidas</div>
            <div className="text-lg font-bold text-red-900">{failed}</div>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            onClick={handleRetryAll}
            disabled={busyAll || total === 0 || isSyncing}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold',
              total === 0 ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground active:scale-[0.98]',
            )}
          >
            {(busyAll || isSyncing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reintentar todo
          </button>
        </div>
      </header>

      {/* List */}
      <main className="px-3 py-3 pb-24">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
          </div>
        )}

        {!loading && total === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-foreground">Todo sincronizado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              No hay operaciones esperando subir al servidor.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map(item => {
              const cfg = STATUS_CONFIG[item.status];
              const Icon = cfg.icon;
              const opLabel = OP_LABEL[item.operation] || item.operation;
              const tblLabel = TABLE_LABEL[item.table] || item.table;
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border', cfg.cls)}>
                          <Icon className={cn('h-3 w-3', item.status === 'retrying' && 'animate-spin')} />
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatAgo(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {opLabel} · {tblLabel}
                      </p>
                      <p className="text-[12px] text-muted-foreground truncate">
                        Ref: <span className="font-mono">{getReference(item)}</span>
                      </p>
                      {(item.retries ?? 0) > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Intentos: {item.retries}
                          {item.lastAttemptAt ? ` · último ${formatAgo(item.lastAttemptAt)}` : ''}
                        </p>
                      )}
                      {item.lastError && (
                        <p className="text-[11px] text-red-700 mt-1 line-clamp-2 bg-red-50 rounded px-1.5 py-1 border border-red-100">
                          {item.lastError}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRetry(item)}
                      disabled={busyId === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md border border-primary text-primary text-xs font-semibold active:scale-[0.98] disabled:opacity-50"
                    >
                      {busyId === item.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />}
                      Reintentar
                    </button>
                    <button
                      onClick={() => handleDiscard(item)}
                      disabled={busyId === item.id}
                      className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-red-200 text-red-700 text-xs font-semibold active:scale-[0.98] disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Descartar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Help footer */}
        {total > 0 && (
          <div className="mt-4 rounded-lg bg-muted/40 border border-border p-3 text-[11px] text-muted-foreground flex gap-2">
            <Inbox className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Las operaciones se reintentan automáticamente al sincronizar. Marca como <b>fallida</b> tras 5 intentos
              — revisa el error y reintenta manualmente o descártala si ya no aplica.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
