import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Save, Trash2, Plus, Banknote } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { TableSkeleton } from '@/components/TableSkeleton';
import ProductSearchInput from '@/components/ProductSearchInput';
import { useVenta, useSaveVenta, useSaveVentaLinea, useDeleteVentaLinea, useDeleteVenta } from '@/hooks/useVentas';
import { useProductosForSelect, useAlmacenes, useTarifasForSelect } from '@/hooks/useData';
import { useClientes } from '@/hooks/useClientes';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Venta, VentaLinea, StatusVenta } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const VENTA_STEPS_FULL: { key: StatusVenta; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'entregado', label: 'Entregado' },
  { key: 'facturado', label: 'Facturado' },
];

const VENTA_STEPS_INMEDIATA: { key: StatusVenta; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'facturado', label: 'Facturado' },
];

function emptyVenta(): Partial<Venta> {
  return {
    tipo: 'pedido',
    status: 'borrador',
    condicion_pago: 'contado',
    fecha: new Date().toISOString().slice(0, 10),
    entrega_inmediata: false,
    subtotal: 0, descuento_total: 0, iva_total: 0, ieps_total: 0, total: 0,
  };
}

function emptyLine(): Partial<VentaLinea> & { unidad_label?: string; impuestos_label?: string } {
  return {
    cantidad: 1, precio_unitario: 0, descuento_pct: 0,
    iva_pct: 0, ieps_pct: 0, subtotal: 0, iva_monto: 0, ieps_monto: 0, total: 0,
    unidad_label: '', impuestos_label: '',
  };
}

// Editable columns: producto(0), cantidad(1), precio(2), descuento(3)
const COL_COUNT = 4;

export default function VentaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, user, empresa } = useAuth();
  const isNew = id === 'nuevo';
  const { data: existingVenta, isLoading } = useVenta(isNew ? undefined : id);
  const saveVenta = useSaveVenta();
  const saveLinea = useSaveVentaLinea();
  const deleteLinea = useDeleteVentaLinea();
  const deleteVenta = useDeleteVenta();
  const queryClient = useQueryClient();

  const { data: clientesList } = useClientes();
  const { data: productosList } = useProductosForSelect();
  const { data: tarifasList } = useTarifasForSelect();
  const { data: almacenesList } = useAlmacenes();

  const [form, setForm] = useState<Partial<Venta>>(emptyVenta());
  const [lineas, setLineas] = useState<Partial<VentaLinea>[]>([emptyLine()]);
  const [dirty, setDirty] = useState(false);

  // Payments state
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [pagoRef, setPagoRef] = useState('');
  const [pagoSaving, setPagoSaving] = useState(false);

  // Is read-only? Only borrador is editable
  const readOnly = !isNew && form.status !== 'borrador';

  // Refs for tab navigation
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  const setCellRef = useCallback((row: number, col: number, el: HTMLElement | null) => {
    const key = `${row}-${col}`;
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current.get(`${row}-${col}`);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
  }, []);

  useEffect(() => {
    if (existingVenta) {
      setForm(existingVenta);
      const existingLines = (existingVenta.venta_lineas ?? []).map((l: any) => {
        // Enrich with display labels from productosList
        const prod = productosList?.find((p: any) => p.id === l.producto_id);
        const unidadData = prod ? (prod as any).unidades_venta : null;
        const unidadLabel = unidadData?.abreviatura || unidadData?.nombre || '';
        const taxes: string[] = [];
        if (l.iva_pct > 0) taxes.push(`IVA ${l.iva_pct}%`);
        if (l.ieps_pct > 0) taxes.push(`IEPS ${l.ieps_pct}%`);
        return { ...l, unidad_label: unidadLabel, impuestos_label: taxes.join(', ') };
      });
      setLineas(readOnly ? existingLines : [...existingLines, emptyLine()]);
    } else if (isNew) {
      setForm(prev => ({ ...prev, vendedor_id: profile?.vendedor_id ?? profile?.id }));
    }
  }, [existingVenta, isNew, profile, productosList]);

  // Fetch pagos (cobro_aplicaciones) for this venta
  const { data: pagosData } = useQuery({
    queryKey: ['venta-pagos', form.id],
    enabled: !!form.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('cobro_aplicaciones')
        .select('id, monto_aplicado, created_at, cobro_id, cobros(fecha, metodo_pago, referencia)')
        .eq('venta_id', form.id!)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const totalPagado = useMemo(() => (pagosData ?? []).reduce((s: number, p: any) => s + (p.monto_aplicado ?? 0), 0), [pagosData]);
  const saldoPendiente = (form.total ?? 0) - totalPagado;

  const set = (field: string, val: any) => {
    if (readOnly) return;
    setForm(prev => ({ ...prev, [field]: val }));
    setDirty(true);
  };

  const handleProductSelect = (idx: number, productoId: string) => {
    if (readOnly) return;
    if (!productoId) {
      updateLine(idx, 'producto_id', '');
      return;
    }
    const producto = productosList?.find((p: any) => p.id === productoId);
    if (!producto) return;
    const ivaPct = producto.tiene_iva ? Number(producto.iva_pct ?? 16) : 0;
    const iepsPct = producto.tiene_ieps ? Number(producto.ieps_pct ?? 0) : 0;
    const unidadId = producto.unidad_venta_id || producto.unidad_compra_id || null;

    // Build display labels from joined data
    const unidadData = (producto as any).unidades_venta;
    const unidadLabel = unidadData?.abreviatura || unidadData?.nombre || '';

    // Build impuestos label
    const taxes: string[] = [];
    if (producto.tiene_iva) taxes.push(`IVA ${ivaPct}%`);
    if (producto.tiene_ieps) {
      if (producto.ieps_tipo === 'cuota') taxes.push(`IEPS cuota`);
      else taxes.push(`IEPS ${iepsPct}%`);
    }
    const impuestosLabel = taxes.join(', ');

    setLineas(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        producto_id: productoId,
        descripcion: producto.nombre,
        precio_unitario: Number(producto.precio_principal) || 0,
        unidad_id: unidadId,
        iva_pct: ivaPct,
        ieps_pct: iepsPct,
        unidad_label: unidadLabel,
        impuestos_label: impuestosLabel,
      } as any;
      return next;
    });
    setDirty(true);
  };

  const navigateCell = useCallback((rowIdx: number, colIdx: number, dir: 'next' | 'prev') => {
    if (dir === 'next') {
      if (colIdx < COL_COUNT - 1) {
        focusCell(rowIdx, colIdx + 1);
      } else if (rowIdx >= lineas.length - 1) {
        setLineas(prev => [...prev, emptyLine()]);
        setDirty(true);
        setTimeout(() => focusCell(rowIdx + 1, 0), 50);
      } else {
        focusCell(rowIdx + 1, 0);
      }
    } else {
      if (colIdx > 0) focusCell(rowIdx, colIdx - 1);
      else if (rowIdx > 0) focusCell(rowIdx - 1, COL_COUNT - 1);
    }
  }, [lineas.length, focusCell]);

  const handleCellKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      navigateCell(rowIdx, colIdx, e.shiftKey ? 'prev' : 'next');
    }
  };

  // Subtotal includes taxes: base + ieps + iva (MX standard: IVA applies on base+IEPS)
  const totals = useMemo(() => {
    let subtotal = 0, descuento_total = 0, iva_total = 0, ieps_total = 0;
    lineas.forEach(l => {
      const qty = Number(l.cantidad) || 0;
      const price = Number(l.precio_unitario) || 0;
      const desc = Number(l.descuento_pct) || 0;
      const lineSubtotal = qty * price;
      const discountAmt = lineSubtotal * (desc / 100);
      const base = lineSubtotal - discountAmt;
      const ieps = base * ((Number(l.ieps_pct) || 0) / 100);
      const iva = (base + ieps) * ((Number(l.iva_pct) || 0) / 100);
      subtotal += lineSubtotal;
      descuento_total += discountAmt;
      iva_total += iva;
      ieps_total += ieps;
    });
    return { subtotal, descuento_total, iva_total, ieps_total, total: subtotal - descuento_total + iva_total + ieps_total };
  }, [lineas]);

  const handleSave = async () => {
    if (readOnly) return;
    if (!form.cliente_id) { toast.error('Selecciona un cliente'); return; }
    try {
      const payload = { ...form, ...totals, vendedor_id: profile?.vendedor_id ?? profile?.id };
      const saved = await saveVenta.mutateAsync(payload as any);
      const ventaId = saved.id || form.id;
      for (const l of lineas) {
        if (!l.producto_id) continue;
        const qty = Number(l.cantidad) || 0;
        const price = Number(l.precio_unitario) || 0;
        const desc = Number(l.descuento_pct) || 0;
        const lineSubtotal = qty * price;
        const discountAmt = lineSubtotal * (desc / 100);
        const base = lineSubtotal - discountAmt;
        const ieps = base * ((Number(l.ieps_pct) || 0) / 100);
        const iva = (base + ieps) * ((Number(l.iva_pct) || 0) / 100);
        await saveLinea.mutateAsync({
          ...l, venta_id: ventaId,
          subtotal: base, iva_monto: iva, ieps_monto: ieps, total: base + iva + ieps,
        } as any);
      }
      toast.success('Venta guardada');
      if (isNew) navigate(`/ventas/${ventaId}`, { replace: true });
      setDirty(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!form.id || !confirm('¿Eliminar esta venta?')) return;
    await deleteVenta.mutateAsync(form.id);
    toast.success('Venta eliminada');
    navigate('/ventas');
  };

  const handleStatusChange = async (newStatus: StatusVenta) => {
    if (!form.id) return;
    if (newStatus === 'cancelado' && !confirm('¿Cancelar esta venta?')) return;
    setForm(prev => ({ ...prev, status: newStatus }));
    await saveVenta.mutateAsync({ id: form.id, status: newStatus } as any);
    toast.success(`Estado: ${newStatus}`);
  };

  const addLine = () => {
    if (readOnly) return;
    setLineas(prev => [...prev, emptyLine()]);
    setDirty(true);
    setTimeout(() => focusCell(lineas.length, 0), 50);
  };

  const updateLine = (idx: number, field: string, val: any) => {
    if (readOnly) return;
    setLineas(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
    setDirty(true);
  };

  const removeLine = async (idx: number) => {
    if (readOnly) return;
    const line = lineas[idx];
    if (line.id) await deleteLinea.mutateAsync(line.id);
    const newLineas = lineas.filter((_, i) => i !== idx);
    setLineas(newLineas.length === 0 ? [emptyLine()] : newLineas);
    setDirty(true);
  };

  // Add payment
  const handleAddPago = async () => {
    if (!form.id || !form.cliente_id || !user?.id || !empresa?.id) return;
    const monto = Number(pagoMonto);
    if (!monto || monto <= 0) { toast.error('Ingresa un monto válido'); return; }
    if (monto > saldoPendiente + 0.01) { toast.error('El monto excede el saldo pendiente'); return; }
    setPagoSaving(true);
    try {
      // Create cobro
      const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({
        empresa_id: empresa.id,
        cliente_id: form.cliente_id,
        monto,
        metodo_pago: pagoMetodo,
        referencia: pagoRef || null,
        user_id: user.id,
      }).select('id').single();
      if (cobroErr) throw cobroErr;

      // Apply to this venta
      const { error: appErr } = await supabase.from('cobro_aplicaciones').insert({
        cobro_id: cobro.id,
        venta_id: form.id,
        monto_aplicado: monto,
      });
      if (appErr) throw appErr;

      // Update saldo_pendiente on venta
      await supabase.from('ventas').update({ saldo_pendiente: Math.max(0, saldoPendiente - monto) }).eq('id', form.id);

      toast.success('Pago registrado');
      setPagoMonto('');
      setPagoRef('');
      setShowPagoForm(false);
      queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
      queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPagoSaving(false);
    }
  };

  if (!isNew && isLoading) {
    return <div className="p-4 min-h-full"><TableSkeleton rows={6} cols={4} /></div>;
  }

  const clienteOptions = (clientesList ?? []).map(c => ({ value: c.id, label: `${c.codigo ? c.codigo + ' · ' : ''}${c.nombre}` }));
  const tarifaOptions = (tarifasList ?? []).map(t => ({ value: t.id, label: t.nombre }));
  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const clienteNombre = clientesList?.find(c => c.id === form.cliente_id)?.nombre;

  const steps = form.entrega_inmediata ? VENTA_STEPS_INMEDIATA : VENTA_STEPS_FULL;

  return (
    <div className="min-h-full">
      {/* Header bar */}
      <div className="bg-card border-b border-border px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/ventas')} className="btn-odoo-secondary !px-2.5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate">
              {isNew ? 'Nueva venta' : (form.folio || `Venta`)}
            </h1>
            {clienteNombre && (
              <p className="text-xs text-muted-foreground truncate">{clienteNombre}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && form.status === 'borrador' && (
            <button onClick={() => handleStatusChange('confirmado')} className="btn-odoo-primary">Confirmar</button>
          )}
          {!isNew && form.status === 'confirmado' && !form.entrega_inmediata && (
            <button onClick={() => handleStatusChange('entregado')} className="btn-odoo-primary">Entregar</button>
          )}
          {!isNew && ((form.status === 'confirmado' && form.entrega_inmediata) || form.status === 'entregado') && (
            <button onClick={() => handleStatusChange('facturado')} className="btn-odoo-primary">Facturar</button>
          )}
          {!readOnly && (
            <button onClick={handleSave} disabled={saveVenta.isPending} className="btn-odoo-primary">
              <Save className="h-3.5 w-3.5" /> Guardar
            </button>
          )}
          {!isNew && form.status !== 'cancelado' && (
            <button onClick={() => handleStatusChange('cancelado')} className="btn-odoo-secondary text-destructive text-xs">Cancelar</button>
          )}
          {!isNew && form.status === 'borrador' && (
            <button onClick={handleDelete} className="btn-odoo-secondary text-destructive !px-2">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {!isNew && (
        <div className="px-5 pt-3">
          <OdooStatusbar steps={steps} current={form.status as string} onStepClick={readOnly ? undefined : (k => handleStatusChange(k as StatusVenta))} />
        </div>
      )}

      {/* Form body */}
      <div className="p-5 space-y-4 max-w-[1200px]">
        {/* Header card */}
        <div className="bg-card border border-border rounded-md p-5">
          {readOnly && (
            <div className="mb-3 text-xs text-muted-foreground bg-muted px-3 py-2 rounded flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-warning" />
              Esta venta está {form.status} y no se puede editar.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Col 1 */}
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Tipo</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{form.tipo === 'pedido' ? 'Pedido' : 'Venta directa'}</div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => set('tipo', 'pedido')}
                      className={cn("flex-1 py-1.5 text-[12px] font-medium rounded border transition-colors",
                        form.tipo === 'pedido' ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary"
                      )}
                    >Pedido</button>
                    <button
                      onClick={() => set('tipo', 'venta_directa')}
                      className={cn("flex-1 py-1.5 text-[12px] font-medium rounded border transition-colors",
                        form.tipo === 'venta_directa' ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary"
                      )}
                    >Venta directa</button>
                  </div>
                )}
              </div>
              <div>
                <label className="label-odoo">Cliente</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{clienteNombre || '—'}</div>
                ) : (
                  <select className="input-odoo" value={form.cliente_id ?? ''} onChange={e => {
                    const cId = e.target.value;
                    set('cliente_id', cId);
                    const c = clientesList?.find(cl => cl.id === cId);
                    if (c?.tarifa_id && !form.tarifa_id) set('tarifa_id', c.tarifa_id);
                  }}>
                    <option value="">Seleccionar cliente</option>
                    {clienteOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="label-odoo">Condición de pago</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground capitalize">{form.condicion_pago}</div>
                ) : (
                  <div className="flex gap-1">
                    {[
                      { value: 'contado', label: 'Contado' },
                      { value: 'credito', label: 'Crédito' },
                      { value: 'por_definir', label: 'Por definir' },
                    ].map(o => (
                      <button key={o.value}
                        onClick={() => set('condicion_pago', o.value)}
                        className={cn("flex-1 py-1.5 text-[12px] font-medium rounded border transition-colors",
                          form.condicion_pago === o.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary"
                        )}
                      >{o.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Col 2 */}
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Fecha</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha}</div>
                ) : (
                  <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />
                )}
              </div>
              <div>
                <label className="label-odoo flex items-center gap-2">
                  <span>Entrega</span>
                  {!readOnly && (
                    <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={!!form.entrega_inmediata} onChange={e => set('entrega_inmediata', e.target.checked)} className="rounded border-input h-3 w-3" />
                      Inmediata
                    </label>
                  )}
                </label>
                {form.entrega_inmediata ? (
                  <div className="text-xs text-muted-foreground py-1.5 px-2">Entrega inmediata</div>
                ) : readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha_entrega || '—'}</div>
                ) : (
                  <OdooDatePicker value={form.fecha_entrega} onChange={v => set('fecha_entrega', v)} placeholder="Fecha de entrega" />
                )}
              </div>
              <div>
                <label className="label-odoo">Folio</label>
                <div className="text-[13px] text-muted-foreground py-1.5 px-1">
                  {form.folio || (isNew ? 'Se asigna al guardar' : '—')}
                </div>
              </div>
            </div>

            {/* Col 3 */}
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Tarifa</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{tarifasList?.find(t => t.id === form.tarifa_id)?.nombre || 'Sin tarifa'}</div>
                ) : (
                  <select className="input-odoo" value={form.tarifa_id ?? ''} onChange={e => set('tarifa_id', e.target.value || null)}>
                    <option value="">Sin tarifa</option>
                    {tarifaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="label-odoo">Almacén</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{almacenesList?.find(a => a.id === form.almacen_id)?.nombre || 'Sin almacén'}</div>
                ) : (
                  <select className="input-odoo" value={form.almacen_id ?? ''} onChange={e => set('almacen_id', e.target.value || null)}>
                    <option value="">Sin almacén</option>
                    {almacenOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
              {/* Saldo info for confirmed+ sales */}
              {!isNew && form.status !== 'borrador' && (
                <div className="bg-muted rounded-md p-3 space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">${(form.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagado</span>
                    <span className="text-green-600 font-medium">${totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="font-medium">Saldo</span>
                    <span className={cn("font-semibold", saldoPendiente > 0 ? "text-destructive" : "text-green-600")}>
                      ${saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs: Lines, Pagos, Notas */}
        <div className="bg-card border border-border rounded-md">
          <OdooTabs tabs={[
            {
              key: 'lineas',
              label: 'Líneas de venta',
              content: (
                <div className="p-4 space-y-3">
                  <div>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-table-border text-left">
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8">#</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] min-w-[240px]">Producto</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-20 text-right">Cantidad</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-center hidden md:table-cell">Unidad</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Precio</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-center hidden md:table-cell">Impuestos</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-20 text-right">Desc %</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-right">Subtotal</th>
                          <th className="py-2 px-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineas.map((l, idx) => {
                          const qty = Number(l.cantidad) || 0;
                          const price = Number(l.precio_unitario) || 0;
                          const desc = Number(l.descuento_pct) || 0;
                          const base = qty * price * (1 - desc / 100);
                          const ieps = base * ((Number(l.ieps_pct) || 0) / 100);
                          const iva = (base + ieps) * ((Number(l.iva_pct) || 0) / 100);
                          const lineTotal = base + ieps + iva;
                          const prod = productosList?.find((p: any) => p.id === l.producto_id);
                          const isLast = idx === lineas.length - 1;
                          const isEmpty = !l.producto_id;
                          const lineData = l as any;
                          const unidadLabel = lineData.unidad_label || '';
                          const impuestosLabel = lineData.impuestos_label || '';
                          return (
                            <tr key={idx} className={cn(
                              "border-b border-table-border transition-colors group",
                              isEmpty ? "bg-transparent" : "hover:bg-table-hover"
                            )}>
                              <td className="py-1.5 px-2 text-muted-foreground text-xs">{isEmpty ? '' : idx + 1}</td>
                              <td className="py-1 px-2">
                                {readOnly ? (
                                  <span className="text-[12px]">{prod ? `${prod.codigo} · ${prod.nombre}` : '—'}</span>
                                ) : (
                                  <ProductSearchInput
                                    products={(productosList ?? []).map((p: any) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio_principal: p.precio_principal }))}
                                    value={l.producto_id ?? ''}
                                    displayText={prod ? `${prod.codigo} · ${prod.nombre}` : undefined}
                                    onSelect={pid => handleProductSelect(idx, pid)}
                                    onNavigate={dir => navigateCell(idx, 0, dir)}
                                    autoFocus={isLast && isEmpty}
                                    readOnly={readOnly}
                                  />
                                )}
                                {/* Mobile: show taxes below product name — toggleable */}
                                {!isEmpty && (
                                  <div className="flex flex-wrap gap-1 md:hidden mt-0.5">
                                    {Number(l.iva_pct) > 0 && (
                                      <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => {
                                          if (readOnly) return;
                                          updateLine(idx, 'iva_pct', 0);
                                        }}
                                        className="text-[10px] px-1 py-0 rounded-full bg-accent text-accent-foreground"
                                      >
                                        IVA {l.iva_pct}% ✕
                                      </button>
                                    )}
                                    {Number(l.ieps_pct) > 0 && (
                                      <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => {
                                          if (readOnly) return;
                                          updateLine(idx, 'ieps_pct', 0);
                                        }}
                                        className="text-[10px] px-1 py-0 rounded-full bg-accent text-accent-foreground"
                                      >
                                        IEPS {l.ieps_pct}% ✕
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-1 px-2">
                                {readOnly ? (
                                  <span className="text-[12px] block text-right">
                                    {l.cantidad}
                                    {/* Mobile: show unit next to quantity */}
                                    <span className="md:hidden text-muted-foreground ml-1">{unidadLabel}</span>
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1 justify-end">
                                    <input
                                      ref={el => setCellRef(idx, 1, el)}
                                      type="number"
                                      inputMode="numeric"
                                      className="inline-edit-input text-[12px] text-right !py-1 w-full"
                                      value={l.cantidad ?? ''}
                                      onChange={e => updateLine(idx, 'cantidad', e.target.value)}
                                      onKeyDown={e => handleCellKeyDown(e, idx, 1)}
                                      onFocus={e => e.target.select()}
                                      min="0" step="1"
                                    />
                                    {/* Mobile: show unit next to input */}
                                    {unidadLabel && <span className="text-[10px] text-muted-foreground shrink-0 md:hidden">{unidadLabel}</span>}
                                  </div>
                                )}
                              </td>
                              {/* Unidad column — desktop only */}
                              <td className="py-1.5 px-2 text-center text-muted-foreground text-[12px] hidden md:table-cell">
                                {isEmpty ? '' : (unidadLabel || '—')}
                              </td>
                              {/* Precio — editable inline, currency format */}
                              <td className="py-1 px-2">
                                {readOnly ? (
                                  <span className="text-[12px] block text-right">${price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                ) : isEmpty ? (
                                  <span></span>
                                ) : (
                                  <input
                                    ref={el => setCellRef(idx, 2, el)}
                                    type="number"
                                    inputMode="decimal"
                                    className="inline-edit-input text-[12px] text-right !py-1 w-full"
                                    value={l.precio_unitario ?? ''}
                                    onChange={e => updateLine(idx, 'precio_unitario', e.target.value)}
                                    onKeyDown={e => handleCellKeyDown(e, idx, 2)}
                                    onFocus={e => e.target.select()}
                                    min="0" step="0.01"
                                  />
                                )}
                              </td>
                              {/* Impuestos column — clickable to toggle */}
                              <td className="py-1.5 px-2 text-center hidden md:table-cell">
                                {isEmpty ? '' : (
                                  <div className="inline-flex flex-wrap gap-1 justify-center">
                                    {/* IVA toggle */}
                                    <button
                                      type="button"
                                      disabled={readOnly}
                                      onClick={() => {
                                        if (readOnly) return;
                                        const currentIva = Number(l.iva_pct) || 0;
                                        const prod = productosList?.find((p: any) => p.id === l.producto_id);
                                        const defaultIva = prod?.tiene_iva ? Number(prod.iva_pct ?? 16) : 16;
                                        const newIva = currentIva > 0 ? 0 : defaultIva;
                                        updateLine(idx, 'iva_pct', newIva);
                                        // Update label
                                        const newIeps = Number(l.ieps_pct) || 0;
                                        const taxes: string[] = [];
                                        if (newIva > 0) taxes.push(`IVA ${newIva}%`);
                                        if (newIeps > 0) taxes.push(`IEPS ${newIeps}%`);
                                        setLineas(prev => {
                                          const next = [...prev];
                                          (next[idx] as any).impuestos_label = taxes.join(', ');
                                          return next;
                                        });
                                      }}
                                      className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer",
                                        Number(l.iva_pct) > 0
                                          ? "bg-accent text-accent-foreground"
                                          : "bg-muted/50 text-muted-foreground line-through opacity-60"
                                      )}
                                      title={Number(l.iva_pct) > 0 ? "Clic para quitar IVA" : "Clic para aplicar IVA"}
                                    >
                                      IVA {Number(l.iva_pct) > 0 ? `${l.iva_pct}%` : ''}
                                    </button>
                                    {/* IEPS toggle — only show if product originally had IEPS */}
                                    {(Number(l.ieps_pct) > 0 || (lineData.impuestos_label || '').includes('IEPS')) && (
                                      <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => {
                                          if (readOnly) return;
                                          const currentIeps = Number(l.ieps_pct) || 0;
                                          const prod = productosList?.find((p: any) => p.id === l.producto_id);
                                          const defaultIeps = prod?.tiene_ieps ? Number(prod.ieps_pct ?? 0) : 0;
                                          const newIeps = currentIeps > 0 ? 0 : defaultIeps;
                                          updateLine(idx, 'ieps_pct', newIeps);
                                          const newIva = Number(l.iva_pct) || 0;
                                          const taxes: string[] = [];
                                          if (newIva > 0) taxes.push(`IVA ${newIva}%`);
                                          if (newIeps > 0) taxes.push(`IEPS ${newIeps}%`);
                                          setLineas(prev => {
                                            const next = [...prev];
                                            (next[idx] as any).impuestos_label = taxes.join(', ');
                                            return next;
                                          });
                                        }}
                                        className={cn(
                                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer",
                                          Number(l.ieps_pct) > 0
                                            ? "bg-accent text-accent-foreground"
                                            : "bg-muted/50 text-muted-foreground line-through opacity-60"
                                        )}
                                        title={Number(l.ieps_pct) > 0 ? "Clic para quitar IEPS" : "Clic para aplicar IEPS"}
                                      >
                                        IEPS {Number(l.ieps_pct) > 0 ? `${l.ieps_pct}%` : ''}
                                      </button>
                                    )}
                                    {Number(l.iva_pct) === 0 && Number(l.ieps_pct) === 0 && !(lineData.impuestos_label || '').includes('IEPS') && (
                                      <span className="text-muted-foreground text-[11px]">—</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              {/* Descuento % */}
                              <td className="py-1 px-2">
                                {readOnly ? (
                                  <span className="text-[12px] block text-right">{l.descuento_pct ?? 0}%</span>
                                ) : (
                                  <input
                                    ref={el => setCellRef(idx, 3, el)}
                                    type="number"
                                    inputMode="decimal"
                                    className="inline-edit-input text-[12px] text-right !py-1 w-full"
                                    value={l.descuento_pct ?? ''}
                                    onChange={e => updateLine(idx, 'descuento_pct', e.target.value)}
                                    onKeyDown={e => handleCellKeyDown(e, idx, 3)}
                                    onFocus={e => e.target.select()}
                                    min="0" max="100" step="0.1"
                                  />
                                )}
                              </td>
                              {/* Subtotal with taxes */}
                              <td className="py-1.5 px-2 text-right font-medium">
                                {isEmpty ? '' : (
                                  <div>
                                    <span>${lineTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    {(iva > 0 || ieps > 0) && (
                                      <span className="block text-[10px] text-muted-foreground font-normal">sin imp: ${base.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-2">
                                {!readOnly && !isEmpty && (
                                  <button
                                    onClick={() => removeLine(idx)}
                                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!readOnly && (
                    <button onClick={addLine} className="btn-odoo-secondary text-xs">
                      <Plus className="h-3 w-3" /> Agregar producto
                    </button>
                  )}

                  {/* Totals — sticky on mobile */}
                  <div className="flex justify-end pt-2 sticky bottom-0 bg-card pb-2">
                    <div className="w-72 bg-accent rounded-md p-3 space-y-1.5 text-[13px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${totals.subtotal.toFixed(2)}</span>
                      </div>
                      {totals.descuento_total > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span>Descuento</span>
                          <span>-${totals.descuento_total.toFixed(2)}</span>
                        </div>
                      )}
                      {totals.ieps_total > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IEPS</span>
                          <span>${totals.ieps_total.toFixed(2)}</span>
                        </div>
                      )}
                      {totals.iva_total > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IVA</span>
                          <span>${totals.iva_total.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-2 font-semibold text-[15px]">
                        <span>Total</span>
                        <span>${totals.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            // Pagos tab — only for saved sales
            ...(!isNew ? [{
              key: 'pagos',
              label: `Pagos (${(pagosData ?? []).length})`,
              content: (
                <div className="p-4 space-y-4">
                  {/* Pagos list */}
                  {(pagosData ?? []).length > 0 ? (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-table-border text-left">
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Fecha</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Método</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Referencia</th>
                          <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pagosData ?? []).map((p: any) => (
                          <tr key={p.id} className="border-b border-table-border hover:bg-table-hover">
                            <td className="py-2 px-2">{p.cobros?.fecha ?? '—'}</td>
                            <td className="py-2 px-2 capitalize">{p.cobros?.metodo_pago ?? '—'}</td>
                            <td className="py-2 px-2 text-muted-foreground">{p.cobros?.referencia || '—'}</td>
                            <td className="py-2 px-2 text-right font-medium">${Number(p.monto_aplicado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border">
                          <td colSpan={3} className="py-2 px-2 font-semibold text-right">Total pagado</td>
                          <td className="py-2 px-2 text-right font-semibold text-green-600">${totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <p className="text-muted-foreground text-sm">Sin pagos registrados</p>
                  )}

                  {/* Add payment form */}
                  {saldoPendiente > 0.01 && (
                    <>
                      {!showPagoForm ? (
                        <button onClick={() => setShowPagoForm(true)} className="btn-odoo-primary text-xs">
                          <Banknote className="h-3.5 w-3.5" /> Registrar pago
                        </button>
                      ) : (
                        <div className="bg-muted rounded-md p-4 space-y-3 max-w-md">
                          <h4 className="text-[13px] font-semibold text-foreground">Nuevo pago</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="label-odoo">Monto</label>
                              <input type="number" className="input-odoo" value={pagoMonto} onChange={e => setPagoMonto(e.target.value)} min="0" step="0.01" placeholder={`Max: $${saldoPendiente.toFixed(2)}`} />
                            </div>
                            <div>
                              <label className="label-odoo">Método</label>
                              <select className="input-odoo" value={pagoMetodo} onChange={e => setPagoMetodo(e.target.value)}>
                                <option value="efectivo">Efectivo</option>
                                <option value="transferencia">Transferencia</option>
                                <option value="tarjeta">Tarjeta</option>
                                <option value="cheque">Cheque</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="label-odoo">Referencia (opcional)</label>
                            <input className="input-odoo" value={pagoRef} onChange={e => setPagoRef(e.target.value)} placeholder="No. referencia, cheque, etc." />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleAddPago} disabled={pagoSaving} className="btn-odoo-primary text-xs">
                              {pagoSaving ? 'Guardando...' : 'Aplicar pago'}
                            </button>
                            <button onClick={() => setShowPagoForm(false)} className="btn-odoo-secondary text-xs">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {saldoPendiente <= 0.01 && (pagosData ?? []).length > 0 && (
                    <div className="text-green-600 text-sm font-medium flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                      Venta pagada en su totalidad
                    </div>
                  )}
                </div>
              ),
            }] : []),
            {
              key: 'notas',
              label: 'Notas',
              content: (
                <div className="p-4">
                  {readOnly ? (
                    <p className="text-[13px] text-foreground whitespace-pre-wrap">{form.notas || 'Sin notas'}</p>
                  ) : (
                    <textarea
                      className="input-odoo w-full min-h-[100px]"
                      value={form.notas ?? ''}
                      onChange={e => set('notas', e.target.value)}
                      placeholder="Notas internas de la venta..."
                    />
                  )}
                </div>
              ),
            },
          ]} />
        </div>
      </div>
    </div>
  );
}
