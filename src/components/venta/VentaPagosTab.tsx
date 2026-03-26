import { useState } from 'react';
import { Plus, Banknote, Check } from 'lucide-react';
import { cn , todayLocal } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

interface Pago {
  id: string;
  monto_aplicado: number;
  created_at: string;
  cobros?: { fecha?: string; metodo_pago?: string; referencia?: string } | null;
}

interface VentaPagosTabProps {
  pagos: Pago[];
  totalPagado: number;
  saldoPendiente: number;
  isMobile: boolean;
  onAddPago: (monto: number, metodo: string, referencia: string) => Promise<void>;
}

export function VentaPagosTab({ pagos, totalPagado, saldoPendiente, isMobile, onAddPago }: VentaPagosTabProps) {
  const { fmt } = useCurrency();
  const [showForm, setShowForm] = useState(false);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const m = Number(monto);
    if (!m || m <= 0) return;
    setSaving(true);
    try {
      await onAddPago(m, metodo, referencia);
      setMonto('');
      setReferencia('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 space-y-3">
      {/* Summary */}
      <div className={cn("bg-card border border-border rounded-md p-3 space-y-1 text-[13px]", isMobile ? "w-full" : "w-72")}>
        <div className="flex justify-between"><span className="text-muted-foreground">Total pagado</span><span className="font-medium">{fmt(totalPagado)}</span></div>
        <div className="flex justify-between border-t border-border pt-1">
          <span className="font-medium">Saldo pendiente</span>
          <span className={cn("font-semibold", saldoPendiente > 0 ? "text-destructive" : "text-foreground")}>{fmt(saldoPendiente)}</span>
        </div>
      </div>

      {/* Mobile cards */}
      {isMobile ? (
        <div className="space-y-2">
          {pagos.map(p => (
            <div key={p.id} className="border border-border rounded-lg p-3 bg-card flex items-center justify-between">
              <div>
                <div className="text-sm font-medium capitalize">{(p.cobros as Record<string, string> | null)?.metodo_pago ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{(p.cobros as Record<string, string> | null)?.fecha ?? ''} {(p.cobros as Record<string, string> | null)?.referencia ? `· ${(p.cobros as Record<string, string> | null)?.referencia}` : ''}</div>
              </div>
              <span className="font-semibold text-sm">{fmt(Number(p.monto_aplicado))}</span>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-table-border text-left">
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Fecha</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Método</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Referencia</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right">Monto</th>
              <th className="py-2 px-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {pagos.map(p => (
              <tr key={p.id} className="border-b border-table-border">
                <td className="py-2 px-2">{(p.cobros as Record<string, string> | null)?.fecha ?? ''}</td>
                <td className="py-2 px-2 capitalize">{(p.cobros as Record<string, string> | null)?.metodo_pago ?? '—'}</td>
                <td className="py-2 px-2 text-muted-foreground">{(p.cobros as Record<string, string> | null)?.referencia || '—'}</td>
                <td className="py-2 px-2 text-right font-medium">{fmt(Number(p.monto_aplicado))}</td>
                <td></td>
              </tr>
            ))}
            {saldoPendiente > 0.01 && showForm && (
              <tr className="border-b border-table-border bg-card">
                <td className="py-1.5 px-2">
                  <input type="date" className="input-odoo text-xs w-full" defaultValue={todayLocal()} readOnly />
                </td>
                <td className="py-1.5 px-2">
                  <select className="input-odoo text-xs w-full" value={metodo} onChange={e => setMetodo(e.target.value)}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </td>
                <td className="py-1.5 px-2">
                  <input className="input-odoo text-xs w-full" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Referencia..."
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowForm(false); }} />
                </td>
                <td className="py-1.5 px-2">
                  <input type="number" className="input-odoo text-xs w-full text-right" value={monto} onChange={e => setMonto(e.target.value)}
                    min="0" step="0.01" placeholder={saldoPendiente.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowForm(false); }} />
                </td>
                <td className="py-1.5 px-2">
                  <button onClick={handleSubmit} disabled={saving} className="text-primary hover:text-primary/80" title="Guardar">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {pagos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={3} className="py-2 px-2 font-semibold text-right">Total pagado</td>
                <td className="py-2 px-2 text-right font-semibold">{fmt(totalPagado)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {/* Mobile inline form */}
      {isMobile && saldoPendiente > 0.01 && showForm && (
        <div className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Método</label>
              <select className="input-odoo text-xs w-full" value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Monto</label>
              <input type="number" className="input-odoo text-xs w-full text-right" value={monto} onChange={e => setMonto(e.target.value)}
                min="0" step="0.01" placeholder={saldoPendiente.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} autoFocus />
            </div>
          </div>
          <input className="input-odoo text-xs w-full" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Referencia..." />
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving} className="btn-odoo-primary text-xs flex-1">
              <Check className="h-3.5 w-3.5" /> Guardar pago
            </button>
            <button onClick={() => setShowForm(false)} className="btn-odoo-secondary text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {saldoPendiente > 0.01 && !showForm && (
        <button onClick={() => { setShowForm(true); setMonto(''); setReferencia(''); }} className="text-primary text-xs font-medium hover:underline flex items-center gap-1">
          <Plus className="h-3 w-3" /> Agregar pago
        </button>
      )}

      {saldoPendiente <= 0.01 && pagos.length > 0 && (
        <div className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Venta pagada en su totalidad
        </div>
      )}
    </div>
  );
}
