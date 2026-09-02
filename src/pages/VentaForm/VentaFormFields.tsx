import { useIsMobile } from '@/hooks/use-mobile';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useCurrency } from '@/hooks/useCurrency';
import SearchableSelect from '@/components/SearchableSelect';
import { cn, fmtDate } from '@/lib/utils';
import { AlertTriangle, FileText } from 'lucide-react';
import { useAllListasPrecios } from '@/hooks/useData';
import { useVendedores } from '@/hooks/useClientes';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  form: Record<string, any>;
  readOnly: boolean;
  isNew: boolean;
  clienteOptions: { value: string; label: string }[];
  tarifaOptions: { value: string; label: string }[];
  almacenOptions: { value: string; label: string }[];
  clienteNombre?: string;
  clienteNotasFiscales?: string;
  clienteRequiereFactura?: boolean;
  clienteRfc?: string;
  totalPagado: number;
  saldoPendiente: number;
  canEditCondicion?: boolean;
  set: (field: string, val: any) => void;
  onClienteChange: (cId: string) => void;
}

export function VentaFormFields({ form, readOnly, isNew, clienteOptions, tarifaOptions, almacenOptions, clienteNombre, clienteNotasFiscales, clienteRequiereFactura = false, clienteRfc, totalPagado, saldoPendiente, canEditCondicion = true, set, onClienteChange }: Props) {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const { data: listasPrecios } = useAllListasPrecios(empresa?.id);
  const { data: vendedoresList } = useVendedores();

  const vendedorOptions = (vendedoresList ?? []).map((v: any) => ({ value: v.id, label: v.nombre }));
  const vendedorNombre = (form as any).vendedores?.nombre
    ?? vendedorOptions.find(v => v.value === form.vendedor_id)?.label
    ?? '—';

  const renderVendedor = () => readOnly
    ? <div className="text-[13px] py-1.5 px-1 text-foreground">{vendedorNombre}</div>
    : <SearchableSelect options={vendedorOptions} value={form.vendedor_id ?? ''} onChange={val => set('vendedor_id', val || null)} placeholder="Buscar vendedor..." />;

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
          <button key={t} onClick={() => {
            set('tipo', t);
            // La condición de pago la manda el cliente; solo autopisamos si aún no hay cliente.
            if (canEditCondicion && !form.cliente_id) set('condicion_pago', t === 'pedido' ? 'por_definir' : 'contado');
            set('entrega_inmediata', t === 'venta_directa');
          }}
            className={cn("flex-1 py-1.5 text-[12px] font-medium rounded border transition-colors", form.tipo === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary")}>
            {t === 'pedido' ? 'Pedido' : 'Venta directa'}
          </button>
        ))}
      </div>
    );

  const renderCondicion = () => (readOnly || !canEditCondicion)
    ? (
      <div className="text-[13px] py-1.5 px-1 text-foreground capitalize flex items-center gap-1.5">
        <span>{form.condicion_pago}</span>
        {!readOnly && !canEditCondicion && (
          <span className="text-[10px] text-muted-foreground italic">(según cliente)</span>
        )}
      </div>
    )
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
      {form.cliente_id && clienteRequiereFactura && (
        <div className={cn(
          'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11.5px]',
          clienteRfc
            ? 'border-sky-300 bg-sky-50 text-sky-900'
            : 'border-destructive/40 bg-destructive/10 text-destructive',
        )}>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            {clienteRfc ? <FileText className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            Requiere factura
          </span>
          <span className="font-mono font-semibold whitespace-nowrap">
            {clienteRfc ? `RFC: ${clienteRfc.toUpperCase()}` : 'RFC pendiente'}
          </span>
        </div>
      )}
      {form.cliente_id && clienteNotasFiscales && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="whitespace-pre-wrap leading-snug">
            <span className="font-semibold">Observación del cliente:</span> {clienteNotasFiscales}
          </div>
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

  const isCerrado = !!(form as any).cerrado_at;
  const totalMostrar = isCerrado
    ? Number((form as any).total_efectivo ?? form.total ?? 0)
    : Number(form.total ?? 0);
  const renderSaldo = () => !isNew && form.status !== 'borrador' && (
    <div className="bg-card border border-border rounded-md p-2.5 space-y-0.5 text-[13px]">
      <div className="flex justify-between">
        <span className="text-muted-foreground inline-flex items-center gap-1">
          Total
          {isCerrado && Number(form.total ?? 0) !== totalMostrar && (
            <span className="text-[10px] text-warning font-semibold">(cerrado)</span>
          )}
        </span>
        <span className="font-medium">{fmt(totalMostrar)}</span>
      </div>
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


  if (isMobile) {
    return (
      <div className="space-y-3">
        <div><label className="label-odoo">Tipo</label>{renderTipo()}</div>
        <div><label className="label-odoo label-required">Cliente</label>{renderCliente()}</div>
        <div><label className="label-odoo">Vendedor</label>{renderVendedor()}</div>
        <div><label className="label-odoo">Condición de pago</label>{renderCondicion()}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label-odoo">Fecha</label>{readOnly ? <div className="text-[13px] py-1.5 px-1 text-foreground">{fmtDate(form.fecha)}</div> : <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />}</div>
          <div>{renderEntrega()}</div>
        </div>
        <div><label className="label-odoo label-required">Almacén</label>{renderAlmacen()}</div>
        {renderSaldo()}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-x-3 gap-y-2">
      {/* Fila principal: lo necesario para comenzar a capturar productos. */}
      <div className="col-span-12 md:col-span-6 lg:col-span-3">
        <label className="label-odoo label-required">Cliente</label>
        {renderCliente()}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-2">
        <label className="label-odoo">Tipo</label>
        {renderTipo()}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-2">
        <label className="label-odoo label-required">Almacén</label>
        {renderAlmacen()}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-3">
        <label className="label-odoo">Condición de pago</label>
        {renderCondicion()}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-2">
        <label className="label-odoo">Fecha</label>
        {readOnly
          ? <div className="text-[13px] py-1.5 px-1 text-foreground">{fmtDate(form.fecha)}</div>
          : <OdooDatePicker value={form.fecha} onChange={v => set('fecha', v)} />}
      </div>

      {/* Segunda fila: únicamente los datos operativos restantes. */}
      <div className="col-span-12 md:col-span-6 lg:col-span-6">
        <label className="label-odoo">Vendedor</label>
        {renderVendedor()}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-6">
        {renderEntrega()}
      </div>

      {!isNew && form.status !== 'borrador' && (
        <div className="col-span-12 lg:col-start-9 lg:col-span-4">
          {renderSaldo()}
        </div>
      )}
    </div>
  );

}
