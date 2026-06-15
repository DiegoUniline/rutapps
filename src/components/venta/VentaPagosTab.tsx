import { useState } from 'react';
import { Plus, Check, X, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { cn, todayLocal, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Pago {
  id: string;
  monto_aplicado: number;
  created_at: string;
  cobro_id?: string;
  cobros?: { fecha?: string; metodo_pago?: string; referencia?: string; status?: string } | null;
}

interface VentaPagosTabProps {
  pagos: Pago[];
  totalPagado: number;
  saldoPendiente: number;
  isMobile: boolean;
  onAddPago: (monto: number, metodo: string, referencia: string) => Promise<void>;
  onCancelPago?: (cobroId: string) => Promise<void>;
  onReactivarPago?: (cobroId: string) => Promise<void>;
  onDeletePago?: (aplicacionId: string, cobroId: string) => Promise<void>;
  onUpdatePago?: (aplicacionId: string, cobroId: string, nuevoMonto: number) => Promise<void>;
}

export function VentaPagosTab({ pagos, totalPagado, saldoPendiente, isMobile, onAddPago, onCancelPago, onReactivarPago, onDeletePago, onUpdatePago }: VentaPagosTabProps) {
  const { fmt } = useCurrency();
  const [showForm, setShowForm] = useState(false);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');

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

  const startEdit = (p: Pago) => {
    setEditingId(p.id);
    setEditMonto(String(p.monto_aplicado));
  };

  const saveEdit = async (p: Pago) => {
    const m = Number(editMonto);
    if (!m || m <= 0 || !p.cobro_id || !onUpdatePago) { setEditingId(null); return; }
    await onUpdatePago(p.id, p.cobro_id, m);
    setEditingId(null);
  };

  const confirmDelete = async (p: Pago) => {
    if (!p.cobro_id || !onDeletePago) return;
    if (!window.confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
    await onDeletePago(p.id, p.cobro_id);
  };

  const confirmCancel = async (p: Pago) => {
    if (!p.cobro_id || !onCancelPago) return;
    if (!window.confirm('¿Cancelar este pago? El saldo de la venta se recalculará.')) return;
    await onCancelPago(p.cobro_id);
  };

  const PagoActions = ({ p }: { p: Pago }) => {
    const cancelado = p.cobros?.status === 'cancelado';
    return (
      <div className="flex items-center gap-1.5 justify-end">
        {!cancelado && editingId !== p.id && onUpdatePago && (
          <button onClick={() => startEdit(p)} className="text-muted-foreground hover:text-primary p-1" title="Editar monto">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {editingId === p.id && (
          <>
            <button onClick={() => saveEdit(p)} className="text-primary p-1" title="Guardar"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditingId(null)} className="text-muted-foreground p-1" title="Cancelar"><X className="h-3.5 w-3.5" /></button>
          </>
        )}
        {!cancelado && editingId !== p.id && onCancelPago && (
          <button onClick={() => confirmCancel(p)} className="text-muted-foreground hover:text-warning p-1" title="Cancelar pago">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {cancelado && onReactivarPago && p.cobro_id && (
          <button onClick={() => onReactivarPago(p.cobro_id!)} className="text-muted-foreground hover:text-primary p-1" title="Reactivar pago">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        {onDeletePago && (
          <button onClick={() => confirmDelete(p)} className="text-muted-foreground hover:text-destructive p-1" title="Eliminar pago">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className={cn('bg-card border border-border rounded-md p-3 space-y-1 text-[13px]', isMobile ? 'w-full' : 'w-72')}>
        <div className="flex justify-between"><span className="text-muted-foreground">Total pagado</span><span className="font-medium">{fmt(totalPagado)}</span></div>
        <div className="flex justify-between border-t border-border pt-1">
          <span className="font-medium">{saldoPendiente < -0.01 ? 'Saldo a favor' : 'Saldo pendiente'}</span>
          <span className={cn('font-semibold', saldoPendiente > 0.01 ? 'text-destructive' : saldoPendiente < -0.01 ? 'text-primary' : 'text-foreground')}>
            {fmt(Math.abs(saldoPendiente))}
          </span>
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {pagos.map(p => {
            const cancelado = p.cobros?.status === 'cancelado';
            return (
              <div key={p.id} className={cn('border border-border rounded-lg p-3 bg-card', cancelado && 'opacity-50')}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize flex items-center gap-2">
                      {p.cobros?.metodo_pago ?? '—'}
                      {cancelado && <span className="text-[10px] uppercase text-destructive">Cancelado</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(p.cobros?.fecha ?? '')} {p.cobros?.referencia ? `· ${p.cobros.referencia}` : ''}</div>
                  </div>
                  {editingId === p.id ? (
                    <input type="number" className="input-odoo text-xs w-24 text-right" value={editMonto} onChange={e => setEditMonto(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditingId(null); }} />
                  ) : (
                    <span className="font-semibold text-sm">{fmt(Number(p.monto_aplicado))}</span>
                  )}
                </div>
                <div className="mt-1.5"><PagoActions p={p} /></div>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-table-border text-left">
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Fecha</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Método</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Referencia</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right">Monto</th>
              <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right w-32">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map(p => {
              const cancelado = p.cobros?.status === 'cancelado';
              return (
                <tr key={p.id} className={cn('border-b border-table-border', cancelado && 'opacity-50')}>
                  <td className="py-2 px-2">{fmtDate(p.cobros?.fecha ?? '')}</td>
                  <td className="py-2 px-2 capitalize">
                    {p.cobros?.metodo_pago ?? '—'}
                    {cancelado && <span className="ml-2 text-[10px] uppercase text-destructive">Cancelado</span>}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">{p.cobros?.referencia || '—'}</td>
                  <td className="py-2 px-2 text-right font-medium">
                    {editingId === p.id ? (
                      <input type="number" className="input-odoo text-xs w-24 text-right" value={editMonto} onChange={e => setEditMonto(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditingId(null); }} />
                    ) : fmt(Number(p.monto_aplicado))}
                  </td>
                  <td className="py-2 px-2"><PagoActions p={p} /></td>
                </tr>
              );
            })}
            {saldoPendiente > 0.01 && showForm && (
              <tr className="border-b border-table-border bg-card">
                <td className="py-1.5 px-2"><input type="date" className="input-odoo text-xs w-full" defaultValue={todayLocal()} readOnly /></td>
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
                    min="0" step="0.01" placeholder={saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowForm(false); }} />
                </td>
                <td className="py-1.5 px-2 text-right">
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
                min="0" step="0.01" placeholder={saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} autoFocus />
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

      {Math.abs(saldoPendiente) <= 0.01 && pagos.length > 0 && (
        <div className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Venta pagada en su totalidad
        </div>
      )}

      {saldoPendiente < -0.01 && (
        <div className="text-sm font-medium flex items-center gap-2 text-primary">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Saldo a favor del cliente: {fmt(Math.abs(saldoPendiente))}
        </div>
      )}
    </div>
  );
}
