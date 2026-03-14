import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Package, FileText, Banknote, Calendar, MapPin } from 'lucide-react';
import { useVenta } from '@/hooks/useVentas';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  confirmado: 'bg-primary/10 text-primary',
  entregado: 'bg-green-100 text-green-700',
  facturado: 'bg-green-100 text-green-700',
  cancelado: 'bg-destructive/10 text-destructive',
};

export default function RutaVentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: venta, isLoading } = useVenta(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-[13px]">Cargando...</p>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-[13px]">Venta no encontrada</p>
        <button onClick={() => navigate(-1)} className="text-primary text-[13px] font-medium">Volver</button>
      </div>
    );
  }

  const lineas = (venta as any).venta_lineas ?? [];
  const clienteNombre = (venta as any).clientes?.nombre ?? 'Sin cliente';
  const vendedorNombre = (venta as any).vendedores?.nombre ?? '—';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-foreground truncate">{venta.folio ?? 'Sin folio'}</h1>
          <p className="text-[11px] text-muted-foreground">{venta.tipo === 'venta_directa' ? 'Venta directa' : 'Pedido'}</p>
        </div>
        <span className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium', statusColors[venta.status] ?? '')}>
          {venta.status}
        </span>
      </div>

      <div className="p-4 space-y-4 pb-8">
        {/* Total card */}
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">Total</p>
          <p className="text-[28px] font-bold text-foreground">
            $ {(venta.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          {venta.condicion_pago === 'credito' && (venta.saldo_pendiente ?? 0) > 0 && (
            <p className="text-[12px] text-destructive font-medium mt-1">
              Saldo pendiente: $ {(venta.saldo_pendiente ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Info rows */}
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          <InfoRow icon={User} label="Cliente" value={clienteNombre} />
          <InfoRow icon={Calendar} label="Fecha" value={venta.fecha} />
          {venta.fecha_entrega && <InfoRow icon={Calendar} label="Entrega" value={venta.fecha_entrega} />}
          <InfoRow icon={Banknote} label="Pago" value={venta.condicion_pago} />
          <InfoRow icon={FileText} label="Vendedor" value={vendedorNombre} />
        </div>

        {/* Lines */}
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Package className="h-4 w-4 text-muted-foreground" />
            Productos ({lineas.length})
          </h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {lineas.length === 0 && (
              <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos</p>
            )}
            {lineas.map((l: any) => (
              <div key={l.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {l.productos?.nombre ?? l.descripcion ?? '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.cantidad} × $ {(l.precio_unitario ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      {l.unidades?.abreviatura ? ` / ${l.unidades.abreviatura}` : ''}
                    </p>
                  </div>
                  <p className="text-[14px] font-bold text-foreground shrink-0">
                    $ {(l.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals breakdown */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <TotalRow label="Subtotal" value={venta.subtotal ?? 0} />
          {(venta.descuento_total ?? 0) > 0 && <TotalRow label="Descuento" value={-(venta.descuento_total ?? 0)} />}
          {(venta.iva_total ?? 0) > 0 && <TotalRow label="IVA" value={venta.iva_total ?? 0} />}
          {(venta.ieps_total ?? 0) > 0 && <TotalRow label="IEPS" value={venta.ieps_total ?? 0} />}
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="text-[14px] font-bold text-foreground">Total</span>
            <span className="text-[14px] font-bold text-foreground">
              $ {(venta.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Notes */}
        {venta.notas && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[11px] text-muted-foreground mb-1">Notas</p>
            <p className="text-[13px] text-foreground">{venta.notas}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-[12px] text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-foreground truncate capitalize">{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground">
        $ {value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}
