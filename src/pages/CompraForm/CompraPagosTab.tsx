import { todayLocal } from '@/lib/utils';
import { Plus, Save, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCurrency } from '@/hooks/useCurrency';

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

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-table-border">
            <th className="th-odoo text-left">Fecha</th><th className="th-odoo text-left">Método</th><th className="th-odoo text-left">Referencia</th><th className="th-odoo text-left">Notas</th><th className="th-odoo text-right">Monto</th><th className="th-odoo w-8"></th>
          </tr></thead>
          <tbody>
            {pagos.map(p => (
              <tr key={p.id} className="border-b border-table-border">
                <td className="py-1.5 px-3 text-xs">{p.fecha}</td><td className="py-1.5 px-3 text-xs capitalize">{p.metodo_pago}</td>
                <td className="py-1.5 px-3 text-xs text-muted-foreground">{p.referencia ?? '—'}</td><td className="py-1.5 px-3 text-xs text-muted-foreground">{p.notas ?? '—'}</td>
                <td className="py-1.5 px-3 text-right font-medium text-xs text-success">{fmt(p.monto)}</td>
                <td className="py-1.5 px-3">{form.status !== 'pagada' && <button onClick={async () => { if (!confirm('¿Eliminar este pago?')) return; await supabase.from('pago_compras').delete().eq('id', p.id); const nuevoSaldo = Math.max(0, totals.total - (totalPagado - p.monto)); await supabase.from('compras').update({ saldo_pendiente: nuevoSaldo } as any).eq('id', form.id); qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] }); toast.success('Pago eliminado'); }} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
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
      {!addingPago && form.status !== 'pagada' && form.status !== 'borrador' && saldoActual > 0 && (
        <button onClick={() => { setNewPago(() => ({ fecha: todayLocal(), metodo_pago: 'transferencia', referencia: '', notas: '', monto: saldoActual })); setAddingPago(true); }} className="btn-odoo-secondary text-xs gap-1"><Plus className="h-3.5 w-3.5" /> Agregar pago</button>
      )}
    </div>
  );
}
