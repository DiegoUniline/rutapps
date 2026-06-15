import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Calendar, XCircle, AlertTriangle, Package, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ModalSelect from '@/components/ModalSelect';
import { fmtDate, todayLocal } from '@/lib/utils';

export type BulkAction = 'reasignar' | 'reprogramar' | 'cancelar';

interface Props {
  action: BulkAction;
  entregaIds: string[];
  onClose: () => void;
  onDone: () => void;
}

interface PreviewEntrega {
  id: string;
  folio: string | null;
  status: string;
  fecha: string;
  cliente_nombre: string | null;
  vendedor_actual_nombre: string | null;
  vendedor_actual_almacen_nombre: string | null;
  unidades_total: number;
  requiere_movimiento: boolean;
  bloqueada: boolean;
}

interface Preview {
  target_vendedor_id?: string | null;
  target_vendedor_nombre?: string | null;
  target_almacen_id?: string | null;
  entregas: PreviewEntrega[];
  totales: {
    total: number;
    con_movimiento: number;
    sin_movimiento: number;
    bloqueadas: number;
    unidades_a_mover: number;
  };
}

export default function BulkEntregasActionsDialog({ action, entregaIds, onClose, onDone }: Props) {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [targetVendedor, setTargetVendedor] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState(todayLocal());
  const [motivo, setMotivo] = useState('');

  // Vendedores activos
  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-activos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, almacen_id, almacenes:almacen_id(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('estado', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  // Preview en vivo
  const { data: preview, isLoading: loadingPreview, refetch } = useQuery<Preview>({
    queryKey: ['entregas-bulk-preview', entregaIds, action === 'reasignar' ? targetVendedor : null],
    enabled: entregaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_entregas_bulk_preview', {
        p_entrega_ids: entregaIds,
        p_target_vendedor_id: action === 'reasignar' && targetVendedor ? targetVendedor : null,
      });
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => { refetch(); }, [targetVendedor, refetch]);

  const exec = useMutation({
    mutationFn: async () => {
      if (action === 'reasignar') {
        if (!targetVendedor) throw new Error('Selecciona un vendedor destino');
        const { data, error } = await supabase.rpc('reasignar_entregas_bulk', {
          p_entrega_ids: entregaIds,
          p_target_vendedor_id: targetVendedor,
          p_user_id: user?.id ?? null,
        });
        if (error) throw error;
        return data as any;
      }
      if (action === 'reprogramar') {
        if (!nuevaFecha) throw new Error('Selecciona una fecha');
        const { data, error } = await supabase.rpc('reprogramar_entregas_bulk', {
          p_entrega_ids: entregaIds,
          p_nueva_fecha: nuevaFecha,
        });
        if (error) throw error;
        return data as any;
      }
      // cancelar
      const { data, error } = await supabase.rpc('cancelar_entregas_bulk', {
        p_entrega_ids: entregaIds,
        p_motivo: motivo || null,
        p_user_id: user?.id ?? null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      if (action === 'reasignar') {
        toast.success(
          `${res.reasignadas} reasignadas` +
          (res.con_movimiento_stock > 0 ? ` · ${res.con_movimiento_stock} con movimiento de stock` : '') +
          (res.omitidas > 0 ? ` · ${res.omitidas} omitidas` : '')
        );
      } else if (action === 'reprogramar') {
        toast.success(`${res.reprogramadas} reprogramadas` + (res.omitidas > 0 ? ` · ${res.omitidas} omitidas` : ''));
      } else {
        toast.success(
          `${res.canceladas} canceladas` +
          (res.con_devolucion_stock > 0 ? ` · ${res.con_devolucion_stock} con devolución de stock` : '') +
          (res.omitidas > 0 ? ` · ${res.omitidas} omitidas` : '')
        );
      }
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const titleMap = {
    reasignar: { icon: <ArrowRightLeft className="h-5 w-5 text-primary" />, label: 'Reasignar entregas a otro vendedor' },
    reprogramar: { icon: <Calendar className="h-5 w-5 text-primary" />, label: 'Reprogramar fecha de entregas' },
    cancelar: { icon: <XCircle className="h-5 w-5 text-destructive" />, label: 'Cancelar entregas' },
  };

  const totales = preview?.totales;
  const requiereVendedor = action === 'reasignar';
  const canExec =
    !exec.isPending &&
    (action !== 'reasignar' || !!targetVendedor) &&
    (action !== 'reprogramar' || !!nuevaFecha) &&
    (preview?.totales.total ?? 0) > 0 &&
    (preview?.totales.bloqueadas ?? 0) < (preview?.totales.total ?? 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{titleMap[action].icon} {titleMap[action].label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Inputs por acción */}
          {action === 'reasignar' && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Vendedor destino *</label>
              <ModalSelect
                options={(vendedores ?? []).map((v: any) => ({
                  value: v.id,
                  label: v.nombre + (v.almacenes?.nombre ? ` · ${v.almacenes.nombre}` : ' · sin almacén'),
                }))}
                value={targetVendedor}
                onChange={setTargetVendedor}
                placeholder="Seleccionar vendedor..."
              />
            </div>
          )}

          {action === 'reprogramar' && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Nueva fecha de entrega *</label>
              <Input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} />
            </div>
          )}

          {action === 'cancelar' && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Motivo (opcional)</label>
              <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Cliente cerrado, ya no requiere..." />
            </div>
          )}

          {/* Preview / "qué pasará" */}
          {loadingPreview && (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando impacto…
            </div>
          )}

          {preview && totales && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Total" value={totales.total} />
                <Stat label={action === 'cancelar' ? 'Devuelven stock' : 'Mueven stock'} value={totales.con_movimiento} tone="amber" />
                <Stat label="Sin movimiento" value={totales.sin_movimiento} tone="muted" />
                <Stat label="Bloqueadas" value={totales.bloqueadas} tone={totales.bloqueadas > 0 ? 'destructive' : 'muted'} />
              </div>

              {/* Aviso de impacto */}
              {action === 'reasignar' && totales.con_movimiento > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">Se moverá inventario automáticamente:</p>
                      <p>Aproximadamente <strong>{totales.unidades_a_mover}</strong> unidades pasarán del almacén de cada vendedor actual al almacén de <strong>{preview.target_vendedor_nombre || '—'}</strong>{preview.target_almacen_id ? '' : ' (¡este vendedor no tiene almacén asignado!)'}.</p>
                      <p className="mt-1">Las entregas en estado <em>borrador/surtido/asignado</em> solo cambian de responsable, sin tocar inventario.</p>
                    </div>
                  </div>
                </div>
              )}

              {action === 'cancelar' && totales.con_movimiento > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <Package className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">Se devolverá inventario automáticamente:</p>
                      <p>Aproximadamente <strong>{totales.unidades_a_mover}</strong> unidades regresarán del almacén del vendedor al almacén origen original de cada línea.</p>
                    </div>
                  </div>
                </div>
              )}

              {totales.bloqueadas > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p><strong>{totales.bloqueadas}</strong> entrega(s) están entregadas o canceladas y serán omitidas.</p>
                  </div>
                </div>
              )}

              {/* Lista detallada */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-accent/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide grid grid-cols-12 gap-2">
                  <div className="col-span-2">Folio</div>
                  <div className="col-span-3">Cliente</div>
                  <div className="col-span-3">Vendedor actual</div>
                  <div className="col-span-2 text-right">Unidades</div>
                  <div className="col-span-2 text-center">Acción</div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {preview.entregas.map(e => (
                    <div key={e.id} className="px-3 py-1.5 text-xs border-t border-border grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 font-mono font-bold">{e.folio || '—'}</div>
                      <div className="col-span-3 truncate">{e.cliente_nombre || '—'}</div>
                      <div className="col-span-3 truncate text-muted-foreground">
                        {e.vendedor_actual_nombre || '—'}
                        {e.vendedor_actual_almacen_nombre && <span className="text-[10px] block">{e.vendedor_actual_almacen_nombre}</span>}
                      </div>
                      <div className="col-span-2 text-right tabular-nums">{e.unidades_total}</div>
                      <div className="col-span-2 text-center">
                        {e.bloqueada ? (
                          <Badge variant="destructive" className="text-[10px]">Omitir ({e.status})</Badge>
                        ) : e.requiere_movimiento ? (
                          <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500/90">{action === 'cancelar' ? 'Devolver' : 'Mover'} stock</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Sin stock</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exec.isPending}>Cerrar</Button>
          <Button
            onClick={() => exec.mutate()}
            disabled={!canExec}
            variant={action === 'cancelar' ? 'destructive' : 'default'}
            className="gap-1.5"
          >
            {exec.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {action === 'reasignar' && (exec.isPending ? 'Reasignando…' : 'Confirmar reasignación')}
            {action === 'reprogramar' && (exec.isPending ? 'Reprogramando…' : `Reprogramar al ${fmtDate(nuevaFecha)}`)}
            {action === 'cancelar' && (exec.isPending ? 'Cancelando…' : 'Cancelar entregas')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'amber' | 'destructive' | 'muted' }) {
  const styles = {
    default: 'bg-primary/10 text-primary border-primary/20',
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-900',
    destructive: 'bg-destructive/10 text-destructive border-destructive/30',
    muted: 'bg-muted text-muted-foreground border-border',
  }[tone];
  return (
    <div className={`border rounded-lg px-3 py-2 ${styles}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
