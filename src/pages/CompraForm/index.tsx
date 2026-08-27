import { useState } from 'react';
import QuickProveedorDialog from '@/components/QuickProveedorDialog';
import SearchableSelect from '@/components/SearchableSelect';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useCompraForm } from './useCompraForm';
import { CompraHeader } from './CompraHeader';
import { CompraLineasTab } from './CompraLineasTab';
import { CompraPagosTab } from './CompraPagosTab';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { todayInTimezone } from '@/lib/utils';

export default function CompraFormPage() {
  const h = useCompraForm();
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const [activeTab, setActiveTab] = useState('lineas');
  const [provOpen, setProvOpen] = useState(false);
  const [provName, setProvName] = useState('');
  if (!h.isNew && h.isLoading) return <div className="p-6"><TableSkeleton rows={6} cols={4} /></div>;

  const hayPendienteRecibir = h.lineas.some((l) => {
    if (!l.id || !l.producto_id) return false;
    const factor = Number(l._factor_conversion) || 1;
    const totalPz = (Number(l.cantidad) || 0) * factor;
    const recibido = Number(l.cantidad_recibida) || 0;
    return totalPz - recibido > 0;
  });
  const puedeRecibir = hayPendienteRecibir && !['borrador', 'cancelada'].includes(h.form.status);

  return (
    <><div className="p-3 sm:p-4 space-y-4 min-h-full max-w-full overflow-x-hidden">
      <CompraHeader form={h.form} isNew={h.isNew} isEditable={h.isEditable} dirty={h.dirty} totalPagado={h.totalPagado} totals={h.totals} saldoActual={h.saldoActual} hayPendienteRecibir={hayPendienteRecibir} confirmDialog={h.confirmDialog} setConfirmDialog={h.setConfirmDialog} handleSave={h.handleSave} handleDelete={h.handleDelete} handleStatusChange={h.handleStatusChange} handleCancel={h.handleCancel} recibirTodoPendiente={h.recibirTodoPendiente} requestPin={h.requestPin} onBack={() => h.navigate('/almacen/compras')} onRegistrarPago={() => { h.setNewPago(() => ({ fecha: todayInTimezone(empresa?.zona_horaria), metodo_pago: 'transferencia', referencia: '', notas: '', monto: h.saldoActual })); h.setAddingPago(true); setActiveTab('pagos'); }} />

      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><label className="label-odoo label-required">Proveedor</label>{h.isEditable ? <SearchableSelect options={(h.proveedoresList ?? []).map(p => ({ value: p.id, label: p.nombre }))} value={h.form.proveedor_id ?? ''} onChange={val => h.updateField('proveedor_id', val || null)} placeholder="Buscar proveedor..." onCreateNew={async (name) => { setProvName(name); setProvOpen(true); return undefined; }} /> : <div className="text-[13px] py-1.5 px-1 text-foreground">{h.form.proveedores?.nombre || h.proveedoresList?.find(p => p.id === h.form.proveedor_id)?.nombre || '—'}</div>}</div>
          <div><label className="label-odoo label-required">Almacén destino</label>{h.isEditable ? <SearchableSelect options={(h.almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }))} value={h.form.almacen_id ?? ''} onChange={val => h.updateField('almacen_id', val || null)} placeholder="Buscar almacén..." /> : <div className="text-[13px] py-1.5 px-1 text-foreground">{h.form.almacenes?.nombre || h.almacenesList?.find(a => a.id === h.form.almacen_id)?.nombre || '—'}</div>}</div>
          <div><label className="label-odoo">Fecha</label><OdooDatePicker value={h.form.fecha ?? ''} onChange={val => h.updateField('fecha', val)} /></div>
          <div><label className="label-odoo">Condición de pago</label>{h.isEditable ? <SearchableSelect options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]} value={h.form.condicion_pago ?? 'contado'} onChange={val => h.updateField('condicion_pago', val)} placeholder="Seleccionar..." /> : <div className="text-[13px] py-1.5 px-1 text-foreground capitalize">{h.form.condicion_pago}</div>}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {h.form.condicion_pago === 'credito' && (<>
            <div><label className="label-odoo">Días de crédito</label><input type="number" min={0} className="input-odoo w-full" value={h.form.dias_credito ?? 0} onChange={e => h.updateField('dias_credito', Math.max(0, Number(e.target.value) || 0))} disabled={!h.isEditable} /></div>
            <div><label className="label-odoo">Fecha de vencimiento</label>{h.isEditable ? <OdooDatePicker value={h.form.fecha_vencimiento ?? ''} onChange={val => h.updateField('fecha_vencimiento', val)} /> : <div className="text-[13px] py-1.5 px-1 text-foreground">{h.form.fecha_vencimiento ?? '—'}</div>}</div>
          </>)}
          <div><label className="label-odoo">Número de factura</label><input className="input-odoo w-full" value={h.form.numero_factura ?? ''} onChange={e => h.updateField('numero_factura', e.target.value)} placeholder="Ej. A-12345" disabled={!h.isEditable} /></div>
          <div><label className="label-odoo">Notas</label><input className="input-odoo w-full" value={h.form.notas ?? ''} onChange={e => h.updateField('notas', e.target.value)} placeholder="Notas de la compra" disabled={!h.isEditable} /></div>
        </div>
      </div>

      <OdooTabs activeTab={activeTab} tabs={[
        { key: 'lineas', label: 'Líneas de compra', content: <CompraLineasTab compraId={h.form.id} needsSave={h.isNew || h.dirty} ensureSavedLinea={h.ensureSavedLinea} almacenId={h.form.almacen_id} onLoteChanged={h.refetchCompra} lineas={h.lineas} productosList={h.productosList} isEditable={h.isEditable} puedeRecibir={puedeRecibir} updateLinea={h.updateLinea} addLine={h.addLine} removeLine={h.removeLine} onRecibirLinea={h.recibirLineaPendiente} /> },
        { key: 'notas', label: 'Notas', content: (
          <div className="space-y-3">
            <div><label className="label-odoo">Notas generales</label><textarea className="input-odoo w-full h-20" value={h.form.notas ?? ''} onChange={e => h.updateField('notas', e.target.value)} disabled={!h.isEditable} /></div>
            <div><label className="label-odoo">Notas de pago</label><textarea className="input-odoo w-full h-20" value={h.form.notas_pago ?? ''} onChange={e => h.updateField('notas_pago', e.target.value)} /></div>
          </div>
        )},
        ...(!h.isNew ? [{ key: 'pagos', label: `Pagos (${h.pagos?.length ?? 0})`, content: <CompraPagosTab pagos={h.pagos ?? []} form={h.form} totals={h.totals} totalPagado={h.totalPagado} saldoActual={h.saldoActual} addingPago={h.addingPago} setAddingPago={h.setAddingPago} newPago={h.newPago} setNewPago={h.setNewPago} handleSavePago={h.handleSavePago} /> }] : []),
      ]} />

      <div className="flex items-end justify-end gap-4">
        <div className="ml-auto bg-card border border-border rounded-lg p-4 w-full md:w-[420px] space-y-3">
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div>
              <label className="label-odoo">Descuento final de factura</label>
              <input type="number" min={0} max={h.form.descuento_extra_tipo === 'porcentaje' ? 100 : undefined} step="0.01" className="input-odoo w-full" value={h.form.descuento_extra ?? 0} onChange={e => h.updateField('descuento_extra', Math.max(0, Number(e.target.value) || 0))} disabled={!h.isEditable} />
            </div>
            <div>
              <label className="label-odoo">Tipo</label>
              <select className="input-odoo w-full" value={h.form.descuento_extra_tipo ?? 'monto'} onChange={e => h.updateField('descuento_extra_tipo', e.target.value)} disabled={!h.isEditable}>
                <option value="monto">Monto</option>
                <option value="porcentaje">%</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-odoo">Motivo del descuento</label>
            <input className="input-odoo w-full" value={h.form.descuento_extra_motivo ?? ''} onChange={e => h.updateField('descuento_extra_motivo', e.target.value)} placeholder="Ej. descuento comercial al final" disabled={!h.isEditable} />
          </div>
          <div>
            <label className="label-odoo">Ajuste por diferencia (+ / −)</label>
            <input type="number" step="0.01" className="input-odoo w-full" value={h.form.ajuste_total ?? 0} onChange={e => h.updateField('ajuste_total', Number(e.target.value) || 0)} disabled={!h.isEditable} />
            <p className="mt-1 text-[11px] text-muted-foreground">Usa negativo para restar centavos o pesos; positivo para sumar.</p>
          </div>
          <div className="border-t border-border pt-2 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{fmt(h.totals.subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Impuestos</span><span className="font-medium">{fmt(h.totals.iva_total)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total antes de ajustes</span><span className="font-medium">{fmt(h.totals.total_antes_ajustes)}</span></div>
          {h.totals.descuento_total > 0 && <div className="flex justify-between text-sm text-success"><span>Descuento final</span><span className="font-medium">− {fmt(h.totals.descuento_total)}</span></div>}
          {h.totals.ajuste_total !== 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ajuste</span><span className="font-medium">{h.totals.ajuste_total > 0 ? '+' : '−'} {fmt(Math.abs(h.totals.ajuste_total))}</span></div>}
          <div className="border-t border-border pt-2 flex justify-between text-base"><span className="font-semibold">Total final</span><span className="font-bold">{fmt(h.totals.total)}</span></div>
          {!h.isNew && (<><div className="border-t border-border pt-2 flex justify-between text-sm"><span className="text-success">Pagado</span><span className="font-medium text-success">{fmt(h.totalPagado)}</span></div><div className="flex justify-between text-sm"><span className="text-destructive">Saldo</span><span className="font-bold text-destructive">{fmt(h.saldoActual)}</span></div></>)}
          </div>
        </div>
      </div>
    </div>
    <QuickProveedorDialog open={provOpen} onOpenChange={setProvOpen} initialName={provName} onCreated={(prov) => h.updateField('proveedor_id', prov.id)} />
    <h.PinDialog />
    </>
  );
}
