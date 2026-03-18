import { useState, useEffect, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus, X, Ban, CheckCircle2, PackageCheck, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useProductosForSelect, useProveedores, useAlmacenes } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

const COMPRA_STEPS = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'pagada', label: 'Pagada' },
  { key: 'cancelada', label: 'Cancelada' },
];

interface CompraLinea {
  id?: string;
  compra_id?: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  total: number;
  // Extended fields (not persisted to compra_lineas, used for UI)
  _tiene_iva: boolean;
  _iva_pct: number;
  _tiene_ieps: boolean;
  _ieps_pct: number;
  _ieps_tipo: string;
  _unidad_compra: string;
  _factor_conversion: number;
  _piezas_total: number;
  // joined
  productos?: { id: string; codigo: string; nombre: string; costo: number };
}

function emptyLine(): Partial<CompraLinea> {
  return { cantidad: 1, precio_unitario: 0, subtotal: 0, total: 0, _tiene_iva: false, _iva_pct: 16, _tiene_ieps: false, _ieps_pct: 0, _ieps_tipo: 'porcentaje', _unidad_compra: '', _factor_conversion: 1, _piezas_total: 1 };
}

function calcLineTotals(line: Partial<CompraLinea>) {
  const cant = Number(line.cantidad) || 0;
  const precio = Number(line.precio_unitario) || 0;
  const base = cant * precio;

  let iepsAmount = 0;
  if (line._tiene_ieps) {
    if (line._ieps_tipo === 'cuota') {
      iepsAmount = cant * (Number(line._ieps_pct) || 0);
    } else {
      iepsAmount = base * ((Number(line._ieps_pct) || 0) / 100);
    }
  }

  const baseConIeps = base + iepsAmount;
  const ivaAmount = line._tiene_iva ? baseConIeps * ((Number(line._iva_pct) || 0) / 100) : 0;

  line.subtotal = base;
  line.total = base + iepsAmount + ivaAmount;
  line._piezas_total = cant * (Number(line._factor_conversion) || 1);

  return line;
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
  const [addingPago, setAddingPago] = useState(false);
  const [newPago, setNewPago] = useState({ fecha: new Date().toISOString().slice(0, 10), metodo_pago: 'transferencia', referencia: '', notas: '', monto: 0 });

  // Load existing
  useEffect(() => {
    if (existingCompra && productosList) {
      const { compra_lineas, proveedores, almacenes, ...rest } = existingCompra as any;
      setForm(rest);
      if (compra_lineas && compra_lineas.length > 0) {
        // Enrich lines with product tax/unit info
        const enrichedLines = compra_lineas.map((cl: any) => {
          const prod = productosList.find((p: any) => p.id === cl.producto_id);
          return {
            ...cl,
            _tiene_iva: prod?.tiene_iva ?? false,
            _iva_pct: prod?.iva_pct ?? 16,
            _tiene_ieps: prod?.tiene_ieps ?? false,
            _ieps_pct: prod?.ieps_pct ?? 0,
            _ieps_tipo: prod?.ieps_tipo ?? 'porcentaje',
            _unidad_compra: (prod as any)?.unidades_compra?.abreviatura ?? (prod as any)?.unidades_venta?.abreviatura ?? 'pz',
            _factor_conversion: prod?.factor_conversion ?? 1,
            _piezas_total: (cl.cantidad ?? 1) * (prod?.factor_conversion ?? 1),
          };
        });
        setLineas(enrichedLines);
      }
    }
  }, [existingCompra, productosList]);

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
        const p = productosList.find((x: any) => x.id === val) as any;
        if (p) {
          line.precio_unitario = p.costo ?? 0;
          line.productos = { id: p.id, codigo: p.codigo, nombre: p.nombre, costo: p.costo ?? 0 };
          line._tiene_iva = p.tiene_iva ?? false;
          line._iva_pct = p.iva_pct ?? 16;
          line._tiene_ieps = p.tiene_ieps ?? false;
          line._ieps_pct = p.ieps_pct ?? 0;
          line._ieps_tipo = p.ieps_tipo ?? 'porcentaje';
          line._unidad_compra = p.unidades_compra?.abreviatura ?? p.unidades_venta?.abreviatura ?? 'pz';
          line._factor_conversion = p.factor_conversion ?? 1;
        }
      }

      calcLineTotals(line);
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
    if (isNew || form.status === 'cancelada' || newStatus === 'cancelada') return;
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

      // When marking as "recibida", add stock to almacén and log movements
      if (newStatus === 'recibida') {
        const almacenId = form.almacen_id;
        const today = new Date().toISOString().slice(0, 10);
        const validLines = lineas.filter(l => l.producto_id);

        for (const l of validLines) {
          const factor = Number(l._factor_conversion) || 1;
          const piezas = (Number(l.cantidad) || 0) * factor;

          // Get current stock
          const { data: prod } = await supabase
            .from('productos')
            .select('cantidad')
            .eq('id', l.producto_id!)
            .single();

          const currentQty = Number(prod?.cantidad ?? 0);
          await supabase
            .from('productos')
            .update({ cantidad: currentQty + piezas } as any)
            .eq('id', l.producto_id!);

          // Log inventory movement
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id,
            tipo: 'entrada',
            producto_id: l.producto_id!,
            cantidad: piezas,
            almacen_destino_id: almacenId,
            referencia_tipo: 'compra',
            referencia_id: form.id,
            user_id: user?.id,
            fecha: today,
            notas: `Compra ${form.folio ?? form.id.slice(0, 8)} recibida`,
          } as any);
        }

        qc.invalidateQueries({ queryKey: ['inventario'] });
        qc.invalidateQueries({ queryKey: ['productos'] });
      }

      setForm(f => ({ ...f, ...updates }));
      toast.success(`Compra ${newStatus}`);
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compra', form.id] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Cancel purchase: reverse stock, delete payments, set status to cancelada
  const handleCancel = async () => {
    if (!form.id || !confirm('¿Cancelar esta compra? Se revertirá el stock y se eliminarán los pagos.')) return;
    try {
      // If stock was already added (recibida or pagada), reverse it
      if (['recibida', 'pagada'].includes(form.status)) {
        const validLines = lineas.filter(l => l.producto_id);
        const today = new Date().toISOString().slice(0, 10);

        for (const l of validLines) {
          const factor = Number(l._factor_conversion) || 1;
          const piezas = (Number(l.cantidad) || 0) * factor;

          const { data: prod } = await supabase
            .from('productos')
            .select('cantidad')
            .eq('id', l.producto_id!)
            .single();

          const currentQty = Number(prod?.cantidad ?? 0);
          await supabase
            .from('productos')
            .update({ cantidad: Math.max(0, currentQty - piezas) } as any)
            .eq('id', l.producto_id!);

          // Log reversal movement
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id,
            tipo: 'salida',
            producto_id: l.producto_id!,
            cantidad: piezas,
            almacen_origen_id: form.almacen_id,
            referencia_tipo: 'compra',
            referencia_id: form.id,
            user_id: user?.id,
            fecha: today,
            notas: `Cancelación compra ${form.folio ?? form.id.slice(0, 8)}`,
          } as any);
        }
      }

      // Delete all payments
      await supabase.from('pago_compras').delete().eq('compra_id', form.id);

      // Update status
      await supabase.from('compras').update({ status: 'cancelada', saldo_pendiente: 0 } as any).eq('id', form.id);

      setForm(f => ({ ...f, status: 'cancelada', saldo_pendiente: 0 }));
      toast.success('Compra cancelada — stock revertido y pagos eliminados');
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compra', form.id] });
      qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al cancelar');
    }
  };

  if (!isNew && isLoading) {
    return <div className="p-6"><TableSkeleton rows={6} cols={4} /></div>;
  }

  const isEditable = form.status === 'borrador';
  const totalPagado = pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0;
  const saldoActual = Math.max(0, totals.total - totalPagado);

  const handleSavePago = async () => {
    if (newPago.monto <= 0) return toast.error('Ingresa un monto válido');
    if (newPago.monto > saldoActual + 0.01) return toast.error('El monto excede el saldo pendiente');
    try {
      const montoFinal = Math.min(newPago.monto, saldoActual);
      const { error } = await supabase.from('pago_compras').insert({
        empresa_id: empresa!.id,
        compra_id: form.id,
        proveedor_id: form.proveedor_id || null,
        monto: montoFinal,
        metodo_pago: newPago.metodo_pago,
        fecha: newPago.fecha,
        referencia: newPago.referencia || null,
        notas: newPago.notas || null,
        user_id: user?.id,
      } as any);
      if (error) throw error;

      const nuevoSaldo = Math.max(0, saldoActual - montoFinal);
      const updates: any = { saldo_pendiente: nuevoSaldo };
      if (nuevoSaldo === 0) updates.status = 'pagada';
      await supabase.from('compras').update(updates).eq('id', form.id);

      setForm(f => ({ ...f, ...updates }));
      setAddingPago(false);
      toast.success(nuevoSaldo === 0 ? 'Pago registrado — Compra pagada' : 'Pago registrado');
      qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] });
      qc.invalidateQueries({ queryKey: ['compra', form.id] });
      qc.invalidateQueries({ queryKey: ['compras'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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
            {!isNew && (
              <p className="text-xs text-muted-foreground">
                Pagado: $ {fmt(totalPagado)} / Saldo: $ {fmt(Math.max(0, totals.total - totalPagado))}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {form.status !== 'cancelada' && !isNew && form.status !== 'borrador' && (
            <button onClick={handleCancel} className="btn-odoo-icon text-destructive" title="Cancelar compra">
              <Ban className="h-4 w-4" />
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
                        <th className="th-odoo text-left w-8">#</th>
                        <th className="th-odoo text-left" style={{ width: '45%' }}>Producto</th>
                        <th className="th-odoo text-center w-14">Ud.</th>
                        <th className="th-odoo text-right w-14">Cant.</th>
                        <th className="th-odoo text-center w-14">Factor</th>
                        <th className="th-odoo text-right w-14">Piezas</th>
                        <th className="th-odoo text-right w-20">Costo</th>
                        <th className="th-odoo text-center w-14">IVA</th>
                        <th className="th-odoo text-center w-14">IEPS</th>
                        <th className="th-odoo text-right w-20">Total</th>
                        {isEditable && <th className="th-odoo w-8"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((line, idx) => {
                        const iepsLabel = line._tiene_ieps
                          ? (line._ieps_tipo === 'cuota' ? `$${line._ieps_pct}` : `${line._ieps_pct}%`)
                          : '';
                        return (
                          <tr key={idx} className="border-b border-table-border" data-row={idx}>
                            <td className="py-1.5 px-2 text-muted-foreground text-xs">{idx + 1}</td>
                            <td className="py-1.5 px-2">
                              {isEditable ? (
                                <SearchableSelect
                                  options={(productosList as any[])?.filter(p => {
                                    const usedIds = lineas.filter((_, j) => j !== idx).map(l => l.producto_id).filter(Boolean);
                                    return !usedIds.includes(p.id);
                                  }).map(p => ({
                                    value: p.id,
                                    label: `[${p.codigo}] ${p.nombre}`,
                                  })) ?? []}
                                  value={line.producto_id ?? ''}
                                  onChange={val => updateLinea(idx, 'producto_id', val)}
                                  placeholder="Buscar producto..."
                                  onClose={() => {
                                    setTimeout(() => {
                                      const row = document.querySelector<HTMLTableRowElement>(`tr[data-row="${idx}"]`);
                                      const inputs = row?.querySelectorAll<HTMLInputElement>('input[type="number"]');
                                      inputs?.[0]?.focus();
                                      inputs?.[0]?.select();
                                    }, 30);
                                  }}
                                />
                              ) : (
                                <span className="text-xs truncate block">{line.productos ? `[${line.productos.codigo}] ${line.productos.nombre}` : '—'}</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center text-xs text-muted-foreground uppercase">
                              {line._unidad_compra || 'pz'}
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                className="input-odoo w-full text-right text-xs"
                                value={line.cantidad ?? 1}
                                onChange={e => updateLinea(idx, 'cantidad', Number(e.target.value))}
                                disabled={!isEditable}
                                min={0}
                                onKeyDown={e => {
                                  if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault();
                                    const row = document.querySelector<HTMLTableRowElement>(`tr[data-row="${idx}"]`);
                                    const inputs = row?.querySelectorAll<HTMLInputElement>('input[type="number"]');
                                    inputs?.[1]?.focus();
                                    inputs?.[1]?.select();
                                  }
                                }}
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <input
                                type="number"
                                className="w-full text-center text-xs bg-transparent border border-border rounded px-1 py-0.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                                value={line._factor_conversion ?? 1}
                                onChange={e => {
                                  const val = Math.max(1, Number(e.target.value) || 1);
                                  updateLinea(idx, '_factor_conversion', val);
                                }}
                                disabled={!isEditable}
                                min={1}
                                onKeyDown={e => {
                                  if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault();
                                    const row = document.querySelector<HTMLTableRowElement>(`tr[data-row="${idx}"]`);
                                    const inputs = row?.querySelectorAll<HTMLInputElement>('input[type="number"]');
                                    inputs?.[2]?.focus();
                                    inputs?.[2]?.select();
                                  }
                                }}
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs font-medium text-foreground tabular-nums">
                              {((line.cantidad ?? 1) * (line._factor_conversion ?? 1)).toLocaleString('es-MX')}
                            </td>
                            {/* Costo unit */}
                            <td className="py-1.5 px-3">
                              <input
                                type="number"
                                className="input-odoo w-full text-right text-xs"
                                value={line.precio_unitario ?? 0}
                                onChange={e => updateLinea(idx, 'precio_unitario', Number(e.target.value))}
                                disabled={!isEditable}
                                step="0.01"
                                onKeyDown={e => {
                                  if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (idx === lineas.length - 1 && isEditable) {
                                      addLine();
                                      setTimeout(() => {
                                        const newRow = document.querySelector<HTMLTableRowElement>(`tr[data-row="${idx + 1}"]`);
                                        const trigger = newRow?.querySelector<HTMLDivElement>('.inline-edit-input');
                                        trigger?.click();
                                      }, 50);
                                    } else {
                                      const nextRow = document.querySelector<HTMLTableRowElement>(`tr[data-row="${idx + 1}"]`);
                                      const trigger = nextRow?.querySelector<HTMLDivElement>('.inline-edit-input');
                                      trigger?.click();
                                    }
                                  }
                                }}
                              />
                            </td>
                            {/* IVA toggle */}
                            <td className="py-1.5 px-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <Switch
                                  checked={line._tiene_iva ?? false}
                                  onCheckedChange={v => updateLinea(idx, '_tiene_iva', v)}
                                  disabled={!isEditable}
                                  className="scale-75"
                                />
                                {line._tiene_iva && (
                                  <span className="text-[10px] text-muted-foreground">{line._iva_pct}%</span>
                                )}
                              </div>
                            </td>
                            {/* IEPS toggle */}
                            <td className="py-1.5 px-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <Switch
                                  checked={line._tiene_ieps ?? false}
                                  onCheckedChange={v => updateLinea(idx, '_tiene_ieps', v)}
                                  disabled={!isEditable}
                                  className="scale-75"
                                />
                                {line._tiene_ieps && (
                                  <span className="text-[10px] text-muted-foreground">{iepsLabel}</span>
                                )}
                              </div>
                            </td>
                            {/* Total */}
                            <td className="py-1.5 px-3 text-right font-medium text-xs">
                              $ {fmt(line.total ?? 0)}
                            </td>
                            {isEditable && (
                              <td className="py-1.5 px-3">
                                <button onClick={() => removeLine(idx)} className="text-destructive hover:text-destructive/80">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
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
          ...(!isNew ? [{
            key: 'pagos',
            label: `Pagos (${pagos?.length ?? 0})`,
            content: (
              <div className="space-y-3">
                <div className="bg-card border border-border rounded overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-table-border">
                        <th className="th-odoo text-left">Fecha</th>
                        <th className="th-odoo text-left">Método</th>
                        <th className="th-odoo text-left">Referencia</th>
                        <th className="th-odoo text-left">Notas</th>
                        <th className="th-odoo text-right">Monto</th>
                        <th className="th-odoo w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pagos ?? []).map(p => (
                        <tr key={p.id} className="border-b border-table-border">
                          <td className="py-1.5 px-3 text-xs">{p.fecha}</td>
                          <td className="py-1.5 px-3 text-xs capitalize">{p.metodo_pago}</td>
                          <td className="py-1.5 px-3 text-xs text-muted-foreground">{p.referencia ?? '—'}</td>
                          <td className="py-1.5 px-3 text-xs text-muted-foreground">{p.notas ?? '—'}</td>
                          <td className="py-1.5 px-3 text-right font-medium text-xs text-success">$ {fmt(p.monto)}</td>
                          <td className="py-1.5 px-3">
                            {form.status !== 'pagada' && (
                              <button
                                onClick={async () => {
                                  if (!confirm('¿Eliminar este pago?')) return;
                                  await supabase.from('pago_compras').delete().eq('id', p.id);
                                  const nuevoSaldo = Math.max(0, totals.total - (totalPagado - p.monto));
                                  await supabase.from('compras').update({ saldo_pendiente: nuevoSaldo } as any).eq('id', form.id);
                                  setForm(f => ({ ...f, saldo_pendiente: nuevoSaldo }));
                                  qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] });
                                  toast.success('Pago eliminado');
                                }}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* Inline new payment row */}
                      {addingPago && (
                        <tr className="border-b border-table-border bg-primary/5">
                          <td className="py-1.5 px-2">
                            <input type="date" className="input-odoo w-full text-xs" value={newPago.fecha}
                              onChange={e => setNewPago(p => ({ ...p, fecha: e.target.value }))} />
                          </td>
                          <td className="py-1.5 px-2">
                            <select className="input-odoo w-full text-xs" value={newPago.metodo_pago}
                              onChange={e => setNewPago(p => ({ ...p, metodo_pago: e.target.value }))}>
                              <option value="transferencia">Transferencia</option>
                              <option value="efectivo">Efectivo</option>
                              <option value="cheque">Cheque</option>
                              <option value="tarjeta">Tarjeta</option>
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="text" className="input-odoo w-full text-xs" placeholder="Referencia"
                              value={newPago.referencia} onChange={e => setNewPago(p => ({ ...p, referencia: e.target.value }))} />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="text" className="input-odoo w-full text-xs" placeholder="Notas"
                              value={newPago.notas} onChange={e => setNewPago(p => ({ ...p, notas: e.target.value }))} />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" className="input-odoo w-full text-xs text-right font-bold"
                              value={newPago.monto} onChange={e => setNewPago(p => ({ ...p, monto: Number(e.target.value) }))}
                              max={saldoActual} step="0.01"
                              onKeyDown={e => { if (e.key === 'Enter') handleSavePago(); if (e.key === 'Escape') setAddingPago(false); }}
                            />
                          </td>
                          <td className="py-1.5 px-2 flex gap-1">
                            <button onClick={handleSavePago} className="text-success hover:text-success/80">
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setAddingPago(false)} className="text-muted-foreground hover:text-foreground">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )}
                      {/* Totals row */}
                      <tr className="bg-secondary/30">
                        <td colSpan={4} className="py-1.5 px-3 text-xs font-bold">Total pagado</td>
                        <td className="py-1.5 px-3 text-right font-bold text-xs text-success">$ {fmt(totalPagado)}</td>
                        <td></td>
                      </tr>
                      <tr className="bg-secondary/30">
                        <td colSpan={4} className="py-1.5 px-3 text-xs font-bold text-destructive">Saldo pendiente</td>
                        <td className="py-1.5 px-3 text-right font-bold text-xs text-destructive">$ {fmt(saldoActual)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {!addingPago && form.status !== 'pagada' && form.status !== 'borrador' && saldoActual > 0 && (
                  <button
                    onClick={() => {
                      setNewPago({ fecha: new Date().toISOString().slice(0, 10), metodo_pago: 'transferencia', referencia: '', notas: '', monto: saldoActual });
                      setAddingPago(true);
                    }}
                    className="btn-odoo-secondary text-xs gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar pago
                  </button>
                )}
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
            <span className="text-muted-foreground">Impuestos</span>
            <span className="font-medium">$ {fmt(totals.iva_total)}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold">$ {fmt(totals.total)}</span>
          </div>
          {!isNew && (
            <>
              <div className="border-t border-border pt-2 flex justify-between text-sm">
                <span className="text-success">Pagado</span>
                <span className="font-medium text-success">$ {fmt(totalPagado)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-destructive">Saldo</span>
                <span className="font-bold text-destructive">$ {fmt(saldoActual)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
