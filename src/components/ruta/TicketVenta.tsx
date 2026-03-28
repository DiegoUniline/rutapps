import { Check, Printer, Share2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useCurrency } from '@/hooks/useCurrency';

interface DevolucionTicketItem {
  nombre: string;
  cantidad: number;
  motivo: string;
  accion: string;
  monto: number;
}

interface TicketVentaProps {
  empresa: { nombre: string; telefono?: string | null; direccion?: string | null; logo_url?: string | null; rfc?: string | null; moneda?: string | null };
  folio: string;
  fecha: string;
  clienteNombre: string;
  lineas: { nombre: string; cantidad: number; precio: number; subtotal?: number; iva_pct?: number; iva_monto?: number; ieps_pct?: number; ieps_monto?: number; descuento_pct?: number; total: number; esCambio?: boolean }[];
  subtotal: number;
  iva: number;
  ieps?: number;
  descuentoDevolucion?: number;
  devoluciones?: DevolucionTicketItem[];
  total: number;
  condicionPago: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  saldoAnterior?: number;
  pagoAplicado?: number;
  saldoNuevo?: number;
  promociones?: { descripcion: string; descuento: number }[];
  onPrintTicket?: () => void;
  onClose: () => void;
}

const MOTIVO_LABELS: Record<string, string> = {
  no_vendido: 'No vendido', vencido: 'Vencido', caducado: 'Caducado',
  danado: 'Dañado', cambio: 'Cambio', error_pedido: 'Error pedido', otro: 'Otro',
};
const ACCION_LABELS: Record<string, string> = {
  reposicion: 'Reposición', nota_credito: 'Nota crédito',
  devolucion_dinero: 'Dev. dinero', descuento_venta: 'Desc. venta',
};

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function TicketVenta(props: TicketVentaProps) {
  const {
    empresa, folio, fecha, clienteNombre, lineas,
    subtotal, iva, ieps = 0, descuentoDevolucion = 0, devoluciones = [],
    total, condicionPago, metodoPago,
    montoRecibido, cambio, saldoAnterior, pagoAplicado, saldoNuevo, promociones = [], onPrintTicket, onClose,
  } = props;

  const { symbol: cs } = useCurrency();
  const fmt = (n: number) => `${cs}${fmtNum(n)}`;

  const ticketRef = useRef<HTMLDivElement>(null);
  // 'ambos' = producto + totales, 'totales' = solo totales, 'ninguno' = sin impuestos
  const [taxMode, setTaxMode] = useState<'ambos' | 'totales' | 'ninguno'>('ambos');

  const pagoLabel = condicionPago === 'credito' ? 'Crédito' : condicionPago === 'contado' ? 'Contado' : 'Por definir';

  const handlePrint = () => {
    if (!ticketRef.current) return;
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) return;
    const content = ticketRef.current.innerHTML;
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ticket ${folio}</title>
<style>
@page{size:80mm auto;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;width:80mm;padding:3mm;color:#222;background:#fff;line-height:1.4}
.tk{width:100%}
.tk-logo{display:block;max-height:32px;max-width:44mm;margin:0 auto 3px}
.tk-center{text-align:center}
.tk-empresa{font-size:11px;font-weight:700}
.tk-sub{font-size:8px;color:#666}
.tk-dash{border-top:1px dashed #aaa;margin:5px 0}
.tk-row{display:flex;justify-content:space-between;font-size:9px;line-height:1.6}
.tk-row .lbl{font-weight:700;color:#333}
.tk-row .val{color:#444;text-align:right}
.tk-section{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#555;margin-bottom:3px}
.tk-prod{display:flex;justify-content:space-between;font-size:10px;line-height:1.5;padding:1px 0}
.tk-prod .nm{flex:1;margin-right:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.tk-prod .pr{font-weight:600;white-space:nowrap}
.tk-prod.cambio .nm{color:#888;font-style:italic}
.tk-tot-row{display:flex;justify-content:space-between;font-size:9px;line-height:1.6}
.tk-tot-row .lbl{color:#666}
.tk-tot-row .val{font-weight:500}
.tk-grand{display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px dashed #aaa;padding-top:4px;margin-top:3px}
.tk-footer{text-align:center;font-size:7px;color:#999;margin-top:6px;padding-top:4px;border-top:1px dashed #ccc}
.tk-dev{font-size:8px;line-height:1.5}
@media print{body{width:80mm}}
</style></head><body><div class="tk">${content}</div>
<script>window.onload=function(){window.print();window.close()}</script></body></html>`);
    printWindow.document.close();
  };

  const handleShare = async () => {
    const text = [
      empresa.nombre,
      empresa.rfc ? `RFC: ${empresa.rfc}` : '',
      empresa.direccion ?? '',
      empresa.telefono ? `Tel: ${empresa.telefono}` : '',
      '─'.repeat(30),
      `Folio: ${folio}`,
      `Fecha: ${fecha}`,
      `Cliente: ${clienteNombre}`,
      `Pago: ${pagoLabel}`,
      metodoPago ? `Método: ${metodoPago}` : '',
      '─'.repeat(30),
      ...lineas.map(l => {
        const taxes = [
          (l.iva_pct ?? 0) > 0 ? `IVA ${l.iva_pct}%` : '',
          (l.ieps_pct ?? 0) > 0 ? `IEPS ${l.ieps_pct}%` : '',
        ].filter(Boolean).join(' + ');
        return `${l.cantidad}x ${l.nombre}${l.esCambio ? ' (CAMBIO)' : ''} ${fmt(l.total)}${taxes ? ` [${taxes}]` : ''}`;
      }),
      '─'.repeat(30),
      `Subtotal: ${fmt(subtotal)}`,
      iva > 0 ? `IVA: ${fmt(iva)}` : '',
      ieps > 0 ? `IEPS: ${fmt(ieps)}` : '',
      descuentoDevolucion > 0 ? `Desc. devolución: -${fmt(descuentoDevolucion)}` : '',
      `TOTAL: ${fmt(total)}`,
      ...(devoluciones.length > 0 ? [
        '─'.repeat(30),
        'DEVOLUCIONES:',
        ...devoluciones.map(d => `  ${d.cantidad}x ${d.nombre} → ${ACCION_LABELS[d.accion] || d.accion} (${MOTIVO_LABELS[d.motivo] || d.motivo})`),
      ] : []),
      montoRecibido ? `Recibido: ${fmt(montoRecibido)}` : '',
      cambio && cambio > 0 ? `Cambio: ${fmt(cambio)}` : '',
      '',
      'Elaborado por Uniline — Innovación en la nube',
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: `Ticket ${folio}`, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 -ml-1"><X className="h-5 w-5 text-foreground" /></button>
          <h1 className="text-[16px] font-bold text-foreground">Comprobante</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrintTicket ?? handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/10 text-foreground text-[12px] font-semibold active:scale-95 transition-transform">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          <button onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold active:scale-95 transition-transform">
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </button>
        </div>
      </div>

      {/* Tax display mode selector */}
      <div className="px-4 pt-3 flex items-center justify-center gap-1">
        <span className="text-[11px] text-muted-foreground mr-1">Impuestos:</span>
        {([['ambos', 'Producto + Total'], ['totales', 'Solo total'], ['ninguno', 'No mostrar']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setTaxMode(val)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${taxMode === val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 flex flex-col items-center">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

          {/* ─── Printable ticket ─── */}
          <div ref={ticketRef}>
            {/* Company */}
            <div className="tk-center px-5 pt-4 pb-2">
              {empresa.logo_url && (
                <img src={empresa.logo_url} alt={empresa.nombre} className="tk-logo h-8 max-w-[120px] object-contain mx-auto mb-1" />
              )}
              <p className="tk-empresa text-[12px] font-bold text-foreground">{empresa.nombre}</p>
              {empresa.rfc && <p className="tk-sub text-[9px] text-muted-foreground">RFC: {empresa.rfc}</p>}
              {empresa.direccion && <p className="tk-sub text-[8px] text-muted-foreground mt-px">{empresa.direccion}</p>}
              {empresa.telefono && <p className="tk-sub text-[8px] text-muted-foreground">Tel: {empresa.telefono}</p>}
            </div>

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Sale details */}
            <div className="px-5 py-2 space-y-0.5 text-[10px]">
              <div className="flex gap-4">
                <span><span className="font-bold text-foreground">Folio </span><span className="text-muted-foreground font-mono">{folio}</span></span>
                <span><span className="font-bold text-foreground">Fecha </span><span className="text-muted-foreground">{fecha}</span></span>
              </div>
              <div>
                <span className="font-bold text-foreground">Cliente </span><span className="text-muted-foreground">{clienteNombre}</span>
              </div>
              <div className="flex gap-4">
                <span><span className="font-bold text-foreground">Pago </span><span className="text-muted-foreground">{pagoLabel}</span></span>
                {metodoPago && (
                  <span><span className="font-bold text-foreground">Método </span><span className="text-muted-foreground capitalize">{metodoPago}</span></span>
                )}
              </div>
            </div>

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Products */}
            <div className="px-5 py-2">
              <p className="tk-section text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Productos</p>
              <div className="space-y-1">
                {lineas.map((l, i) => (
                  <div key={i} className={`py-0.5 ${l.esCambio ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-baseline text-[11px]">
                      <span className="text-foreground font-medium flex-1 mr-2 truncate">
                        {l.cantidad}x {l.nombre}
                        {l.esCambio && <span className="text-muted-foreground text-[9px] ml-1 italic">(cambio)</span>}
                      </span>
                      <span className="text-foreground font-semibold tabular-nums shrink-0">
                        {fmt(l.total)}
                      </span>
                    </div>
                    {!l.esCambio && (
                      <div className="flex gap-2 text-[8px] text-muted-foreground mt-px">
                        <span>{fmt(l.precio)} c/u</span>
                        {(l.descuento_pct ?? 0) > 0 && <span className="text-primary">-{l.descuento_pct}% dto</span>}
                        {taxMode === 'ambos' && (l.iva_pct ?? 0) > 0 && <span>IVA {l.iva_pct}%{(l.iva_monto ?? 0) > 0 ? ` (${fmt(l.iva_monto!)})` : ''}</span>}
                        {taxMode === 'ambos' && (l.ieps_pct ?? 0) > 0 && <span>IEPS {l.ieps_pct}%{(l.ieps_monto ?? 0) > 0 ? ` (${fmt(l.ieps_monto!)})` : ''}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Devoluciones section */}
            {devoluciones.length > 0 && (
              <>
                <div className="tk-dash mx-5 border-t border-dashed border-border" />
                <div className="px-5 py-2">
                  <p className="tk-section text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Devoluciones</p>
                  <div className="space-y-0.5">
                    {devoluciones.map((d, i) => (
                      <div key={i} className="tk-dev text-[9px]">
                        <div className="flex justify-between">
                          <span className="text-foreground truncate flex-1 mr-2">{d.cantidad}x {d.nombre}</span>
                          <span className="text-muted-foreground shrink-0">{ACCION_LABELS[d.accion] || d.accion}</span>
                        </div>
                        <span className="text-[8px] text-muted-foreground italic">{MOTIVO_LABELS[d.motivo] || d.motivo}{d.monto > 0 ? ` · ${fmt(d.monto)}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Totals */}
            <div className="px-5 py-2 space-y-0.5">
              {taxMode !== 'ninguno' && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground">Subtotal</span>
                  <span className="val text-foreground tabular-nums">{fmt(subtotal)}</span>
                </div>
              )}
              {taxMode !== 'ninguno' && iva > 0 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground">IVA</span>
                  <span className="val text-foreground tabular-nums">{fmt(iva)}</span>
                </div>
              )}
              {taxMode !== 'ninguno' && ieps > 0 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground">IEPS</span>
                  <span className="val text-foreground tabular-nums">{fmt(ieps)}</span>
                </div>
              )}
              {descuentoDevolucion > 0 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-amber-600">Desc. devolución</span>
                  <span className="val text-amber-600 font-medium tabular-nums">-{fmt(descuentoDevolucion)}</span>
                </div>
              )}
              <div className="tk-grand flex justify-between items-baseline pt-1.5 mt-1 border-t border-dashed border-border">
                <span className="text-[12px] font-bold text-foreground">Total</span>
                <span className="text-[15px] font-bold text-primary tabular-nums">{fmt(total)}</span>
              </div>
              {montoRecibido != null && montoRecibido > 0 && (
                <div className="pt-1 space-y-0.5">
                  <div className="tk-tot-row flex justify-between text-[10px]">
                    <span className="lbl text-muted-foreground">Recibido</span>
                    <span className="val text-foreground tabular-nums">{fmt(montoRecibido)}</span>
                  </div>
                  {(cambio ?? 0) > 0 && (
                    <div className="tk-tot-row flex justify-between text-[10px]">
                      <span className="lbl text-muted-foreground">Cambio</span>
                      <span className="val text-primary font-bold tabular-nums">{fmt(cambio!)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Balance / Saldo */}
            {(saldoAnterior != null && saldoAnterior > 0) || (saldoNuevo != null && saldoNuevo > 0) ? (
              <>
                <div className="tk-dash mx-5 border-t border-dashed border-border" />
                <div className="px-5 py-2 space-y-0.5">
                  <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Estado de cuenta</p>
                  {saldoAnterior != null && saldoAnterior > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Saldo anterior</span>
                      <span className="text-foreground tabular-nums">{fmt(saldoAnterior)}</span>
                    </div>
                  )}
                  {pagoAplicado != null && pagoAplicado > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Pago aplicado</span>
                      <span className="text-green-600 font-medium tabular-nums">-{fmt(pagoAplicado)}</span>
                    </div>
                  )}
                  {condicionPago === 'credito' && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">+ Esta venta (crédito)</span>
                      <span className="text-foreground tabular-nums">{fmt(total)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] font-bold pt-1 border-t border-dashed border-border">
                    <span className="text-foreground">Nuevo saldo</span>
                    <span className={`tabular-nums ${(saldoNuevo ?? 0) > 0 ? 'text-destructive' : 'text-green-600'}`}>{fmt(saldoNuevo ?? 0)}</span>
                  </div>
                </div>
              </>
            ) : null}

            {/* Footer */}
            <div className="tk-footer px-5 py-2.5 border-t border-dashed border-border text-center">
              <p className="text-[8px] text-muted-foreground">Elaborado por Uniline — Innovación en la nube</p>
            </div>
          </div>
        </div>

        <button onClick={onClose}
          className="w-full max-w-sm mt-5 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">
          Listo
        </button>
      </div>
    </div>
  );
}
