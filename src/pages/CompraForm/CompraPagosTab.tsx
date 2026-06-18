import { todayLocal, fmtDate } from '@/lib/utils';
import { Plus, Save, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCurrency } from '@/hooks/useCurrency';
import { confirmDialog } from '@/lib/confirm';

interface Props {
  pagos: any[];
  form: Record<string, any>;
  totals: { total: number };
  totalPagado: number;
  saldoActual: number;
  addingPago: boolean;
  setAddingPago: (v: boolean) => void;
  newPago: { fecha: string; metodo_pago: string; referencia: string; notas: string; monto: number };
  setNewPago: (fn: (p: any) => any) => void;
  handleSavePago: () => void;
}

export function CompraPagosTab({ pagos, form, totals, totalPagado, saldoActual, addingPago, setAddingPago, newPago, setNewPago, handleSavePago }: Props) {
  const qc = useQueryClient();
  const { fmt } = useCurrency();

  const deletePago = async (p: any) => {
    if (!await confirmDialog('¿Eliminar este pago?')) return;
    await supabase.from('pago_compras').delete().eq('id', p.id);
    const nuevoSaldo = Math.max(0, totals.total - (totalPagado - p.monto));
    await supabase.from('compras').update({ saldo_pendiente: nuevoSaldo } as any).eq('id', form.id);
    qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] });
    toast.success('Pago eliminado');
  };

  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-table-border">
            <th className="th-odoo text-left">Fecha</th><th className="th-odoo text-left">Método</th><th className="th-odoo text-left">Referencia</th><th className="th-odoo text-left">Notas</th><th className="th-odoo text-right">Monto</th><th className="th-odoo w-8"></th>
          </tr></thead>
          <tbody>
            {pagos.map(p => (
              <tr key={p.id} className="border-b border-table-border">
                <td className="py-1.5 px-3 text-xs">{fmtDate(p.fecha)}</td><td className="py-1.5 px-3 text-xs capitalize">{p.metodo_pago}</td>
                <td className="py-1.5 px-3 text-xs text-muted-foreground">{p.referencia ?? '—'}</td><td className="py-1.5 px-3 text-xs text-muted-foreground">{p.notas ?? '—'}</td>
                <td className="py-1.5 px-3 text-right font-medium text-xs text-success">{fmt(p.monto)}</td>
                <td className="py-1.5 px-3">{form.status !== 'pagada' && <button onClick={() => deletePago(p)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}
            {addingPago && (
              <tr className="border-b border-table-border bg-primary/5">
                <td className="py-1.5 px-2"><input type="date" className="input-odoo w-full text-xs" value={newPago.fecha} onChange={e => setNewPago(p => ({ ...p, fecha: e.target.value }))} /></td>
                <td className="py-1.5 px-2"><select className="input-odoo w-full text-xs" value={newPago.metodo_pago} onChange={e => setNewPago(p => ({ ...p, metodo_pago: e.target.value }))}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option></select></td>
                <td className="py-1.5 px-2"><input type="text" className="input-odoo w-full text-xs" placeholder="Referencia" value={newPago.referencia} onChange={e => setNewPago(p => ({ ...p, referencia: e.target.value }))} /></td>
                <td className="py-1.5 px-2"><input type="text" className="input-odoo w-full text-xs" placeholder="Notas" value={newPago.notas} onChange={e => setNewPago(p => ({ ...p, notas: e.target.value }))} /></td>
                <td className="py-1.5 px-2"><input type="number" className="input-odoo w-full text-xs text-right font-bold" value={newPago.monto} onChange={e => setNewPago(p => ({ ...p, monto: Number(e.target.value) }))} max={saldoActual} step="0.01" onKeyDown={e => { if (e.key === 'Enter') handleSavePago(); if (e.key === 'Escape') setAddingPago(false); }} /></td>
                <td className="py-1.5 px-2 flex gap-1"><button onClick={handleSavePago} className="text-success hover:text-success/80"><Save className="h-3.5 w-3.5" /></button><button onClick={() => setAddingPago(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></td>
              </tr>
            )}
            <tr className="bg-secondary/30"><td colSpan={4} className="py-1.5 px-3 text-xs font-bold">Total pagado</td><td className="py-1.5 px-3 text-right font-bold text-xs text-success">{fmt(totalPagado)}</td><td></td></tr>
            <tr className="bg-secondary/30"><td colSpan={4} className="py-1.5 px-3 text-xs font-bold text-destructive">Saldo pendiente</td><td className="py-1.5 px-3 text-right font-bold text-xs text-destructive">{fmt(saldoActual)}</td><td></td></tr>
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {pagos.map(p => (
          <div key={p.id} className="bg-card border border-border rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{fmtDate(p.fecha)}</span>
              <span className="text-sm font-bold text-success tabular-nums">{fmt(p.monto)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs capitalize text-muted-foreground">{p.metodo_pago}{p.referencia ? ` · ${p.referencia}` : ''}</span>
              {form.status !== 'pagada' && <button onClick={() => deletePago(p)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {p.notas && <div className="text-[11px] text-muted-foreground italic">{p.notas}</div>}
          </div>
        ))}
        {addingPago && (
          <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] uppercase text-muted-foreground block">Fecha</label><input type="date" className="input-odoo w-full text-xs" value={newPago.fecha} onChange={e => setNewPago(p => ({ ...p, fecha: e.target.value }))} /></div>
              <div><label className="text-[10px] uppercase text-muted-foreground block">Método</label><select className="input-odoo w-full text-xs" value={newPago.metodo_pago} onChange={e => setNewPago(p => ({ ...p, metodo_pago: e.target.value }))}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option></select></div>
            </div>
            <div><label className="text-[10px] uppercase text-muted-foreground block">Referencia</label><input type="text" className="input-odoo w-full text-xs" placeholder="Referencia" value={newPago.referencia} onChange={e => setNewPago(p => ({ ...p, referencia: e.target.value }))} /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground block">Notas</label><input type="text" className="input-odoo w-full text-xs" placeholder="Notas" value={newPago.notas} onChange={e => setNewPago(p => ({ ...p, notas: e.target.value }))} /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground block">Monto</label><input type="number" className="input-odoo w-full text-sm text-right font-bold" value={newPago.monto} onChange={e => setNewPago(p => ({ ...p, monto: Number(e.target.value) }))} max={saldoActual} step="0.01" /></div>
            <div className="flex gap-2">
              <button onClick={handleSavePago} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-success text-white text-sm font-semibold"><Save className="h-4 w-4" /> Guardar</button>
              <button onClick={() => setAddingPago(false)} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-border text-sm"><X className="h-4 w-4" /> Cancelar</button>
            </div>
          </div>
        )}
        <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-xs font-bold"><span>Total pagado</span><span className="text-success tabular-nums">{fmt(totalPagado)}</span></div>
          <div className="flex justify-between text-xs font-bold text-destructive"><span>Saldo pendiente</span><span className="tabular-nums">{fmt(saldoActual)}</span></div>
        </div>
      </div>
      {!addingPago && form.status !== 'pagada' && form.status !== 'borrador' && saldoActual > 0 && (
        <button onClick={() => { setNewPago(() => ({ fecha: todayLocal(), metodo_pago: 'transferencia', referencia: '', notas: '', monto: saldoActual })); setAddingPago(true); }} className="btn-odoo-secondary text-xs gap-1 w-full md:w-auto justify-center"><Plus className="h-3.5 w-3.5" /> Agregar pago</button>
      )}
    </div>
  );
}
