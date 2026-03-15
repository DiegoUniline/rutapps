import { useState, useEffect, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus, X, CreditCard } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useProductosForSelect, useProveedores, useAlmacenes } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

const COMPRA_STEPS = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'pagada', label: 'Pagada' },
];

interface CompraLinea {
  id?: string;
  compra_id?: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  total: number;
  // joined
  productos?: { id: string; codigo: string; nombre: string; costo: number };
}

function emptyLine(): Partial<CompraLinea> {
  return { cantidad: 1, precio_unitario: 0, subtotal: 0, total: 0 };
}

function useCompra(id?: string) {
  return useQuery({
    queryKey: ['compra', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('*, proveedores(nombre), almacenes(nombre), compra_lineas(*, productos(id, codigo, nombre, costo))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

function usePagosCompra(compraId?: string) {
  return useQuery({
    queryKey: ['pagos-compra', compraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pago_compras')
        .select('*')
        .eq('compra_id', compraId!)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!compraId,
  });
}

export default function CompraFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nueva';
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const { data: existingCompra, isLoading } = useCompra(isNew ? undefined : id);
  const { data: pagos } = usePagosCompra(isNew ? undefined : id);

  const { data: proveedoresList } = useProveedores();
  const { data: productosList } = useProductosForSelect();
  const { data: almacenesList } = useAlmacenes();

  const [form, setForm] = useState<Record<string, any>>({
    status: 'borrador',
    condicion_pago: 'contado',
    fecha: new Date().toISOString().slice(0, 10),
    dias_credito: 0,
    subtotal: 0, iva_total: 0, total: 0, saldo_pendiente: 0,
  });
  const [lineas, setLineas] = useState<Partial<CompraLinea>[]>([emptyLine()]);
  const [dirty, setDirty] = useState(false);
  const [showPago, setShowPago] = useState(false);

  // Load existing
  useEffect(() => {
    if (existingCompra) {
      const { compra_lineas, proveedores, almacenes, ...rest } = existingCompra as any;
      setForm(rest);
      if (compra_lineas && compra_lineas.length > 0) {
        setLineas(compra_lineas);
      }
    }
  }, [existingCompra]);

  // Recalc totals
  const totals = useMemo(() => {
    const subtotal = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0);
    const total = lineas.reduce((s, l) => s + (l.total ?? 0), 0);
    const iva_total = total - subtotal;
    return { subtotal, iva_total, total };
  }, [lineas]);

  const updateField = (key: string, val: any) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  };

  const updateLinea = (idx: number, key: string, val: any) => {
    setLineas(prev => {
      const next = [...prev];
      const line = { ...next[idx], [key]: val };

      if (key === 'producto_id' && productosList) {
        const p = productosList.find(x => x.id === val);
        if (p) {
          line.precio_unitario = p.costo ?? 0;
          line.productos = { id: p.id, codigo: p.codigo, nombre: p.nombre, costo: p.costo ?? 0 };
        }
      }

      // Recalc line
      const cant = Number(line.cantidad) || 0;
      const precio = Number(line.precio_unitario) || 0;
      line.subtotal = cant * precio;
      line.total = line.subtotal; // simplified, no IVA on purchases for now

      next[idx] = line;
      return next;
    });
    setDirty(true);
  };

  const addLine = () => {
    setLineas(prev => [...prev, emptyLine()]);
    setDirty(true);
  };

  const removeLine = (idx: number) => {
    setLineas(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  // Save
  const handleSave = async () => {
    if (!empresa?.id) return;
    try {
      const compraData = {
        empresa_id: empresa.id,
        proveedor_id: form.proveedor_id || null,
        almacen_id: form.almacen_id || null,
        fecha: form.fecha,
        condicion_pago: form.condicion_pago,
        dias_credito: form.condicion_pago === 'credito' ? (form.dias_credito ?? 0) : 0,
        status: form.status,
        subtotal: totals.subtotal,
        iva_total: totals.iva_total,
        total: totals.total,
        saldo_pendiente: form.condicion_pago === 'credito' ? totals.total - (pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0) : 0,
        notas: form.notas || null,
        notas_pago: form.notas_pago || null,
      };

      let compraId = form.id;

      if (isNew) {
        const { data, error } = await supabase.from('compras').insert(compraData as any).select().single();
        if (error) throw error;
        compraId = (data as any).id;
      } else {
        const { empresa_id, ...updateData } = compraData;
        const { error } = await supabase.from('compras').update(updateData as any).eq('id', compraId);
        if (error) throw error;
        // Delete old lines and re-insert
        await supabase.from('compra_lineas').delete().eq('compra_id', compraId);
      }

      // Insert lines
      const validLines = lineas.filter(l => l.producto_id);
      if (validLines.length > 0) {
        const rows = validLines.map(l => ({
          compra_id: compraId,
          producto_id: l.producto_id!,
          cantidad: l.cantidad ?? 1,
          precio_unitario: l.precio_unitario ?? 0,
          subtotal: l.subtotal ?? 0,
          total: l.total ?? 0,
        }));
        const { error } = await supabase.from('compra_lineas').insert(rows as any);
        if (error) throw error;
      }

      toast.success('Compra guardada');
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compra', compraId] });
      setDirty(false);
      if (isNew) navigate(`/almacen/compras/${compraId}`, { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!form.id || !confirm('¿Eliminar esta compra?')) return;
    try {
      await supabase.from('compra_lineas').delete().eq('compra_id', form.id);
      const { error } = await supabase.from('compras').delete().eq('id', form.id);
      if (error) throw error;
      toast.success('Compra eliminada');
      qc.invalidateQueries({ queryKey: ['compras'] });
      navigate('/almacen/compras');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Status change
  const handleStatusChange = async (newStatus: string) => {
    if (isNew) return;
    const order = ['borrador', 'confirmada', 'recibida', 'pagada'];
    const curIdx = order.indexOf(form.status);
    const newIdx = order.indexOf(newStatus);
    if (newIdx <= curIdx || newIdx > curIdx + 1) return;

    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'confirmada' && form.condicion_pago === 'credito') {
        updates.saldo_pendiente = totals.total - (pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0);
      }
      const { error } = await supabase.from('compras').update(updates).eq('id', form.id);
      if (error) throw error;
      setForm(f => ({ ...f, ...updates }));
      toast.success(`Compra ${newStatus}`);
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compra', form.id] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!isNew && isLoading) {
    return <div className="p-6"><TableSkeleton rows={6} cols={4} /></div>;
  }

  const isEditable = form.status === 'borrador';
  const totalPagado = pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/almacen/compras')} className="btn-odoo-icon">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {isNew ? 'Nueva compra' : `Compra ${form.folio ?? ''}`}
            </h1>
            {!isNew && form.condicion_pago === 'credito' && (
              <p className="text-xs text-muted-foreground">
                Pagado: $ {fmt(totalPagado)} / Saldo: $ {fmt((form.saldo_pendiente ?? 0))}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && form.condicion_pago === 'credito' && form.status !== 'borrador' && form.status !== 'cancelada' && (
            <button onClick={() => setShowPago(true)} className="btn-odoo-secondary gap-1">
              <CreditCard className="h-3.5 w-3.5" /> Registrar pago
            </button>
          )}
          {form.status === 'borrador' && !isNew && (
            <button onClick={handleDelete} className="btn-odoo-icon text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {isEditable && (
            <button onClick={handleSave} disabled={!dirty && !isNew} className="btn-odoo-primary gap-1">
              <Save className="h-3.5 w-3.5" /> Guardar
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {!isNew && (
        <OdooStatusbar
          steps={COMPRA_STEPS}
          current={form.status}
          onStepClick={handleStatusChange}
        />
      )}

      {/* Form fields */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="label-odoo">Proveedor</label>
            {isEditable ? (
              <SearchableSelect
                options={(proveedoresList ?? []).map(p => ({ value: p.id, label: p.nombre }))}
                value={form.proveedor_id ?? ''}
                onChange={val => updateField('proveedor_id', val || null)}
                placeholder="Buscar proveedor..."
              />
            ) : (
              <div className="text-[13px] py-1.5 px-1 text-foreground">{proveedoresList?.find(p => p.id === form.proveedor_id)?.nombre || '—'}</div>
            )}
          </div>
          <div>
            <label className="label-odoo">Almacén destino</label>
            {isEditable ? (
              <SearchableSelect
                options={(almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }))}
                value={form.almacen_id ?? ''}
                onChange={val => updateField('almacen_id', val || null)}
                placeholder="Buscar almacén..."
              />
            ) : (
              <div className="text-[13px] py-1.5 px-1 text-foreground">{almacenesList?.find(a => a.id === form.almacen_id)?.nombre || '—'}</div>
            )}
          </div>
          <div>
            <label className="label-odoo">Fecha</label>
            <OdooDatePicker
              value={form.fecha ?? ''}
              onChange={val => updateField('fecha', val)}
            />
          </div>
          <div>
            <label className="label-odoo">Condición de pago</label>
            {isEditable ? (
              <SearchableSelect
                options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]}
                value={form.condicion_pago ?? 'contado'}
                onChange={val => updateField('condicion_pago', val)}
                placeholder="Seleccionar..."
              />
            ) : (
              <div className="text-[13px] py-1.5 px-1 text-foreground capitalize">{form.condicion_pago}</div>
            )}
          </div>
        </div>

        {form.condicion_pago === 'credito' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label-odoo">Días de crédito</label>
              <input
                type="number"
                className="input-odoo w-full"
                value={form.dias_credito ?? 0}
                onChange={e => updateField('dias_credito', Number(e.target.value))}
                disabled={!isEditable}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lines */}
      <OdooTabs
        tabs={[
          {
            key: 'lineas',
            label: 'Líneas de compra',
            content: (
              <div className="space-y-3">
                <div className="bg-card border border-border rounded overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-table-border">
                        <th className="th-odoo text-left w-12">#</th>
                        <th className="th-odoo text-left">Producto</th>
                        <th className="th-odoo text-right w-24">Cantidad</th>
                        <th className="th-odoo text-right w-28">Costo unit.</th>
                        <th className="th-odoo text-right w-28">Subtotal</th>
                        {isEditable && <th className="th-odoo w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((line, idx) => (
                        <tr key={idx} className="border-b border-table-border">
                          <td className="py-1.5 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="py-1.5 px-3">
                            {isEditable ? (
                              <select
                                className="input-odoo w-full text-xs"
                                value={line.producto_id ?? ''}
                                onChange={e => updateLinea(idx, 'producto_id', e.target.value)}
                              >
                                <option value="">Seleccionar producto...</option>
                                {productosList?.map(p => (
                                  <option key={p.id} value={p.id}>[{p.codigo}] {p.nombre}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs">{line.productos?.nombre ?? '—'}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              className="input-odoo w-full text-right text-xs"
                              value={line.cantidad ?? 1}
                              onChange={e => updateLinea(idx, 'cantidad', Number(e.target.value))}
                              disabled={!isEditable}
                              min={0}
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              className="input-odoo w-full text-right text-xs"
                              value={line.precio_unitario ?? 0}
                              onChange={e => updateLinea(idx, 'precio_unitario', Number(e.target.value))}
                              disabled={!isEditable}
                              step="0.01"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right font-medium text-xs">
                            $ {fmt(line.subtotal ?? 0)}
                          </td>
                          {isEditable && (
                            <td className="py-1.5 px-3">
                              <button onClick={() => removeLine(idx)} className="text-destructive hover:text-destructive/80">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {isEditable && (
                  <button onClick={addLine} className="btn-odoo-secondary text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" /> Agregar línea
                  </button>
                )}
              </div>
            ),
          },
          {
            key: 'notas',
            label: 'Notas',
            content: (
              <div className="space-y-3">
                <div>
                  <label className="label-odoo">Notas generales</label>
                  <textarea
                    className="input-odoo w-full h-20"
                    value={form.notas ?? ''}
                    onChange={e => updateField('notas', e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
                <div>
                  <label className="label-odoo">Notas de pago</label>
                  <textarea
                    className="input-odoo w-full h-20"
                    value={form.notas_pago ?? ''}
                    onChange={e => updateField('notas_pago', e.target.value)}
                  />
                </div>
              </div>
            ),
          },
          ...(pagos && pagos.length > 0 ? [{
            key: 'pagos',
            label: `Pagos (${pagos.length})`,
            content: (
              <div className="bg-card border border-border rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-table-border">
                      <th className="th-odoo text-left">Fecha</th>
                      <th className="th-odoo text-left">Método</th>
                      <th className="th-odoo text-left">Referencia</th>
                      <th className="th-odoo text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map(p => (
                      <tr key={p.id} className="border-b border-table-border">
                        <td className="py-1.5 px-3 text-xs">{p.fecha}</td>
                        <td className="py-1.5 px-3 text-xs capitalize">{p.metodo_pago}</td>
                        <td className="py-1.5 px-3 text-xs text-muted-foreground">{p.referencia ?? '—'}</td>
                        <td className="py-1.5 px-3 text-right font-medium text-xs text-success">$ {fmt(p.monto)}</td>
                      </tr>
                    ))}
                    <tr className="bg-secondary/30">
                      <td colSpan={3} className="py-1.5 px-3 text-xs font-bold">Total pagado</td>
                      <td className="py-1.5 px-3 text-right font-bold text-xs text-success">$ {fmt(totalPagado)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ),
          }] : []),
        ]}
      />

      {/* Totals */}
      <div className="flex justify-end">
        <div className="bg-card border border-border rounded-lg p-4 w-72 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">$ {fmt(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">IVA</span>
            <span className="font-medium">$ {fmt(totals.iva_total)}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold">$ {fmt(totals.total)}</span>
          </div>
          {form.condicion_pago === 'credito' && !isNew && (
            <>
              <div className="border-t border-border pt-2 flex justify-between text-sm">
                <span className="text-success">Pagado</span>
                <span className="font-medium text-success">$ {fmt(totalPagado)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-destructive">Saldo</span>
                <span className="font-bold text-destructive">$ {fmt(Math.max(0, totals.total - totalPagado))}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment dialog */}
      {!isNew && (
        <PagoCompraDialog
          open={showPago}
          onOpenChange={setShowPago}
          compraId={form.id}
          empresaId={empresa?.id ?? ''}
          proveedorId={form.proveedor_id}
          userId={user?.id ?? ''}
          saldoPendiente={Math.max(0, totals.total - totalPagado)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] });
            qc.invalidateQueries({ queryKey: ['compra', form.id] });
            qc.invalidateQueries({ queryKey: ['compras'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Payment Dialog ─────────────────────────────────────────────
function PagoCompraDialog({
  open, onOpenChange, compraId, empresaId, proveedorId, userId, saldoPendiente, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  compraId: string;
  empresaId: string;
  proveedorId?: string;
  userId: string;
  saldoPendiente: number;
  onSuccess: () => void;
}) {
  const [monto, setMonto] = useState(saldoPendiente);
  const [metodo, setMetodo] = useState('transferencia');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setMonto(saldoPendiente);
  }, [open, saldoPendiente]);

  const handleSave = async () => {
    if (monto <= 0) return toast.error('Ingresa un monto válido');
    if (monto > saldoPendiente) return toast.error('El monto excede el saldo pendiente');
    setSaving(true);
    try {
      const { error: pagoError } = await supabase.from('pago_compras').insert({
        empresa_id: empresaId,
        compra_id: compraId,
        proveedor_id: proveedorId || null,
        monto,
        metodo_pago: metodo,
        referencia: referencia || null,
        notas: notas || null,
        user_id: userId,
      } as any);
      if (pagoError) throw pagoError;

      // Update saldo
      const nuevoSaldo = Math.max(0, saldoPendiente - monto);
      const updates: any = { saldo_pendiente: nuevoSaldo };
      if (nuevoSaldo === 0) updates.status = 'pagada';
      await supabase.from('compras').update(updates).eq('id', compraId);

      toast.success('Pago registrado');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Registrar pago
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-secondary/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className="text-2xl font-bold text-destructive">$ {fmt(saldoPendiente)}</p>
          </div>

          <div>
            <label className="label-odoo">Monto a pagar</label>
            <input
              type="number"
              className="input-odoo w-full text-lg font-bold text-right"
              value={monto}
              onChange={e => setMonto(Number(e.target.value))}
              max={saldoPendiente}
              step="0.01"
            />
          </div>

          <div>
            <label className="label-odoo">Método de pago</label>
            <select className="input-odoo w-full" value={metodo} onChange={e => setMetodo(e.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </div>

          <div>
            <label className="label-odoo">Referencia</label>
            <input
              type="text"
              className="input-odoo w-full"
              placeholder="No. de referencia, cheque, etc."
              value={referencia}
              onChange={e => setReferencia(e.target.value)}
            />
          </div>

          <div>
            <label className="label-odoo">Notas</label>
            <textarea
              className="input-odoo w-full h-16"
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => onOpenChange(false)} className="btn-odoo-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-odoo-primary gap-1">
              <Save className="h-3.5 w-3.5" /> {saving ? 'Guardando...' : 'Registrar pago'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
