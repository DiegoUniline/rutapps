import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney } from '@/lib/currency';
import { ListOrdered, ArrowDown, ArrowUp, Receipt, Ban, ShoppingCart } from 'lucide-react';
import { usePinAuth } from '@/hooks/usePinAuth';
import { toast } from 'sonner';
import { useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface CobroRow {
  id: string;
  monto: number;
  metodo_pago: string;
  created_at: string;
  cliente?: { nombre: string | null } | null;
}

interface MovRow {
  id: string;
  tipo: string;
  monto: number;
  motivo: string | null;
  created_at: string;
}

interface VentaPosRow {
  id: string;
  folio: string | null;
  total: number;
  status: string;
  created_at: string;
  cliente?: { nombre: string | null } | null;
}

export function VentasTurnoModal({ open, onOpenChange }: Props) {
  const { user, empresa, profile } = useAuth();
  const { turno } = useCajaTurno();
  const { requestPin, PinDialog } = usePinAuth();
  const qc = useQueryClient();
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  const enabled = !!open && !!turno?.id;

  const cobrosQuery = useQuery({
    queryKey: ['turno-cobros', turno?.id],
    enabled,
    queryFn: async (): Promise<CobroRow[]> => {
      const { data } = await supabase
        .from('cobros')
        .select('id, monto, metodo_pago, created_at, cliente:clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('user_id', user!.id)
        .gte('created_at', turno!.abierto_at)
        .order('created_at', { ascending: false });
      return (data ?? []) as any;
    },
  });

  const movsQuery = useQuery({
    queryKey: ['turno-movs', turno?.id],
    enabled,
    queryFn: async (): Promise<MovRow[]> => {
      const { data } = await supabase
        .from('caja_movimientos')
        .select('id, tipo, monto, motivo, created_at')
        .eq('turno_id', turno!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as any;
    },
  });

  const ventasPosQuery = useQuery({
    queryKey: ['turno-ventas-pos', turno?.id],
    enabled,
    queryFn: async (): Promise<VentaPosRow[]> => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, total, status, created_at, cliente:clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('user_id', user!.id)
        .eq('origen', 'pos')
        .gte('created_at', turno!.abierto_at)
        .order('created_at', { ascending: false });
      return (data ?? []) as any;
    },
  });

  const cobros = cobrosQuery.data ?? [];
  const movs = movsQuery.data ?? [];
  const ventasPos = ventasPosQuery.data ?? [];

  const totalCobros = cobros.reduce((s, c) => s + Number(c.monto || 0), 0);
  const totalDepositos = movs.filter(m => m.tipo === 'deposito').reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalRetiros = movs.filter(m => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalGastos = movs.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto || 0), 0);

  const cancelarVenta = async (ventaId: string) => {
    setCancelandoId(ventaId);
    try {
      // Cancel sale
      const { error: vErr } = await supabase
        .from('ventas')
        .update({ status: 'cancelado' } as any)
        .eq('id', ventaId);
      if (vErr) throw vErr;

      // Cancel associated cobros if exclusive to this sale
      const { data: apps } = await supabase
        .from('cobro_aplicaciones')
        .select('cobro_id')
        .eq('venta_id', ventaId);
      if (apps && apps.length > 0) {
        const cobroIds = [...new Set(apps.map((a: any) => a.cobro_id))];
        for (const cid of cobroIds) {
          const { data: allApps } = await supabase
            .from('cobro_aplicaciones')
            .select('venta_id')
            .eq('cobro_id', cid);
          const onlyThisVenta = (allApps ?? []).every((a: any) => a.venta_id === ventaId);
          if (onlyThisVenta) {
            await supabase.from('cobros').update({ status: 'cancelado' } as any).eq('id', cid);
          }
        }
      }

      // Log historial
      try {
        await supabase.from('venta_historial').insert({
          venta_id: ventaId,
          empresa_id: empresa!.id,
          user_id: user!.id,
          user_nombre: profile?.nombre ?? user?.email ?? '',
          accion: 'cancelada',
          detalles: { origen: 'pos-turno' },
        } as any);
      } catch (e) { console.error(e); }

      toast.success('Venta cancelada');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['turno-ventas-pos', turno?.id] }),
        qc.invalidateQueries({ queryKey: ['turno-cobros', turno?.id] }),
        qc.invalidateQueries({ queryKey: ['ventas'] }),
      ]);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cancelar la venta');
    } finally {
      setCancelandoId(null);
    }
  };

  const handleCancelClick = (venta: VentaPosRow) => {
    requestPin(
      'Cancelar venta POS',
      `Ingresa tu PIN de autorización para cancelar la venta ${venta.folio || ''} por ${fmtMoney(venta.total)}.`,
      () => cancelarVenta(venta.id),
    );
  };

  if (!turno) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-primary" /> Movimientos del turno
            </DialogTitle>
          </DialogHeader>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SumCard label="Cobros" value={totalCobros} tone="primary" />
            <SumCard label="Depósitos" value={totalDepositos} tone="success" icon={<ArrowDown className="h-3.5 w-3.5" />} />
            <SumCard label="Retiros" value={totalRetiros} tone="warning" icon={<ArrowUp className="h-3.5 w-3.5" />} />
            <SumCard label="Gastos" value={totalGastos} tone="muted" icon={<Receipt className="h-3.5 w-3.5" />} />
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pt-2">
            <Section title={`Ventas POS (${ventasPos.length})`} icon={<ShoppingCart className="h-3.5 w-3.5" />}>
              {ventasPos.length === 0 ? (
                <Empty text="Sin ventas POS en este turno" />
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1.5">Hora</th>
                      <th className="text-left px-2 py-1.5">Folio</th>
                      <th className="text-left px-2 py-1.5">Cliente</th>
                      <th className="text-left px-2 py-1.5">Estado</th>
                      <th className="text-right px-2 py-1.5">Total</th>
                      <th className="text-right px-2 py-1.5 w-20">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasPos.map(v => {
                      const isCancelled = v.status === 'cancelado';
                      return (
                        <tr key={v.id} className="border-t border-border/50">
                          <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{fmtTime(v.created_at)}</td>
                          <td className="px-2 py-1.5 font-mono">{v.folio || '—'}</td>
                          <td className="px-2 py-1.5">{v.cliente?.nombre || '—'}</td>
                          <td className="px-2 py-1.5">
                            <span className={`capitalize text-[10px] font-semibold px-1.5 py-0.5 rounded ${isCancelled ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                              {v.status}
                            </span>
                          </td>
                          <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>{fmtMoney(v.total)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {!isCancelled && (
                              <button
                                onClick={() => handleCancelClick(v)}
                                disabled={cancelandoId === v.id}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                title="Cancelar venta (requiere PIN)"
                              >
                                <Ban className="h-3 w-3" />
                                {cancelandoId === v.id ? '...' : 'Cancelar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title={`Cobros recibidos (${cobros.length})`}>
              {cobros.length === 0 ? (
                <Empty text="Sin cobros en este turno" />
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1.5">Hora</th>
                      <th className="text-left px-2 py-1.5">Cliente</th>
                      <th className="text-left px-2 py-1.5">Método</th>
                      <th className="text-right px-2 py-1.5">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobros.map(c => (
                      <tr key={c.id} className="border-t border-border/50">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{fmtTime(c.created_at)}</td>
                        <td className="px-2 py-1.5">{c.cliente?.nombre || '—'}</td>
                        <td className="px-2 py-1.5 capitalize">{c.metodo_pago}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtMoney(c.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title={`Movimientos de caja (${movs.length})`}>
              {movs.length === 0 ? (
                <Empty text="Sin movimientos de caja" />
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1.5">Hora</th>
                      <th className="text-left px-2 py-1.5">Tipo</th>
                      <th className="text-left px-2 py-1.5">Motivo</th>
                      <th className="text-right px-2 py-1.5">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map(m => (
                      <tr key={m.id} className="border-t border-border/50">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{fmtTime(m.created_at)}</td>
                        <td className="px-2 py-1.5 capitalize">{m.tipo}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{m.motivo || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtMoney(m.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        </DialogContent>
      </Dialog>
      <PinDialog />
    </>
  );
}

function SumCard({ label, value, tone, icon }: { label: string; value: number; tone: 'primary' | 'success' | 'warning' | 'muted'; icon?: React.ReactNode }) {
  const cls = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    muted: 'bg-muted text-foreground border-border',
  }[tone];
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold opacity-80">{icon}{label}</div>
      <div className="text-base font-bold tabular-nums">{fmtMoney(value)}</div>
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">{icon}{title}</h4>
      <div className="border border-border rounded-lg overflow-hidden">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-xs text-muted-foreground py-4">{text}</div>;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
