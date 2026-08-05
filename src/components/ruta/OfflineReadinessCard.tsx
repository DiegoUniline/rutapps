import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { buildOfflineManifest, type OfflineManifest } from '@/lib/offlineReadiness';
import { cn } from '@/lib/utils';

function fmt(ts?: number | null) {
  if (!ts) return 'Nunca';
  return new Date(ts).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Tarjeta "¿Puedo trabajar sin conexión?" — muestra el manifiesto local:
 * permisos, configuración, clientes, precios, promociones, inventario y
 * documentos pendientes de envío, con la última sincronización de cada bloque.
 */
export function OfflineReadinessCard({ refreshKey }: { refreshKey?: number }) {
  const { empresa, user } = useAuth();
  const [manifest, setManifest] = useState<OfflineManifest | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!empresa?.id || !user?.id) return;
    setLoading(true);
    try {
      setManifest(await buildOfflineManifest(empresa.id, user.id));
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, user?.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!manifest) return null;

  const ready = manifest.status === 'ready';
  const incomplete = manifest.status === 'incomplete';

  return (
    <div className={cn(
      'rounded-2xl border p-4',
      incomplete ? 'bg-destructive/5 border-destructive/30'
        : ready ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-amber-500/5 border-amber-500/30',
    )}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center',
          incomplete ? 'bg-destructive/10' : ready ? 'bg-emerald-500/10' : 'bg-amber-500/10',
        )}>
          {ready
            ? <ShieldCheck className="w-5 h-5 text-emerald-600" />
            : <ShieldAlert className={cn('w-5 h-5', incomplete ? 'text-destructive' : 'text-amber-600')} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {ready ? 'Preparado para trabajar sin conexión'
              : incomplete ? 'Copia local incompleta'
                : 'Información vencida'}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {incomplete
              ? 'No inicies ventas ni cobros hasta sincronizar'
              : 'Puedes operar sin conexión con esta copia'}
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg hover:bg-muted"
          aria-label="Revisar preparación offline"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="space-y-1.5">
        {manifest.blocks.map(b => (
          <div key={b.key} className="flex items-start justify-between gap-3 text-[12px]">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                b.ok ? 'bg-emerald-500' : b.severity === 'critical' ? 'bg-destructive' : 'bg-amber-500',
              )} />
              <span className="truncate">{b.label}</span>
            </span>
            <span className={cn('text-right shrink-0', b.ok ? 'text-muted-foreground' : 'text-foreground font-medium')}>
              {b.detail}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>Paquete {manifest.packageId.slice(0, 8)}… · revisado {fmt(manifest.generatedAt)}</span>
        {manifest.pendingDocuments > 0 && (
          <span className="ml-auto text-amber-600 font-medium">{manifest.pendingDocuments} por enviar</span>
        )}
      </div>
    </div>
  );
}
