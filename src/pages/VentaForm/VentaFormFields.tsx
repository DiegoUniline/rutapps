import { useIsMobile } from '@/hooks/use-mobile';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import SearchableSelect from '@/components/SearchableSelect';
import { cn } from '@/lib/utils';

interface Props {
  form: Record<string, any>;
  readOnly: boolean;
  isNew: boolean;
  clienteOptions: { value: string; label: string }[];
  tarifaOptions: { value: string; label: string }[];
  almacenOptions: { value: string; label: string }[];
  clienteNombre?: string;
  totalPagado: number;
  saldoPendiente: number;
  set: (field: string, val: any) => void;
  onClienteChange: (cId: string) => void;
}

export function VentaFormFields({ form, readOnly, isNew, clienteOptions, almacenOptions, clienteNombre, totalPagado, saldoPendiente, set, onClienteChange }: Props) {
  const isMobile = useIsMobile();

  const condicionBtns = [
    { value: 'contado', label: 'Contado' },
    { value: 'credito', label: 'Crédito' },
    { value: 'por_definir', label: 'Por definir' },
  ];

  const renderTipo = () => readOnly
    ? <div className="text-[13px] py-1.5 px-1 text-foreground">{form.tipo === 'pedido' ? 'Pedido' : 'Venta directa'}</div>
    : (
      <div className="flex gap-1">
        {['pedido', 'venta_directa'].map(t => (
          <button key={t} onClick={() => { set('tipo', t); set('condicion_pago', t === 'pedido' ? 'por_definir' : 'contado'); }}
            className={cn("flex-1 py-1.5 text-[12px] font-medium rounded border transition-colors", form.tipo === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary")}>
            {t === 'pedido' ? 'Pedido' : 'Venta directa'}
          </button>
        ))}
      </div>
    );

  const renderCondicion = () => readOnly
    ? <div className="text-[13px] py-1.5 px-1 text-foreground capitalize">{form.condicion_pago}</div>
    : (
      <div className="flex gap-1">
        {condicionBtns.map(o => (
          <button key={o.value} onClick={() => set('condicion_pago', o.value)}
            className={cn("flex-1 py-1.5 text-[12px] font-medium rounded border transition-colors", form.condicion_pago === o.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary")}>
            {o.label}
          </button>
        ))}
      </div>
    );

  const renderCliente = () => readOnly
    ? <div className="text-[13px] py-1.5 px-1 text-foreground">{clienteNombre || '—'}</div>
    : <SearchableSelect options={clienteOptions} value={form.cliente_id ?? ''} onChange={onClienteChange} placeholder="Buscar cliente..." />;

  const renderAlmacen = () => readOnly
    ? <div className="text-[13px] py-1.5 px-1 text-foreground">{almacenOptions.find(a => a.value === form.almacen_id)?.label || 'Sin almacén'}</div>
    : <SearchableSelect options={almacenOptions} value={form.almacen_id ?? ''} onChange={val => set('almacen_id', val || null)} placeholder="Buscar almacén..." />;

  const renderEntrega = () => (
    <>
      <label className="label-odoo flex items-center gap-1">
        <span>Entrega</span>
        {!readOnly && (
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={!!form.entrega_inmediata} onChange={e => set('entrega_inmediata', e.target.checked)} className="rounded border-input h-3 w-3" />
            {isMobile ? 'Inm.' : 'Inmediata'}
          </label>
        )}
      </label>
      {form.entrega_inmediata
        ? <div className="text-xs text-muted-foreground py-1.5 px-1">{isMobile ? 'Inmediata' : 'Entrega inmediata'}</div>
        : readOnly ? <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha_entrega || '—'}</div>
        : <OdooDatePicker value={form.fecha_entrega} onChange={v => set('fecha_entrega', v)} placeholder="Fecha entrega" />
      }
    </>
  );

  const renderSaldo = () => !isNew && form.status !== 'borrador' && (
    <div className="bg-muted/40 border border-border rounded-md p-2.5 space-y-0.5 text-[13px]">
      <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">${(form.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span className="font-medium">${totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
      <div className="flex justify-between border-t border-border pt-0.5"><span className="font-medium">Saldo</span><span className={cn("font-semibold", saldoPendiente > 0 ? "text-destructive" : "text-foreground")}>${saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div><label className="label-odoo">Tipo</label>{renderTipo()}</div>
        <div><label className="label-odoo">Cliente</label>{renderCliente()}</div>
        <div><label className="label-odoo">Condición de pago</label>{renderCondicion()}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label-odoo">Fecha</label>{readOnly ? <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha}</div> : <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />}</div>
          <div>{renderEntrega()}</div>
        </div>
        <div><label className="label-odoo">Folio</label><div className="text-[13px] text-muted-foreground py-1.5 px-1">{form.folio || (isNew ? 'Al guardar' : '—')}</div></div>
        <div><label className="label-odoo">Almacén</label>{renderAlmacen()}</div>
        {renderSaldo()}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-3">
        <div><label className="label-odoo">Tipo</label>{renderTipo()}</div>
        <div><label className="label-odoo">Cliente</label>{renderCliente()}</div>
        <div><label className="label-odoo">Condición de pago</label>{renderCondicion()}</div>
      </div>
      <div className="space-y-3">
        <div><label className="label-odoo">Fecha</label>{readOnly ? <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha}</div> : <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />}</div>
        <div>{renderEntrega()}</div>
        <div><label className="label-odoo">Folio</label><div className="text-[13px] text-muted-foreground py-1.5 px-1">{form.folio || (isNew ? 'Se asigna al guardar' : '—')}</div></div>
      </div>
      <div className="space-y-3">
        <div><label className="label-odoo">Almacén</label>{renderAlmacen()}</div>
        {renderSaldo()}
      </div>
    </div>
  );
}
