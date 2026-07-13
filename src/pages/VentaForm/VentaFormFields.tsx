import { useIsMobile } from '@/hooks/use-mobile';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useCurrency } from '@/hooks/useCurrency';
import SearchableSelect from '@/components/SearchableSelect';
import { cn, fmtDate } from '@/lib/utils';
import { Percent, DollarSign } from 'lucide-react';
import { useAllListasPrecios } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';

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
  canEditCondicion?: boolean;
  set: (field: string, val: any) => void;
  onClienteChange: (cId: string) => void;
}
  set: (field: string, val: any) => void;
  onClienteChange: (cId: string) => void;
}

export function VentaFormFields({ form, readOnly, isNew, clienteOptions, tarifaOptions, almacenOptions, clienteNombre, totalPagado, saldoPendiente, set, onClienteChange }: Props) {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const { data: listasPrecios } = useAllListasPrecios(empresa?.id);

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
          <button key={t} onClick={() => { set('tipo', t); set('condicion_pago', t === 'pedido' ? 'por_definir' : 'contado'); set('entrega_inmediata', t === 'venta_directa'); }}
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

  const listaNombre = listasPrecios?.find(l => l.id === form.lista_precio_id)?.nombre
    ?? tarifaOptions.find(t => t.value === form.tarifa_id)?.label;
  const renderCliente = () => (
    <div className="space-y-1">
      {readOnly
        ? <div className="text-[13px] py-1.5 px-1 text-foreground">{clienteNombre || '—'}</div>
        : <SearchableSelect options={clienteOptions} value={form.cliente_id ?? ''} onChange={onClienteChange} placeholder="Buscar cliente..." />}
      {listaNombre && (
        <div className="text-[11px] text-muted-foreground px-1">
          Lista: <span className="font-medium text-foreground">{listaNombre}</span>
        </div>
      )}
    </div>
  );

  const renderAlmacen = () => readOnly
    ? <div className="text-[13px] py-1.5 px-1 text-foreground">{almacenOptions.find(a => a.value === form.almacen_id)?.label || 'Sin almacén'}</div>
    : <SearchableSelect options={almacenOptions} value={form.almacen_id ?? ''} onChange={val => set('almacen_id', val || null)} placeholder="Buscar almacén..." />;

  const requiereFechaEntrega = form.tipo !== 'venta_directa' && !form.entrega_inmediata;

  const renderEntrega = () => (
    <>
      <label className="label-odoo">
        {requiereFechaEntrega ? <>Fecha de entrega <span className="text-destructive">*</span></> : 'Entrega'}
      </label>
      {form.tipo === 'venta_directa' || form.entrega_inmediata
        ? <div className="text-xs text-muted-foreground py-1.5 px-1">{isMobile ? 'Inmediata' : 'Entrega inmediata'}</div>
        : readOnly
          ? <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha_entrega ? fmtDate(form.fecha_entrega) : '—'}</div>
          : <OdooDatePicker value={form.fecha_entrega} onChange={v => set('fecha_entrega', v)} placeholder="Fecha entrega" />
      }
    </>
  );

  const renderSaldo = () => !isNew && form.status !== 'borrador' && (
    <div className="bg-card border border-border rounded-md p-2.5 space-y-0.5 text-[13px]">
      <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{fmt(form.total ?? 0)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span className="font-medium">{fmt(totalPagado)}</span></div>
      <div className="flex justify-between border-t border-border pt-0.5">
        <span className="font-medium">
          {saldoPendiente < 0 ? 'Saldo a favor' : 'Saldo'}
        </span>
        <span className={cn(
          "font-semibold",
          saldoPendiente > 0 && "text-destructive",
          saldoPendiente < 0 && "text-success",
          saldoPendiente === 0 && "text-foreground"
        )}>
          {fmt(Math.abs(saldoPendiente))}
        </span>
      </div>
    </div>
  );

  const extraTipo = form.descuento_extra_tipo || 'porcentaje';
  const impliedDiscount = Math.max(0, Number(form.subtotal ?? 0) + Number(form.iva_total ?? 0) + Number(form.ieps_total ?? 0) - Number(form.total ?? 0));
  const discountDisplay = (form.descuento_extra ?? 0) > 0
    ? `${form.descuento_extra} ${extraTipo === 'porcentaje' ? '%' : '$'}`
    : impliedDiscount > 0
      ? fmt(impliedDiscount)
      : '—';
  const renderDescuentoExtra = () => (
    <div>
      <label className="label-odoo">Descuento extra</label>
      {readOnly ? (
        <div className="text-[13px] py-1.5 px-1 text-foreground">
          {discountDisplay}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.descuento_extra ?? 0}
            onChange={e => set('descuento_extra', Number(e.target.value) || 0)}
            className="flex-1 input-odoo text-[13px] py-1.5 w-20"
            placeholder="0"
          />
          <button
            type="button"
            onClick={() => set('descuento_extra_tipo', extraTipo === 'porcentaje' ? 'monto' : 'porcentaje')}
            className={cn(
              "shrink-0 flex items-center justify-center w-8 h-8 rounded border transition-colors",
              "bg-card text-foreground border-input hover:bg-secondary"
            )}
            title={extraTipo === 'porcentaje' ? 'Cambiar a monto fijo' : 'Cambiar a porcentaje'}
          >
            {extraTipo === 'porcentaje' ? <Percent className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div><label className="label-odoo">Tipo</label>{renderTipo()}</div>
        <div><label className="label-odoo label-required">Cliente</label>{renderCliente()}</div>
        <div><label className="label-odoo">Condición de pago</label>{renderCondicion()}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label-odoo">Fecha</label>{readOnly ? <div className="text-[13px] py-1.5 px-1 text-foreground">{fmtDate(form.fecha)}</div> : <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />}</div>
          <div>{renderEntrega()}</div>
        </div>
        <div><label className="label-odoo">Folio</label><div className="text-[13px] text-muted-foreground py-1.5 px-1">{form.folio || (isNew ? 'Al guardar' : '—')}</div></div>
        <div><label className="label-odoo label-required">Almacén</label>{renderAlmacen()}</div>
        {renderDescuentoExtra()}
        {renderSaldo()}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-3">
        <div><label className="label-odoo">Tipo</label>{renderTipo()}</div>
        <div><label className="label-odoo label-required">Cliente</label>{renderCliente()}</div>
        <div><label className="label-odoo">Condición de pago</label>{renderCondicion()}</div>
      </div>
      <div className="space-y-3">
        <div><label className="label-odoo">Fecha</label>{readOnly ? <div className="text-[13px] py-1.5 px-1 text-foreground">{fmtDate(form.fecha)}</div> : <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />}</div>
        <div>{renderEntrega()}</div>
        <div><label className="label-odoo">Folio</label><div className="text-[13px] text-muted-foreground py-1.5 px-1">{form.folio || (isNew ? 'Se asigna al guardar' : '—')}</div></div>
      </div>
      <div className="space-y-3">
        <div><label className="label-odoo label-required">Almacén</label>{renderAlmacen()}</div>
        {renderDescuentoExtra()}
        {renderSaldo()}
      </div>
    </div>
  );
}
