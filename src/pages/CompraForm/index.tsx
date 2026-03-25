import SearchableSelect from '@/components/SearchableSelect';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useCompraForm } from './useCompraForm';
import { CompraHeader } from './CompraHeader';
import { CompraLineasTab } from './CompraLineasTab';
import { CompraPagosTab } from './CompraPagosTab';
import { useCurrency } from '@/hooks/useCurrency';

export default function CompraFormPage() {
  const h = useCompraForm();
  const { fmt } = useCurrency();
  if (!h.isNew && h.isLoading) return <div className="p-6"><TableSkeleton rows={6} cols={4} /></div>;

  return (
    <><div className="p-4 space-y-4 min-h-full">
      <CompraHeader form={h.form} isNew={h.isNew} isEditable={h.isEditable} dirty={h.dirty} totalPagado={h.totalPagado} totals={h.totals} saldoActual={h.saldoActual} confirmDialog={h.confirmDialog} setConfirmDialog={h.setConfirmDialog} handleSave={h.handleSave} handleDelete={h.handleDelete} handleStatusChange={h.handleStatusChange} handleCancel={h.handleCancel} requestPin={h.requestPin} onBack={() => h.navigate('/almacen/compras')} />

      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><label className="label-odoo">Proveedor</label>{h.isEditable ? <SearchableSelect options={(h.proveedoresList ?? []).map(p => ({ value: p.id, label: p.nombre }))} value={h.form.proveedor_id ?? ''} onChange={val => h.updateField('proveedor_id', val || null)} placeholder="Buscar proveedor..." /> : <div className="text-[13px] py-1.5 px-1 text-foreground">{h.proveedoresList?.find(p => p.id === h.form.proveedor_id)?.nombre || '—'}</div>}</div>
          <div><label className="label-odoo">Almacén destino</label>{h.isEditable ? <SearchableSelect options={(h.almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }))} value={h.form.almacen_id ?? ''} onChange={val => h.updateField('almacen_id', val || null)} placeholder="Buscar almacén..." /> : <div className="text-[13px] py-1.5 px-1 text-foreground">{h.almacenesList?.find(a => a.id === h.form.almacen_id)?.nombre || '—'}</div>}</div>
          <div><label className="label-odoo">Fecha</label><OdooDatePicker value={h.form.fecha ?? ''} onChange={val => h.updateField('fecha', val)} /></div>
          <div><label className="label-odoo">Condición de pago</label>{h.isEditable ? <SearchableSelect options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]} value={h.form.condicion_pago ?? 'contado'} onChange={val => h.updateField('condicion_pago', val)} placeholder="Seleccionar..." /> : <div className="text-[13px] py-1.5 px-1 text-foreground capitalize">{h.form.condicion_pago}</div>}</div>
        </div>
        {h.form.condicion_pago === 'credito' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><label className="label-odoo">Días de crédito</label><input type="number" className="input-odoo w-full" value={h.form.dias_credito ?? 0} onChange={e => h.updateField('dias_credito', Number(e.target.value))} disabled={!h.isEditable} /></div></div>
        )}
      </div>

      <OdooTabs tabs={[
        { key: 'lineas', label: 'Líneas de compra', content: <CompraLineasTab lineas={h.lineas} productosList={h.productosList} isEditable={h.isEditable} updateLinea={h.updateLinea} addLine={h.addLine} removeLine={h.removeLine} /> },
        { key: 'notas', label: 'Notas', content: (
          <div className="space-y-3">
            <div><label className="label-odoo">Notas generales</label><textarea className="input-odoo w-full h-20" value={h.form.notas ?? ''} onChange={e => h.updateField('notas', e.target.value)} disabled={!h.isEditable} /></div>
            <div><label className="label-odoo">Notas de pago</label><textarea className="input-odoo w-full h-20" value={h.form.notas_pago ?? ''} onChange={e => h.updateField('notas_pago', e.target.value)} /></div>
          </div>
        )},
        ...(!h.isNew ? [{ key: 'pagos', label: `Pagos (${h.pagos?.length ?? 0})`, content: <CompraPagosTab pagos={h.pagos ?? []} form={h.form} totals={h.totals} totalPagado={h.totalPagado} saldoActual={h.saldoActual} addingPago={h.addingPago} setAddingPago={h.setAddingPago} newPago={h.newPago} setNewPago={h.setNewPago} handleSavePago={h.handleSavePago} /> }] : []),
      ]} />

      <div className="flex justify-end">
        <div className="bg-card border border-border rounded-lg p-4 w-72 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{fmt(h.totals.subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Impuestos</span><span className="font-medium">{fmt(h.totals.iva_total)}</span></div>
          <div className="border-t border-border pt-2 flex justify-between text-base"><span className="font-semibold">Total</span><span className="font-bold">{fmt(h.totals.total)}</span></div>
          {!h.isNew && (<><div className="border-t border-border pt-2 flex justify-between text-sm"><span className="text-success">Pagado</span><span className="font-medium text-success">{fmt(h.totalPagado)}</span></div><div className="flex justify-between text-sm"><span className="text-destructive">Saldo</span><span className="font-bold text-destructive">{fmt(h.saldoActual)}</span></div></>)}
        </div>
      </div>
    </div>
    <h.PinDialog />
    </>
  );
}
