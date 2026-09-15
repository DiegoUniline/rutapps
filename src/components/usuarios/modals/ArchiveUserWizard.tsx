import { useEffect, useState, useCallback } from 'react';
import { X, Archive, AlertTriangle, CheckCircle2, RefreshCw, Truck, Package, FileText, ExternalLink, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProfileUser, Almacen } from '@/hooks/useUsuarios';
import { confirmDialog } from '@/lib/confirm';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';

interface Summary {
  profile_id: string;
  empresa_id: string;
  almacen_id: string | null;
  entregas_pendientes: number;
  rutas_activas: number;
  ventas_borrador_con_saldo: number;
  stock_items: number;
  stock_total: number;
  puede_archivar: boolean;
}

interface Props {
  user: ProfileUser;
  emailLabel?: string;
  activeUsers: ProfileUser[];
  almacenes: Almacen[];
  onClose: () => void;
  onArchived: () => void;
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export default function ArchiveUserWizard({ user, emailLabel, activeUsers, almacenes, onClose, onArchived }: Props) {
  const isSuperAdmin = useIsSuperAdmin();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState<string>('');
  const [reassigning, setReassigning] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [motivo, setMotivo] = useState('');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc('get_user_archive_summary', { p_profile_id: user.id }),
        12000,
        'La verificación de pendientes tardó demasiado. Intenta nuevamente.',
      );
      if (error) throw error;
      setSummary(data as any);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron verificar los pendientes del usuario');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleReassign = async () => {
    if (!targetUser) { toast.error('Selecciona un usuario destino'); return; }
    setReassigning(true);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc('reasignar_pendientes_usuario', {
          p_profile_id: user.id,
          p_target_profile_id: targetUser,
        }),
        15000,
        'La reasignación tardó demasiado. Revisa el estado antes de volver a intentarlo.',
      );
      if (error) throw error;
      const r = data as any;
      toast.success(`Reasignadas: ${r.entregas_reasignadas} entregas, ${r.ventas_reasignadas} ventas`);
      await loadSummary();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron reasignar los pendientes');
    } finally {
      setReassigning(false);
    }
  };

  const verifyArchivedAfterUncertainResult = async () => {
    try {
      const { data } = await withTimeout(
        supabase
          .from('profiles')
          .select('estado, archivado_en')
          .eq('id', user.id)
          .maybeSingle(),
        5000,
        'No fue posible confirmar el estado final.',
      );
      return data?.estado === 'archivado' || !!data?.archivado_en;
    } catch {
      return false;
    }
  };

  const handleArchive = async (force = false) => {
    if (!force && !summary?.puede_archivar) {
      toast.error('Aún hay pendientes que resolver');
      return;
    }

    const name = user.nombre || emailLabel || 'este usuario';
    const msg = force
      ? `⚠ FORZAR archivado de ${name}.\n\nQuedan pendientes sin resolver. El usuario perderá el acceso y dejará de considerarse activo/facturable, pero los movimientos históricos y pendientes permanecerán registrados. ¿Continuar?`
      : `¿Archivar a ${name}?\n\nPerderá el acceso al sistema y dejará de estar disponible para nuevas asignaciones. Su historial se conservará y dejará de contarse como usuario activo para el siguiente ciclo de facturación. No se genera un reembolso automático.`;

    if (!await confirmDialog(msg)) return;

    setArchiving(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('user-lifecycle', {
          body: {
            action: 'archive',
            profile_id: user.id,
            motivo: motivo || null,
            force,
          },
        }),
        25000,
        'El archivado tardó demasiado. Se verificará el estado del usuario.',
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.archived) throw new Error('El servidor no confirmó el archivado del usuario');

      if (data?.session_warning) {
        toast.warning('Usuario archivado. No fue posible confirmar el cierre de todas sus sesiones; el acceso operativo queda bloqueado por estado y será reintentable.');
      }
      if (data?.billing_synced === false) {
        toast.warning('Usuario archivado. La sincronización con Stripe quedó marcada para revisión/reconciliación en Auditoría de cobros.');
      }

      toast.success(data?.already_archived ? 'El usuario ya estaba archivado.' : 'Usuario archivado correctamente');
      onArchived();
    } catch (e: any) {
      const message = e?.message || 'No se pudo archivar el usuario';
      const uncertain = message.includes('tardó demasiado');
      if (uncertain && await verifyArchivedAfterUncertainResult()) {
        toast.warning('La respuesta tardó demasiado, pero el usuario sí quedó archivado. Se actualizó la lista.');
        onArchived();
      } else {
        toast.error(message);
      }
    } finally {
      setArchiving(false);
    }
  };

  const almacenNombre = almacenes.find(a => a.id === summary?.almacen_id)?.nombre || '—';
  const candidatos = activeUsers.filter(u => u.id !== user.id && u.estado === 'activo' && !u.archivado_en);

  return (
    <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90dvh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-primary/5">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Archivar usuario</h2>
          </div>
          <button onClick={onClose} disabled={archiving} className="p-1 rounded hover:bg-accent disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-accent/30 border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Vas a archivar a</div>
            <div className="font-semibold text-foreground">{user.nombre || 'Sin nombre'}</div>
            {emailLabel && <div className="text-xs text-muted-foreground">{emailLabel}</div>}
            <div className="text-xs text-muted-foreground mt-1">Almacén asignado: <span className="text-foreground">{almacenNombre}</span></div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">Qué pasa al archivar:</p>
            <ul className="space-y-0.5 list-disc pl-4">
              <li>Pierde el acceso al sistema y se cierran sus sesiones.</li>
              <li>Deja de aparecer como opción para nuevas asignaciones.</li>
              <li>Su almacén, ventas, movimientos y demás historial se conservan con su nombre.</li>
              <li>Deja de contar como usuario activo/facturable para el siguiente ciclo; no se genera reembolso automático.</li>
              <li>La reactivación existente conserva su configuración de rol cuando corresponde.</li>
            </ul>
          </div>

          {loading && <div className="text-center text-sm text-muted-foreground py-6">Verificando pendientes…</div>}

          {summary && !loading && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Pendientes a resolver</h3>
                  <button onClick={loadSummary} disabled={archiving} className="text-[11px] text-primary flex items-center gap-1 hover:underline disabled:opacity-50">
                    <RefreshCw className="h-3 w-3" /> Actualizar
                  </button>
                </div>

                <Item icon={<Truck className="h-4 w-4" />} label="Entregas/pedidos sin completar" count={summary.entregas_pendientes} />
                <Item icon={<FileText className="h-4 w-4" />} label="Rutas activas (jornada abierta)" count={summary.rutas_activas} />
                <Item icon={<FileText className="h-4 w-4" />} label="Ventas borrador con saldo" count={summary.ventas_borrador_con_saldo} />
                <Item icon={<Package className="h-4 w-4" />} label={`Stock en almacén "${almacenNombre}"`} count={summary.stock_items} extra={summary.stock_total !== 0 ? `(${summary.stock_total} unidades)` : undefined} />
              </div>

              {(summary.entregas_pendientes > 0 || summary.ventas_borrador_con_saldo > 0) && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-foreground">Reasignar entregas y ventas pendientes</div>
                  <div className="flex gap-2">
                    <select
                      value={targetUser}
                      onChange={e => setTargetUser(e.target.value)}
                      disabled={archiving || reassigning}
                      className="flex-1 text-sm px-2 py-1.5 rounded border border-border bg-background disabled:opacity-50"
                    >
                      <option value="">Selecciona usuario destino…</option>
                      {candidatos.map(u => (
                        <option key={u.id} value={u.id}>{u.nombre || u.user_id.slice(0, 8)}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleReassign}
                      disabled={!targetUser || reassigning || archiving}
                      className="btn-odoo-primary text-xs disabled:opacity-50"
                    >
                      {reassigning ? 'Reasignando…' : 'Reasignar'}
                    </button>
                  </div>
                  {summary.rutas_activas > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      ⚠ Hay rutas abiertas. Pídele al usuario (o a un admin) que las cierre antes de continuar.
                    </p>
                  )}
                </div>
              )}

              {summary.stock_items > 0 && summary.almacen_id && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-foreground">Vaciar almacén "{almacenNombre}"</div>
                  <p className="text-[11px] text-muted-foreground">
                    El almacén tiene mercancía. Hazle un traspaso a otro almacén o un ajuste de salida antes de archivar.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href="/inventario/traspasos"
                      target="_blank"
                      rel="noopener"
                      className="text-xs px-3 py-1.5 rounded border border-border bg-background hover:bg-accent flex items-center gap-1"
                    >
                      Ir a Traspasos <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="/inventario/ajustes"
                      target="_blank"
                      rel="noopener"
                      className="text-xs px-3 py-1.5 rounded border border-border bg-background hover:bg-accent flex items-center gap-1"
                    >
                      Ir a Ajustes <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Motivo (opcional)</label>
                <input
                  type="text"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  disabled={archiving}
                  placeholder="Ej. Cambio de personal, ya no labora..."
                  className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                {summary.puede_archivar ? (
                  <span className="text-xs text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Listo para archivar
                  </span>
                ) : (
                  <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Resuelve los pendientes antes de archivar
                  </span>
                )}
                <div className="flex gap-2 flex-wrap justify-end">
                  <button onClick={onClose} disabled={archiving} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent disabled:opacity-50">Cancelar</button>
                  {isSuperAdmin && !summary.puede_archivar && (
                    <button
                      onClick={() => handleArchive(true)}
                      disabled={archiving}
                      className={cn(
                        'text-xs px-3 py-1.5 rounded border border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60 flex items-center gap-1',
                        archiving && 'opacity-50 cursor-not-allowed'
                      )}
                      title="Solo Super Admin: archiva ignorando pendientes"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {archiving ? 'Archivando…' : 'Forzar archivado (Super Admin)'}
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(false)}
                    disabled={!summary.puede_archivar || archiving}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded text-primary-foreground bg-destructive hover:bg-destructive/90',
                      (!summary.puede_archivar || archiving) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {archiving ? 'Archivando…' : 'Archivar usuario'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ icon, label, count, extra }: { icon: React.ReactNode; label: string; count: number; extra?: string }) {
  const ok = count === 0;
  return (
    <div className={cn('flex items-center justify-between px-3 py-2 rounded border', ok ? 'border-success/30 bg-success/5' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20')}>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <span className={ok ? 'text-success' : 'text-amber-600'}>{icon}</span>
        {label}
        {extra && <span className="text-[11px] text-muted-foreground">{extra}</span>}
      </div>
      <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', ok ? 'bg-success/15 text-success' : 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100')}>
        {ok ? '✓' : count}
      </span>
    </div>
  );
}
