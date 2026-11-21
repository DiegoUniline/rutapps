import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { cn, todayLocal, fmtDate } from '@/lib/utils';
import { Check, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/hooks/useCurrency';

export default function ComisionesRecibosPage() {
  const { user, empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();

  const [recibosEstado, setRecibosEstado] = useState<'pendiente' | 'pagada' | 'todos'>('pendiente');

  const { data: recibos, isLoading: loadingRecibos } = useQuery({
    queryKey: ['pago_comisiones', empresa?.id, recibosEstado],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase.from('pago_comisiones')
        .select('id, fecha_corte, fecha_pago, total_comisiones, estado, vendedor_id, gasto_id, notas, vendedores:profiles!vendedor_id(nombre), created_at')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (recibosEstado !== 'todos') q = q.eq('estado', recibosEstado);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const totalBorrador = useMemo(
    () => (recibos ?? []).filter(r => r.estado === 'pendiente').reduce((s, r) => s + (r.total_comisiones ?? 0), 0),
    [recibos]
  );

  const [payingRecibo, setPayingRecibo] = useState<any | null>(null);
  const [cancelingRecibo, setCancelingRecibo] = useState<any | null>(null);
  const [payFecha, setPayFecha] = useState(todayLocal());
  const [payMetodo, setPayMetodo] = useState('efectivo');
  const [payNotas, setPayNotas] = useState('');

  const openPagar = (r: any) => { setPayingRecibo(r); setPayFecha(todayLocal()); setPayMetodo('efectivo'); setPayNotas(''); };

  const marcarPagadoMut = useMutation({
    mutationFn: async () => {
      if (!payingRecibo || !empresa?.id || !user?.id) throw new Error('Datos incompletos');
      const r = payingRecibo;
      const concepto = `Pago de comisiones - ${r.vendedores?.nombre ?? (r.vendedor_id ? 'Vendedor' : 'Varios vendedores')} (corte ${fmtDate(r.fecha_corte)})`;
      const notasGasto = [`Método: ${payMetodo}`, payNotas].filter(Boolean).join(' · ');
      const { data: gasto, error: gErr } = await supabase.from('gastos').insert({
        empresa_id: empresa.id, vendedor_id: r.vendedor_id, user_id: user.id,
        fecha: payFecha, concepto, monto: r.total_comisiones, notas: notasGasto || null,
      }).select('id').single();
      if (gErr) throw gErr;
      const { error: upRec } = await supabase.from('pago_comisiones')
        .update({ estado: 'pagada', fecha_pago: payFecha, gasto_id: gasto.id, notas: notasGasto || null })
        .eq('id', r.id);
      if (upRec) throw upRec;
      const { error: upCom } = await supabase.from('venta_comisiones').update({ pagada: true }).eq('pago_comision_id', r.id);
      if (upCom) throw upCom;
    },
    onSuccess: () => {
      toast.success('Recibo pagado y gasto registrado');
      setPayingRecibo(null);
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
      qc.invalidateQueries({ queryKey: ['gastos'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelarReciboMut = useMutation({
    mutationFn: async (reciboId: string) => {
      const { error: upCom } = await supabase.from('venta_comisiones').update({ pago_comision_id: null }).eq('pago_comision_id', reciboId);
      if (upCom) throw upCom;
      const { error: delRec } = await supabase.from('pago_comisiones').delete().eq('id', reciboId);
      if (delRec) throw delRec;
    },
    onSuccess: () => {
      toast.success('Recibo cancelado, comisiones liberadas');
      setCancelingRecibo(null);
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      qc.invalidateQueries({ queryKey: ['comisiones-por-pagar'] });
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex border border-border rounded overflow-hidden">
          {([['pendiente', 'Por pagar'], ['pagada', 'Pagados'], ['todos', 'Todos']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setRecibosEstado(key)}
              className={cn('px-2.5 py-1.5 text-xs transition-colors', recibosEstado === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}>{label}</button>
          ))}
        </div>
        <div className="ml-auto text-sm">Por pagar: <span className="font-mono font-bold text-warning">{fmt(totalBorrador)}</span></div>
      </div>

      {loadingRecibos ? <TableSkeleton /> : (recibos ?? []).length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          No hay recibos {recibosEstado === 'pendiente' ? 'por pagar' : recibosEstado === 'pagada' ? 'pagados' : ''}
        </div>
      ) : (
        <div className="-mx-3 md:-mx-4 border-t border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Generado</th>
                <th className="th-odoo text-left">Vendedor</th>
                <th className="th-odoo text-left">Corte</th>
                <th className="th-odoo text-left">Pagado</th>
                <th className="th-odoo text-right">Total</th>
                <th className="th-odoo text-center">Estado</th>
                <th className="th-odoo text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(recibos ?? []).map((r: any) => (
                <tr key={r.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                  <td className="py-1.5 px-3 text-xs">{fmtDate(r.created_at)}</td>
                  <td className="py-1.5 px-3 text-xs font-medium" title={!r.vendedor_id && r.notas ? r.notas : undefined}>{r.vendedores?.nombre ?? (r.vendedor_id ? '—' : 'Varios vendedores')}</td>
                  <td className="py-1.5 px-3 text-xs">{fmtDate(r.fecha_corte)}</td>
                  <td className="py-1.5 px-3 text-xs">{r.fecha_pago ? fmtDate(r.fecha_pago) : '—'}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-odoo-teal">{fmt(r.total_comisiones)}</td>
                  <td className="py-1.5 px-3 text-center">
                    {r.estado === 'pagada' ? (
                      <span title={r.notas || 'Pagada'} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Pagada</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning">Por pagar</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    {r.estado === 'pendiente' ? (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openPagar(r)} className="btn-odoo-primary px-2.5 py-1 text-[11px]">
                          <Check className="h-3 w-3" /> Pagar
                        </button>
                        <button onClick={() => setCancelingRecibo(r)} disabled={cancelarReciboMut.isPending} className="btn-cancelar btn-odoo-secondary px-2.5 py-1 text-[11px]">Cancelar</button>
                      </div>
                    ) : r.gasto_id ? (
                      <a href={`/finanzas/gastos`} className="text-[11px] text-primary hover:underline">Ver gasto</a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* D-040: modales estándar (chicos) */}
      {payingRecibo && (
        <Dialog open onOpenChange={(o) => { if (!o) setPayingRecibo(null); }}>
          <DialogContent className="max-w-md gap-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> Pagar recibo</DialogTitle>
              <DialogDescription className="text-xs">{payingRecibo.vendedores?.nombre ?? 'Vendedor'} · Corte {fmtDate(payingRecibo.fecha_corte)}</DialogDescription>
            </DialogHeader>
            <div className="text-2xl font-bold text-odoo-teal font-mono">{fmt(payingRecibo.total_comisiones)}</div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha de pago</label>
              <input type="date" className="input-odoo w-full" value={payFecha} onChange={e => setPayFecha(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Método</label>
              <select className="input-odoo w-full" value={payMetodo} onChange={e => setPayMetodo(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas / referencia</label>
              <textarea className="input-odoo w-full" rows={2} value={payNotas} onChange={e => setPayNotas(e.target.value)} placeholder="Folio de transferencia, etc." />
            </div>
            <div className="bg-muted/40 border border-border rounded p-2 text-xs text-muted-foreground">
              Se registrará un gasto en <span className="font-semibold">Gastos</span> a nombre de este vendedor.
            </div>
            <DialogFooter className="gap-2 sm:space-x-0">
              <button onClick={() => setPayingRecibo(null)} className="btn-cancelar btn-odoo-secondary">Cancelar</button>
              <button onClick={() => marcarPagadoMut.mutate()} disabled={marcarPagadoMut.isPending} className="btn-odoo-primary">
                <Check className="h-4 w-4" /> Confirmar pago
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {cancelingRecibo && (
        <Dialog open onOpenChange={(o) => { if (!o && !cancelarReciboMut.isPending) setCancelingRecibo(null); }}>
          <DialogContent className="max-w-md gap-3">
            <DialogHeader>
              <DialogTitle>Cancelar recibo</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-foreground">¿Cancelar este recibo y liberar las comisiones para volver a pagarlas?</div>
            <div className="bg-muted/40 border border-border rounded p-2 text-xs space-y-1">
              <div><span className="text-muted-foreground">Vendedor:</span> <span className="font-medium">{cancelingRecibo.vendedores?.nombre ?? (cancelingRecibo.vendedor_id ? 'Vendedor' : 'Varios vendedores')}</span></div>
              <div><span className="text-muted-foreground">Corte:</span> <span className="font-medium">{fmtDate(cancelingRecibo.fecha_corte)}</span></div>
              <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-bold text-odoo-teal">{fmt(cancelingRecibo.total_comisiones)}</span></div>
            </div>
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button variant="outline" onClick={() => setCancelingRecibo(null)} disabled={cancelarReciboMut.isPending}>Volver</Button>
              <Button variant="destructive" onClick={() => cancelarReciboMut.mutate(cancelingRecibo.id)} disabled={cancelarReciboMut.isPending}>
                {cancelarReciboMut.isPending ? 'Cancelando...' : 'Sí, cancelar y liberar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
