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
import { confirmDialog as confirmAsync } from '@/lib/confirm';

function useCompra(id?: string) {
  return useQuery({ queryKey: ['compra', id], queryFn: async () => { const { data, error } = await supabase.from('compras').select('*, proveedores(nombre), almacenes(nombre), compra_lineas(*, productos(id, codigo, nombre, nombre_compra, costo, maneja_lote), lotes(codigo))').eq('id', id!).single(); if (error) throw error; return data; }, enabled: !!id });
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
          // Prefer factor guardado en la línea; si es legacy (NULL/0) cae al del producto
          const factorPersistido = Number(cl.factor_conversion);
          const factor = factorPersistido > 0 ? factorPersistido : (prod?.factor_conversion ?? 1);
          return { ...cl, _tiene_iva: prod?.tiene_iva ?? false, _iva_pct: prod?.iva_pct ?? 16, _tiene_ieps: prod?.tiene_ieps ?? false, _ieps_pct: prod?.ieps_pct ?? 0, _ieps_tipo: prod?.ieps_tipo ?? 'porcentaje', _unidad_compra: prod?.unidades_compra?.abreviatura ?? prod?.unidades_venta?.abreviatura ?? 'pz', _factor_conversion: factor, _piezas_total: (cl.cantidad ?? 1) * factor, _lote_codigo: cl.lotes?.codigo ?? null };
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
      // Crédito: días y fecha de vencimiento se mantienen sincronizados entre sí.
      const baseFecha = updated.fecha || todayLocal();
      const addDays = (iso: string, d: number) => {
        const dt = new Date(iso + 'T12:00:00');
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().slice(0, 10);
      };
      const diffDays = (iso: string) => {
        const a = new Date(baseFecha + 'T12:00:00').getTime();
        const b = new Date(iso + 'T12:00:00').getTime();
        return Math.max(0, Math.round((b - a) / 86400000));
      };
      if (key === 'fecha_vencimiento' && val) {
        updated.dias_credito = diffDays(val);
      } else if (['dias_credito', 'condicion_pago', 'proveedor_id', 'fecha'].includes(key)) {
        if (updated.condicion_pago === 'credito') {
          updated.fecha_vencimiento = addDays(baseFecha, Number(updated.dias_credito) || 0);
        }
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
        if (p) { const factor = p.factor_conversion ?? 1; const costoSugerido = (p.costo ?? 0) * factor; line.precio_unitario = costoSugerido; line.productos = { id: p.id, codigo: p.codigo, nombre: p.nombre, nombre_compra: p.nombre_compra ?? null, costo: p.costo ?? 0 } as any; line._tiene_iva = p.tiene_iva ?? false; line._iva_pct = p.iva_pct ?? 16; line._tiene_ieps = p.tiene_ieps ?? false; line._ieps_pct = p.ieps_pct ?? 0; line._ieps_tipo = p.ieps_tipo ?? 'porcentaje'; line._unidad_compra = p.unidades_compra?.abreviatura ?? p.unidades_venta?.abreviatura ?? 'pz'; line._factor_conversion = factor; }
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
      const totalPagado = pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0;
      const compraData = { empresa_id: empresa.id, proveedor_id: form.proveedor_id || null, almacen_id: form.almacen_id || null, fecha: form.fecha, condicion_pago: form.condicion_pago, dias_credito: form.condicion_pago === 'credito' ? (form.dias_credito ?? 0) : 0, status: form.status, subtotal: totals.subtotal, iva_total: totals.iva_total, total: totals.total, saldo_pendiente: Math.max(0, totals.total - totalPagado), notas: form.notas || null, notas_pago: form.notas_pago || null, numero_factura: form.numero_factura || null, fecha_vencimiento: form.condicion_pago === 'credito' ? (form.fecha_vencimiento || null) : null };
      let compraId = form.id;
      if (isNew) { const { data, error } = await supabase.from('compras').insert(compraData as any).select().single(); if (error) throw error; compraId = (data as any).id; } else { const { empresa_id, ...updateData } = compraData; const { error } = await supabase.from('compras').update(updateData as any).eq('id', compraId); if (error) throw error; await supabase.from('compra_lineas').delete().eq('compra_id', compraId); }
      const validLines = lineas.filter(l => l.producto_id);
      if (validLines.length) {
        const rows = validLines.map(l => {
          const factor = Number(l._factor_conversion) > 0 ? Number(l._factor_conversion) : 1;
          const cantidad = l.cantidad ?? 1;
          return { compra_id: compraId, producto_id: l.producto_id!, cantidad, precio_unitario: l.precio_unitario ?? 0, subtotal: l.subtotal ?? 0, total: l.total ?? 0, factor_conversion: factor, piezas_total: cantidad * factor, lote_id: l.lote_id ?? null };
        });
        const { error } = await supabase.from('compra_lineas').insert(rows as any); if (error) throw error;
      }
      toast.success('Compra guardada'); qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['compra', compraId] }); setDirty(false);
      if (isNew) navigate(`/almacen/compras/${compraId}`, { replace: true });
    } catch (err: any) { toast.error(err.message || 'Error al guardar'); }
  };

  const handleDelete = async () => {
    if (!form.id || !await confirmAsync('¿Eliminar esta compra?')) return;
    try { await supabase.from('compra_lineas').delete().eq('compra_id', form.id); const { error } = await supabase.from('compras').delete().eq('id', form.id); if (error) throw error; toast.success('Compra eliminada'); qc.invalidateQueries({ queryKey: ['compras'] }); navigate('/almacen/compras'); } catch (err: any) { toast.error(err.message); }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (isNew || form.status === 'cancelada' || newStatus === 'cancelada') return;
    // 'recibida' ya no se setea desde acá: lo hace el RPC al recibir mercancía
    if (newStatus === 'recibida') return;
    const order = ['borrador', 'confirmada', 'recibida', 'pagada'];
    const curIdx = order.indexOf(form.status); const newIdx = order.indexOf(newStatus);
    if (newIdx <= curIdx) return;
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'confirmada') updates.saldo_pendiente = Math.max(0, totals.total - (pagos?.reduce((s, p) => s + (p.monto ?? 0), 0) ?? 0));
      const { error } = await supabase.from('compras').update(updates).eq('id', form.id); if (error) throw error;
      setForm(f => ({ ...f, ...updates })); toast.success(`Compra ${newStatus}`); qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['compra', form.id] });
    } catch (err: any) { toast.error(err.message); }
  };

  // Recibe una línea (todo el pendiente). Si p_piezas viene null el RPC recibe exactamente lo que falta.
  const recibirLineaPendiente = async (lineaId: string, loteId?: string | null) => {
    if (!form.id || !empresa?.id) return;
    if (!form.almacen_id) { toast.error('La compra no tiene almacén destino'); return; }
    const { error } = await supabase.rpc('recibir_compra_linea_parcial' as any, {
      p_linea_id: lineaId,
      p_piezas: null,
      p_almacen_id: form.almacen_id,
      p_empresa_id: empresa.id,
      p_compra_id: form.id,
      p_folio: form.folio ?? form.id.slice(0, 8),
      p_user_id: user?.id,
      p_lote_id: loteId ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Línea recibida');
    await Promise.all([
      qc.refetchQueries({ queryKey: ['compra', form.id] }),
      qc.invalidateQueries({ queryKey: ['compras'] }),
      qc.invalidateQueries({ queryKey: ['inventario'] }),
      qc.invalidateQueries({ queryKey: ['productos'] }),
      qc.invalidateQueries({ queryKey: ['stock-almacen'] }),
    ]);
  };

  const recibirTodoPendiente = async () => {
    if (!form.id || !empresa?.id) return;
    if (!form.almacen_id) { toast.error('La compra no tiene almacén destino'); return; }
    const pendientes = lineas.filter(l => {
      if (!l.id || !l.producto_id) return false;
      const factor = Number(l._factor_conversion) || 1;
      const totalPz = (Number(l.cantidad) || 0) * factor;
      const recibido = Number(l.cantidad_recibida) || 0;
      return totalPz - recibido > 0;
    });
    if (!pendientes.length) { toast.info('No hay mercancía pendiente por recibir'); return; }
    // Los productos por lote se reciben uno por uno (para capturar el lote).
    // "Recibir todo" solo procesa los que NO manejan lote.
    // Las líneas que ya traen lote asignado se pueden recibir automáticamente.
    const conLote = pendientes.filter(l => (l as any).productos?.maneja_lote && !l.lote_id);
    const sinLote = pendientes.filter(l => !(l as any).productos?.maneja_lote || l.lote_id);
    if (!sinLote.length) {
      toast.info('Todos los pendientes manejan lote: recíbelos uno por uno con el botón "Recibir" de cada línea para asignar su lote.');
      return;
    }
    try {
      for (const l of sinLote) {
        const { error } = await supabase.rpc('recibir_compra_linea_parcial' as any, {
          p_linea_id: l.id!,
          p_piezas: null,
          p_almacen_id: form.almacen_id,
          p_empresa_id: empresa.id,
          p_compra_id: form.id,
          p_folio: form.folio ?? form.id.slice(0, 8),
          p_user_id: user?.id,
          p_lote_id: l.lote_id ?? null,
        });
        if (error) throw new Error(error.message);
      }
      toast.success(conLote.length
        ? `Recibido lo que no maneja lote. Faltan ${conLote.length} línea(s) con lote: recíbelas una por una.`
        : 'Mercancía recibida');
      await Promise.all([
        qc.refetchQueries({ queryKey: ['compra', form.id] }),
        qc.invalidateQueries({ queryKey: ['compras'] }),
        qc.invalidateQueries({ queryKey: ['inventario'] }),
        qc.invalidateQueries({ queryKey: ['productos'] }),
        qc.invalidateQueries({ queryKey: ['stock-almacen'] }),
      ]);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCancel = async () => {
    if (!form.id) return;
    try {
      // Revertir cualquier mercancía ya recibida, sin importar el status (puede haber recepción parcial en confirmada)
      if (form.status !== 'cancelada') {
        const validLines = lineas.filter(l => l.producto_id && (Number(l.cantidad_recibida) || 0) > 0); const today = todayLocal();
        const updates: Array<Promise<void>> = [];
        for (const l of validLines) {
          const piezas = Math.max(0, Number(l.cantidad_recibida) || 0);
          if (piezas <= 0) continue;

          // Deduct from stock_almacen (trigger auto-recalcs productos.cantidad)
          if (form.almacen_id) {
            updates.push((async () => {
              const { data: sa } = await supabase.from('stock_almacen')
                .select('id, cantidad')
                .eq('almacen_id', form.almacen_id)
                .eq('producto_id', l.producto_id!)
                .maybeSingle();
              if (sa) {
                const nuevoStock = (sa.cantidad ?? 0) - piezas;
                if (nuevoStock < 0) {
                  const { data: prod } = await supabase.from('productos').select('nombre, vender_sin_stock').eq('id', l.producto_id!).maybeSingle();
                  if (!prod?.vender_sin_stock) {
                    throw new Error(`Stock insuficiente para "${prod?.nombre ?? l.producto_id}". Disponible: ${sa.cantidad ?? 0}, solicitado: ${piezas}`);
                  }
                }
                await supabase.from('stock_almacen').update({
                  cantidad: nuevoStock,
                  updated_at: new Date().toISOString(),
                } as any).eq('id', sa.id);
              }
            })());
          }

          updates.push((async () => {
            await supabase.from('movimientos_inventario').insert({
              empresa_id: empresa!.id, tipo: 'salida',
              producto_id: l.producto_id!, cantidad: piezas,
              almacen_origen_id: form.almacen_id,
              referencia_tipo: 'compra', referencia_id: form.id,
              user_id: user?.id, fecha: today,
              notas: `Cancelación compra ${form.folio ?? form.id.slice(0, 8)}`
            } as any);
          })());
        }
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
      const nuevoSaldo = Math.max(0, saldoActual - montoFinal);
      // El pago NO cambia el status. Recibir y marcar pagada son acciones explícitas independientes.
      const updates: any = { saldo_pendiente: nuevoSaldo };
      await supabase.from('compras').update(updates).eq('id', form.id); setForm(f => ({ ...f, ...updates })); setAddingPago(false);
      toast.success('Pago registrado'); qc.invalidateQueries({ queryKey: ['pagos-compra', form.id] }); qc.invalidateQueries({ queryKey: ['compra', form.id] }); qc.invalidateQueries({ queryKey: ['compras'] });
    } catch (err: any) { toast.error(err.message); }
  };

  return {
    id, navigate, isNew, empresa, form, setForm, lineas, setLineas, dirty, isEditable,
    totals, totalPagado, saldoActual, pagos, proveedoresList, productosList, almacenesList,
    isLoading, addingPago, setAddingPago, newPago, setNewPago, confirmDialog, setConfirmDialog,
    requestPin, PinDialog, updateField, updateLinea, addLine, removeLine,
    handleSave, handleDelete, handleStatusChange, handleCancel, handleSavePago,
    recibirLineaPendiente, recibirTodoPendiente,
  };
}
