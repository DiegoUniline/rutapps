import { Check, Printer, Share2, X } from 'lucide-react';
import { useRef } from 'react';

interface TicketVentaProps {
  empresa: { nombre: string; telefono?: string | null; direccion?: string | null; logo_url?: string | null; rfc?: string | null };
  folio: string;
  fecha: string;
  clienteNombre: string;
  lineas: { nombre: string; cantidad: number; precio: number; total: number; esCambio?: boolean }[];
  subtotal: number;
  iva: number;
  ieps?: number;
  total: number;
  condicionPago: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function TicketVenta(props: TicketVentaProps) {
  const {
    empresa, folio, fecha, clienteNombre, lineas,
    subtotal, iva, ieps = 0, total, condicionPago, metodoPago,
    montoRecibido, cambio, onClose,
  } = props;

  const ticketRef = useRef<HTMLDivElement>(null);

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
      ...lineas.map(l =>
        `${l.cantidad}x ${l.nombre}${l.esCambio ? ' (CAMBIO)' : ''} $${fmt(l.total)}`
      ),
      '─'.repeat(30),
      `Subtotal: $${fmt(subtotal)}`,
      iva > 0 ? `IVA: $${fmt(iva)}` : '',
      ieps > 0 ? `IEPS: $${fmt(ieps)}` : '',
      `TOTAL: $${fmt(total)}`,
      montoRecibido ? `Recibido: $${fmt(montoRecibido)}` : '',
      cambio && cambio > 0 ? `Cambio: $${fmt(cambio)}` : '',
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
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/10 text-foreground text-[12px] font-semibold active:scale-95 transition-transform">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          <button onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold active:scale-95 transition-transform">
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </button>
        </div>
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
            <div className="px-5 py-2 space-y-0.5">
              <div className="tk-row flex justify-between text-[10px]">
                <span className="lbl font-bold text-foreground">Folio</span>
                <span className="val text-muted-foreground font-mono">{folio}</span>
              </div>
              <div className="tk-row flex justify-between text-[10px]">
                <span className="lbl font-bold text-foreground">Fecha</span>
                <span className="val text-muted-foreground">{fecha}</span>
              </div>
              <div className="tk-row flex justify-between text-[10px]">
                <span className="lbl font-bold text-foreground">Cliente</span>
                <span className="val text-muted-foreground truncate ml-3 text-right">{clienteNombre}</span>
              </div>
              <div className="tk-row flex justify-between text-[10px]">
                <span className="lbl font-bold text-foreground">Pago</span>
                <span className="val text-muted-foreground">{pagoLabel}</span>
              </div>
              {metodoPago && (
                <div className="tk-row flex justify-between text-[10px]">
                  <span className="lbl font-bold text-foreground">Método</span>
                  <span className="val text-muted-foreground capitalize">{metodoPago}</span>
                </div>
              )}
            </div>

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Products — main section */}
            <div className="px-5 py-2">
              <p className="tk-section text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Productos</p>
              <div className="space-y-0.5">
                {lineas.map((l, i) => (
                  <div key={i} className={`tk-prod flex justify-between items-baseline text-[11px] py-px ${l.esCambio ? 'cambio' : ''}`}>
                    <span className="nm text-foreground font-medium flex-1 mr-2 truncate">
                      {l.cantidad}x {l.nombre}
                      {l.esCambio && <span className="text-muted-foreground text-[9px] ml-1 italic">(cambio)</span>}
                    </span>
                    <span className="pr text-foreground font-semibold tabular-nums shrink-0">
                      ${fmt(l.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Totals */}
            <div className="px-5 py-2 space-y-0.5">
              <div className="tk-tot-row flex justify-between text-[10px]">
                <span className="lbl text-muted-foreground">Subtotal</span>
                <span className="val text-foreground tabular-nums">${fmt(subtotal)}</span>
              </div>
              {iva > 0 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground">IVA</span>
                  <span className="val text-foreground tabular-nums">${fmt(iva)}</span>
                </div>
              )}
              {ieps > 0 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground">IEPS</span>
                  <span className="val text-foreground tabular-nums">${fmt(ieps)}</span>
                </div>
              )}
              <div className="tk-grand flex justify-between items-baseline pt-1.5 mt-1 border-t border-dashed border-border">
                <span className="text-[12px] font-bold text-foreground">Total</span>
                <span className="text-[15px] font-bold text-primary tabular-nums">${fmt(total)}</span>
              </div>
              {montoRecibido != null && montoRecibido > 0 && (
                <div className="pt-1 space-y-0.5">
                  <div className="tk-tot-row flex justify-between text-[10px]">
                    <span className="lbl text-muted-foreground">Recibido</span>
                    <span className="val text-foreground tabular-nums">${fmt(montoRecibido)}</span>
                  </div>
                  {(cambio ?? 0) > 0 && (
                    <div className="tk-tot-row flex justify-between text-[10px]">
                      <span className="lbl text-muted-foreground">Cambio</span>
                      <span className="val text-primary font-bold tabular-nums">${fmt(cambio!)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

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
