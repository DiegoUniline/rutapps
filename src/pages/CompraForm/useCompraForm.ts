import { todayLocal } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProductosForSelect, useProveedores, useAlmacenes } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePinAuth } from '@/hooks/usePinAuth';
import { emptyLine, calcLineTotals, type CompraLinea } from './types';

function useCompra(id?: string) {
  return useQuery({ queryKey: ['compra', id], queryFn: async () => { const { data, error } = await supabase.from('compras').select('*, proveedores(nombre), almacenes(nombre), compra_lineas(*, productos(id, codigo, nombre, costo))').eq('id', id!).single(); if (error) throw error; return data; }, enabled: !!id });
}

function usePagosCompra(compraId?: string) {
  return useQuery({ queryKey: ['pagos-compra', compraId], queryFn: async () => { const { data, error } = await supabase.from('pago_compras').select('*').eq('compra_id', compraId!).order('fecha', { ascending: false }); if (error) throw error; return data ?? []; }, enabled: !!compraId });
}

export function useCompraForm() {
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

  const [form, setForm] = useState<Record<string, any>>({ status: 'borrador', condicion_pago: 'contado', fecha: todayLocal(), dias_credito: 0, subtotal: 0, iva_total: 0, total: 0, saldo_pendiente: 0 });
  const [lineas, setLineas] = useState<Partial<CompraLinea>[]>([emptyLine()]);
  const [dirty, setDirty] = useState(false);
  const [showPago, setShowPago] = useState(false);
  const [addingPago, setAddingPago] = useState(false);
  const [newPago, setNewPago] = useState({ fecha: todayLocal(), metodo_pago: 'transferencia', referencia: '', notas: '', monto: 0 });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: string; title: string; description: string } | null>(null);
  const { requestPin, PinDialog } = usePinAuth();

  useEffect(() => {
    if (existingCompra && productosList) {
      const { compra_lineas, ...rest } = existingCompra as any;
      setForm(rest);
      if (compra_lineas?.length) {
        const enrichedLines = compra_lineas.map((cl: any) => {
          const prod = productosList.find((p: any) => p.id === cl.producto_id) as any;
          return { ...cl, _tiene_iva: prod?.tiene_iva ?? false, _iva_pct: prod?.iva_pct ?? 16, _tiene_ieps: prod?.tiene_ieps ?? false, _ieps_pct: prod?.ieps_pct ?? 0, _ieps_tipo: prod?.ieps_tipo ?? 'porcentaje', _unidad_compra: prod?.unidades_compra?.abreviatura ?? prod?.unidades_venta?.abreviatura ?? 'pz', _factor_conversion: prod?.factor_conversion ?? 1, _piezas_total: (cl.cantidad ?? 1) * (prod?.factor_conversion ?? 1) };
        });
        setLineas(enrichedLines);
      }
    }
  }, [existingCompra, productosList]);

  const totals = useMemo(() => {
    const subtotal = lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0);
    const total = lineas.reduce((s, l) => s + (l.total ?? 0), 0);
    return { subtotal, iva_total: total - subtotal, total };
  }, [lineas]);

  const updateField = (key: string, val: any) => {
    setForm(f => {
      const updated = { ...f, [key]: val };
      if (key === 'condicion_pago' && val === 'credito' && f.proveedor_id && proveedoresList) {
        const prov = proveedoresList.find((p: any) => p.id === f.proveedor_id) as any;
        if (prov?.dias_credito) updated.dias_credito = prov.dias_credito;
      }
      if (key === 'proveedor_id' && val && f.condicion_pago === 'credito' && proveedoresList) {
        const prov = proveedoresList.find((p: any) => p.id === val) as any;
        if (prov?.dias_credito) updated.dias_credito = prov.dias_credito;
      }
      return updated;
    });
    setDirty(true);
  };

  const updateLinea = (idx: number, key: string, val: any) => {
    setLineas(prev => {
      const next = [...prev];
      const line = { ...next[idx], [key]: val };
      if (key === 'producto_id' && productosList) {
        const p = productosList.find((x: any) => x.id === val) as any;
        if (p) { line.precio_unitario = p.costo ?? 0; line.productos = { id: p.id, codigo: p.codigo, nombre: p.nombre, costo: p.costo ?? 0 }; line._tiene_iva = p.tiene_iva ?? false; line._iva_pct = p.iva_pct ?? 16; line._tiene_ieps = p.tiene_ieps ?? false; line._ieps_pct = p.ieps_pct ?? 0; line._ieps_tipo = p.ieps_tipo ?? 'porcentaje'; line._unidad_compra = p.unidades_compra?.abreviatura ?? p.unidades_venta?.abreviatura ?? 'pz'; line._factor_conversion = p.factor_conversion ?? 1; }
      }
      calcLineTotals(line);
      next[idx] = line;
      return next;
    });
    setDirty(true);
  };

  const addLine = () => { setLineas(prev => [...prev, emptyLine()]); setDirty(true); };
  const removeLine = (idx: number) => { setLineas(prev => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const handleSave = async () => {
    if (!empresa?.id) return;
    if (!form.almacen_id) { toast.error('Selecciona un almacén destino'); return; }
    try {
      const compraData = { empresa_id: empresa.id, proveedor_id: form.proveedor_id || null, almacen_id: form.almacen_id || null, fecha: form.fecha, condicion_pago: form.condicion_pago, dias_credito: form.condicion_pago === 'credito' ? (form.dias_credito ?? 0) : 0, status: form.status, subtotal: totals.subtotal, iva_total: totals.iva_total, total: totals.total, saldo_pendiente: form.condicion_pago === 'credito' ? totals.total - (pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0) : 0, notas: form.notas || null, notas_pago: form.notas_pago || null };
      let compraId = form.id;
      if (isNew) { const { data, error } = await supabase.from('compras').insert(compraData as any).select().single(); if (error) throw error; compraId = (data as any).id; } else { const { empresa_id, ...updateData } = compraData; const { error } = await supabase.from('compras').update(updateData as any).eq('id', compraId); if (error) throw error; await supabase.from('compra_lineas').delete().eq('compra_id', compraId); }
      const validLines = lineas.filter(l => l.producto_id);
      if (validLines.length) { const rows = validLines.map(l => ({ compra_id: compraId, producto_id: l.producto_id!, cantidad: l.cantidad ?? 1, precio_unitario: l.precio_unitario ?? 0, subtotal: l.subtotal ?? 0, total: l.total ?? 0 })); const { error } = await supabase.from('compra_lineas').insert(rows as any); if (error) throw error; }
      toast.success('Compra guardada'); qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['compra', compraId] }); setDirty(false);
      if (isNew) navigate(`/almacen/compras/${compraId}`, { replace: true });
    } catch (err: any) { toast.error(err.message || 'Error al guardar'); }
  };

  const handleDelete = async () => {
    if (!form.id || !confirm('¿Eliminar esta compra?')) return;
    try { await supabase.from('compra_lineas').delete().eq('compra_id', form.id); const { error } = await supabase.from('compras').delete().eq('id', form.id); if (error) throw error; toast.success('Compra eliminada'); qc.invalidateQueries({ queryKey: ['compras'] }); navigate('/almacen/compras'); } catch (err: any) { toast.error(err.message); }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (isNew || form.status === 'cancelada' || newStatus === 'cancelada') return;
    const order = ['borrador', 'confirmada', 'recibida', 'pagada'];
    const curIdx = order.indexOf(form.status); const newIdx = order.indexOf(newStatus);
    if (newIdx <= curIdx || newIdx > curIdx + 1) return;
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'confirmada' && form.condicion_pago === 'credito') updates.saldo_pendiente = totals.total - (pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0);
      const { error } = await supabase.from('compras').update(updates).eq('id', form.id); if (error) throw error;
      if (newStatus === 'recibida') {
        const validLines = lineas.filter(l => l.producto_id);
        const almacenId = form.almacen_id;
        for (const l of validLines) {
          const factor = Number(l._factor_conversion) || 1;
          const piezas = (Number(l.cantidad) || 0) * factor;

          // Atomic stock addition via DB function (prevents race conditions)
          const { error: rpcErr } = await supabase.rpc('recibir_linea_compra', {
            p_producto_id: l.producto_id!,
            p_piezas: piezas,
            p_almacen_id: almacenId || null,
            p_empresa_id: empresa!.id,
            p_compra_id: form.id,
            p_folio: form.folio ?? form.id.slice(0, 8),
            p_user_id: user?.id,
          });
          if (rpcErr) throw new Error(rpcErr.message);
        }
        qc.invalidateQueries({ queryKey: ['inventario'] }); qc.invalidateQueries({ queryKey: ['productos'] }); qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      }
      setForm(f => ({ ...f, ...updates })); toast.success(`Compra ${newStatus}`); qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['compra', form.id] });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCancel = async () => {
    if (!form.id) return;
    try {
      if (['recibida', 'pagada'].includes(form.status)) {
        const validLines = lineas.filter(l => l.producto_id); const today = todayLocal();
        const prodResults = await Promise.all(validLines.map(l => supabase.from('productos').select('id, cantidad').eq('id', l.producto_id!).single()));
        const updates: Array<Promise<void>> = [];
        for (let i = 0; i < validLines.length; i++) { const l = validLines[i]; const factor = Number(l._factor_conversion) || 1; const piezas = (Number(l.cantidad) || 0) * factor; const currentQty = Number(prodResults[i].data?.cantidad ?? 0); updates.push((async () => { await supabase.from('productos').update({ cantidad: Math.max(0, currentQty - piezas) } as any).eq('id', l.producto_id!); })()); updates.push((async () => { await supabase.from('movimientos_inventario').insert({ empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id!, cantidad: piezas, almacen_origen_id: form.almacen_id, referencia_tipo: 'compra', referencia_id: form.id, user_id: user?.id, fecha: today, notas: `Cancelación compra ${form.folio ?? form.id.slice(0, 8)}` } as any); })()); }
        await Promise.all(updates);
      }
      await Promise.all([supabase.from('pago_compras').delete().eq('compra_id', form.id), supabase.from('compras').update({ status: 'cancelada', saldo_pendiente: 0 } as any).eq('id', form.id)]);
      setForm(f => ({ ...f, status: 'cancelada', saldo_pendiente: 0 })); toast.success('Compra cancelada');
      await Promise.all([qc.refetchQueries({ queryKey: ['compra', form.id] }), qc.refetchQueries({ queryKey: ['pagos-compra', form.id] }), qc.refetchQueries({ queryKey: ['compras'] }), qc.refetchQueries({ queryKey: ['inventario'] }), qc.refetchQueries({ queryKey: ['productos'] })]);
    } catch (err: any) { toast.error(err.message || 'Error al cancelar'); }
  };

  const totalPagado = pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0;
  const saldoActual = Math.max(0, totals.total - totalPagado);
  const isEditable = form.status === 'borrador';

  const handleSavePago = async () => {
    if (newPago.monto <= 0) return toast.error('Ingresa un monto válido');
    if (newPago.monto > saldoActual + 0.01) return toast.error('El monto excede el saldo pendiente');
    try {
      const montoFinal = Math.min(newPago.monto, saldoActual);
      const { error } = await supabase.from('pago_compras').insert({ empresa_id: empresa!.id, compra_id: form.id, proveedor_id: form.proveedor_id || null, monto: montoFinal, metodo_pago: newPago.metodo_pago, fecha: newPago.fecha, referencia: newPago.referencia || null, notas: newPago.notas || null, user_id: user?.id } as any); if (error) throw error;
      const nuevoSaldo = Math.max(0, saldoActual - montoFinal); const updates: any = { saldo_pendiente: nuevoSaldo }; if (nuevoSaldo === 0) updates.status = 'pagada';
      await supabase.from('compras').update(updates).eq('id', form.id); setForm(f => ({ ...f, ...updates })); setAddingPago(false);
      toast.success(nuevoSaldo === 0 ? 'Pago registrado — Compra pagada' : 'Pago registrado'); qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] }); qc.invalidateQueries({ queryKey: ['compra', form.id] }); qc.invalidateQueries({ queryKey: ['compras'] });
    } catch (err: any) { toast.error(err.message); }
  };

  return {
    id, navigate, isNew, empresa, form, setForm, lineas, setLineas, dirty, isEditable,
    totals, totalPagado, saldoActual, pagos, proveedoresList, productosList, almacenesList,
    isLoading, addingPago, setAddingPago, newPago, setNewPago, confirmDialog, setConfirmDialog,
    requestPin, PinDialog, updateField, updateLinea, addLine, removeLine,
    handleSave, handleDelete, handleStatusChange, handleCancel, handleSavePago,
  };
}
