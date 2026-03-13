import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus, X } from 'lucide-react';
import { OdooField, OdooSection } from '@/components/OdooFormField';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useVenta, useSaveVenta, useSaveVentaLinea, useDeleteVentaLinea, useDeleteVenta } from '@/hooks/useVentas';
import { useProductosForSelect, useUnidades, useTasasIva, useTasasIeps, useAlmacenes } from '@/hooks/useData';
import { useClientes } from '@/hooks/useClientes';
import { useTarifasForSelect } from '@/hooks/useData';
import type { Venta, VentaLinea, StatusVenta } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const VENTA_STEPS: { key: StatusVenta; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'entregado', label: 'Entregado' },
  { key: 'facturado', label: 'Facturado' },
];

const TIPO_OPTIONS = [
  { value: 'pedido', label: 'Pedido' },
  { value: 'venta_directa', label: 'Venta directa' },
];

const CONDICION_OPTIONS = [
  { value: 'contado', label: 'Contado' },
  { value: 'credito', label: 'Crédito' },
  { value: 'por_definir', label: 'Por definir' },
];

function emptyVenta(): Partial<Venta> {
  return {
    tipo: 'pedido',
    status: 'borrador',
    condicion_pago: 'contado',
    fecha: new Date().toISOString().slice(0, 10),
    entrega_inmediata: false,
    subtotal: 0,
    descuento_total: 0,
    iva_total: 0,
    ieps_total: 0,
    total: 0,
  };
}

export default function VentaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existingVenta, isLoading } = useVenta(isNew ? undefined : id);
  const saveVenta = useSaveVenta();
  const saveLinea = useSaveVentaLinea();
  const deleteLinea = useDeleteVentaLinea();
  const deleteVenta = useDeleteVenta();

  const { data: clientesList } = useClientes();
  const { data: productosList } = useProductosForSelect();
  const { data: unidadesList } = useUnidades();
  const { data: tarifasList } = useTarifasForSelect();
  const { data: almacenesList } = useAlmacenes();
  const { data: tasasIva } = useTasasIva();
  const { data: tasasIeps } = useTasasIeps();

  const [form, setForm] = useState<Partial<Venta>>(emptyVenta());
  const [lineas, setLineas] = useState<Partial<VentaLinea>[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (existingVenta) {
      setForm(existingVenta);
      setLineas(existingVenta.venta_lineas ?? []);
    }
  }, [existingVenta]);

  const set = (field: string, val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
    setDirty(true);
  };

  // Recalculate totals from lines
  const totals = useMemo(() => {
    let subtotal = 0, descuento_total = 0, iva_total = 0, ieps_total = 0;
    lineas.forEach(l => {
      const qty = Number(l.cantidad) || 0;
      const price = Number(l.precio_unitario) || 0;
      const desc = Number(l.descuento_pct) || 0;
      const lineSubtotal = qty * price;
      const discountAmt = lineSubtotal * (desc / 100);
      const base = lineSubtotal - discountAmt;
      const iva = base * ((Number(l.iva_pct) || 0) / 100);
      const ieps = base * ((Number(l.ieps_pct) || 0) / 100);
      subtotal += lineSubtotal;
      descuento_total += discountAmt;
      iva_total += iva;
      ieps_total += ieps;
    });
    return { subtotal, descuento_total, iva_total, ieps_total, total: subtotal - descuento_total + iva_total + ieps_total };
  }, [lineas]);

  const handleSave = async () => {
    if (!form.cliente_id) { toast.error('Selecciona un cliente'); return; }
    try {
      const payload = {
        ...form,
        ...totals,
      };
      const saved = await saveVenta.mutateAsync(payload as any);
      const ventaId = saved.id || form.id;

      // Save lines
      for (const l of lineas) {
        if (!l.producto_id) continue;
        const qty = Number(l.cantidad) || 0;
        const price = Number(l.precio_unitario) || 0;
        const desc = Number(l.descuento_pct) || 0;
        const lineSubtotal = qty * price;
        const discountAmt = lineSubtotal * (desc / 100);
        const base = lineSubtotal - discountAmt;
        const iva = base * ((Number(l.iva_pct) || 0) / 100);
        const ieps = base * ((Number(l.ieps_pct) || 0) / 100);

        await saveLinea.mutateAsync({
          ...l,
          venta_id: ventaId,
          subtotal: lineSubtotal - discountAmt,
          iva_monto: iva,
          ieps_monto: ieps,
          total: base + iva + ieps,
        } as any);
      }

      toast.success('Venta guardada');
      if (isNew) navigate(`/ventas/${ventaId}`, { replace: true });
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!form.id || !confirm('¿Eliminar esta venta?')) return;
    await deleteVenta.mutateAsync(form.id);
    toast.success('Venta eliminada');
    navigate('/ventas');
  };

  const handleStatusChange = async (newStatus: StatusVenta) => {
    if (!form.id) return;
    if (newStatus === 'cancelado') {
      if (!confirm('¿Cancelar esta venta?')) return;
    }
    set('status', newStatus);
    await saveVenta.mutateAsync({ id: form.id, status: newStatus } as any);
    toast.success(`Status cambiado a ${newStatus}`);
  };

  const addLine = () => {
    setLineas(prev => [...prev, {
      cantidad: 1,
      precio_unitario: 0,
      descuento_pct: 0,
      iva_pct: 0,
      ieps_pct: 0,
      subtotal: 0,
      iva_monto: 0,
      ieps_monto: 0,
      total: 0,
    }]);
    setDirty(true);
  };

  const updateLine = (idx: number, field: string, val: any) => {
    setLineas(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
    setDirty(true);
  };

  const removeLine = async (idx: number) => {
    const line = lineas[idx];
    if (line.id) {
      await deleteLinea.mutateAsync(line.id);
    }
    setLineas(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleProductSelect = (idx: number, productoId: string) => {
    updateLine(idx, 'producto_id', productoId);
    // Auto-fill price and taxes from product
    // We'd need the full product data, but we have productosList which is minimal
    // For now just set the product id
  };

  if (!isNew && isLoading) {
    return <div className="p-4 bg-secondary/50 min-h-full"><TableSkeleton rows={6} cols={4} /></div>;
  }

  const clienteOptions = (clientesList ?? []).map(c => ({ value: c.id, label: `${c.codigo ? c.codigo + ' - ' : ''}${c.nombre}` }));
  const vendedorOptions = [{ value: '', label: 'Sin vendedor' }];
  const tarifaOptions = (tarifasList ?? []).map(t => ({ value: t.id, label: t.nombre }));
  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const productoOptions = (productosList ?? []).map(p => ({ value: p.id, label: `${p.codigo} - ${p.nombre}` }));
  const unidadOptions = (unidadesList ?? []).map(u => ({ value: u.id, label: u.nombre }));

  return (
    <div className="bg-secondary/50 min-h-full">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-4 py-2 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/ventas')} className="btn-odoo-secondary">
            <ArrowLeft className="h-3.5 w-3.5" /> Ventas
          </button>
          <h1 className="text-base font-semibold text-foreground">
            {isNew ? 'Nueva Venta' : (form.folio || `Venta ${form.id?.slice(0, 8)}`)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && form.status !== 'cancelado' && (
            <button onClick={() => handleStatusChange('cancelado')} className="btn-odoo-secondary text-destructive">
              Cancelar
            </button>
          )}
          {!isNew && form.status === 'borrador' && (
            <button onClick={() => handleStatusChange('confirmado')} className="btn-odoo-primary">
              Confirmar
            </button>
          )}
          {!isNew && form.status === 'confirmado' && (
            <button onClick={() => handleStatusChange('entregado')} className="btn-odoo-primary">
              Marcar Entregado
            </button>
          )}
          {!isNew && form.status === 'entregado' && (
            <button onClick={() => handleStatusChange('facturado')} className="btn-odoo-primary">
              Facturar
            </button>
          )}
          <button onClick={handleSave} disabled={saveVenta.isPending} className="btn-odoo-primary">
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
          {!isNew && (
            <button onClick={handleDelete} className="btn-odoo-secondary text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {!isNew && (
        <div className="px-4 pt-3">
          <OdooStatusbar
            steps={VENTA_STEPS}
            current={form.status as string}
            onStepClick={(key) => handleStatusChange(key as StatusVenta)}
          />
        </div>
      )}

      {/* Form body */}
      <div className="p-4 space-y-4">
        {/* Header fields */}
        <div className="bg-card border border-border rounded p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            <OdooField label="Tipo" value={form.tipo} onChange={v => set('tipo', v)} type="select" options={TIPO_OPTIONS} alwaysEdit />
            <OdooField label="Folio" value={form.folio} onChange={v => set('folio', v)} placeholder="Automático" />
            <OdooField label="Cliente" value={form.cliente_id} onChange={v => set('cliente_id', v)} type="select" options={clienteOptions} alwaysEdit />
            <OdooField label="Fecha" value={form.fecha} onChange={v => set('fecha', v)} type="text" placeholder="YYYY-MM-DD" alwaysEdit />
            <OdooField label="Condición de Pago" value={form.condicion_pago} onChange={v => set('condicion_pago', v)} type="select" options={CONDICION_OPTIONS} alwaysEdit />
            <OdooField label="Tarifa" value={form.tarifa_id} onChange={v => set('tarifa_id', v)} type="select" options={[{ value: '', label: 'Sin tarifa' }, ...tarifaOptions]} />
            <OdooField label="Almacén" value={form.almacen_id} onChange={v => set('almacen_id', v)} type="select" options={[{ value: '', label: 'Sin almacén' }, ...almacenOptions]} />

            <div className="odoo-field-row">
              <span className="odoo-field-label">Entrega Inmediata</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.entrega_inmediata}
                  onChange={e => set('entrega_inmediata', e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-sm text-foreground">{form.entrega_inmediata ? 'Sí' : 'No'}</span>
              </label>
            </div>

            {!form.entrega_inmediata && (
              <OdooField label="Fecha de Entrega" value={form.fecha_entrega} onChange={v => set('fecha_entrega', v)} type="text" placeholder="YYYY-MM-DD" alwaysEdit />
            )}
          </div>
        </div>

        {/* Lines */}
        <div className="bg-card border border-border rounded">
          <OdooTabs tabs={[
            {
              key: 'lineas',
              label: 'Líneas de Venta',
              content: (
                <div className="p-4 space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-table-border">
                          <th className="th-odoo text-left w-8">#</th>
                          <th className="th-odoo text-left min-w-[200px]">Producto</th>
                          <th className="th-odoo text-left w-24">Unidad</th>
                          <th className="th-odoo text-right w-20">Cant.</th>
                          <th className="th-odoo text-right w-28">P. Unit.</th>
                          <th className="th-odoo text-right w-20">Desc %</th>
                          <th className="th-odoo text-right w-20">IVA %</th>
                          <th className="th-odoo text-right w-20">IEPS %</th>
                          <th className="th-odoo text-right w-28">Subtotal</th>
                          <th className="th-odoo w-16">Notas</th>
                          <th className="th-odoo w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineas.map((l, idx) => {
                          const qty = Number(l.cantidad) || 0;
                          const price = Number(l.precio_unitario) || 0;
                          const desc = Number(l.descuento_pct) || 0;
                          const lineBase = qty * price * (1 - desc / 100);
                          return (
                            <tr key={idx} className="border-b border-table-border">
                              <td className="py-1.5 px-2 text-muted-foreground text-xs">{idx + 1}</td>
                              <td className="py-1 px-2">
                                <select
                                  className="input-odoo text-xs w-full"
                                  value={l.producto_id ?? ''}
                                  onChange={e => handleProductSelect(idx, e.target.value)}
                                >
                                  <option value="">Seleccionar producto</option>
                                  {productoOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </td>
                              <td className="py-1 px-2">
                                <select
                                  className="input-odoo text-xs w-full"
                                  value={l.unidad_id ?? ''}
                                  onChange={e => updateLine(idx, 'unidad_id', e.target.value)}
                                >
                                  <option value="">—</option>
                                  {unidadOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </td>
                              <td className="py-1 px-2">
                                <input type="number" className="input-odoo text-xs text-right w-full" value={l.cantidad ?? ''} onChange={e => updateLine(idx, 'cantidad', e.target.value)} min="0" step="1" />
                              </td>
                              <td className="py-1 px-2">
                                <input type="number" className="input-odoo text-xs text-right w-full" value={l.precio_unitario ?? ''} onChange={e => updateLine(idx, 'precio_unitario', e.target.value)} min="0" step="0.01" />
                              </td>
                              <td className="py-1 px-2">
                                <input type="number" className="input-odoo text-xs text-right w-full" value={l.descuento_pct ?? ''} onChange={e => updateLine(idx, 'descuento_pct', e.target.value)} min="0" max="100" step="0.1" />
                              </td>
                              <td className="py-1 px-2">
                                <input type="number" className="input-odoo text-xs text-right w-full" value={l.iva_pct ?? ''} onChange={e => updateLine(idx, 'iva_pct', e.target.value)} min="0" step="0.01" />
                              </td>
                              <td className="py-1 px-2">
                                <input type="number" className="input-odoo text-xs text-right w-full" value={l.ieps_pct ?? ''} onChange={e => updateLine(idx, 'ieps_pct', e.target.value)} min="0" step="0.01" />
                              </td>
                              <td className="py-1.5 px-2 text-right font-medium text-xs">${lineBase.toFixed(2)}</td>
                              <td className="py-1 px-2">
                                <input type="text" className="input-odoo text-xs w-full" value={l.notas ?? ''} onChange={e => updateLine(idx, 'notas', e.target.value)} placeholder="—" />
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <button onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-destructive">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button onClick={addLine} className="btn-odoo-secondary text-xs">
                    <Plus className="h-3 w-3" /> Agregar línea
                  </button>

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-64 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
                      </div>
                      {totals.descuento_total > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span>Descuento:</span>
                          <span>-${totals.descuento_total.toFixed(2)}</span>
                        </div>
                      )}
                      {totals.iva_total > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IVA:</span>
                          <span>${totals.iva_total.toFixed(2)}</span>
                        </div>
                      )}
                      {totals.ieps_total > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IEPS:</span>
                          <span>${totals.ieps_total.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1 font-semibold text-base">
                        <span>Total:</span>
                        <span>${totals.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'notas',
              label: 'Notas',
              content: (
                <div className="p-4">
                  <textarea
                    className="input-odoo w-full min-h-[100px] text-sm"
                    value={form.notas ?? ''}
                    onChange={e => set('notas', e.target.value)}
                    placeholder="Notas internas de la venta..."
                  />
                </div>
              ),
            },
          ]} />
        </div>
      </div>
    </div>
  );
}
