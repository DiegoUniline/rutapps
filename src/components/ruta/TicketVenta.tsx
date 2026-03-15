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

  const handlePrint = () => {
    if (!ticketRef.current) return;

    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) return;

    const content = ticketRef.current.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${folio}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: 80mm;
            padding: 4mm;
            color: #000;
            background: #fff;
          }
          .ticket-print-zone { width: 100%; }
          .ticket-print-zone img { max-height: 40px; max-width: 50mm; display: block; margin: 0 auto 4px; }
          .ticket-header { text-align: center; margin-bottom: 6px; }
          .ticket-header .empresa-nombre { font-size: 14px; font-weight: bold; }
          .ticket-header .empresa-info { font-size: 10px; color: #444; }
          .ticket-sep { border-top: 1px dashed #000; margin: 4px 0; }
          .ticket-row { display: flex; justify-content: space-between; font-size: 12px; line-height: 1.5; }
          .ticket-row.bold { font-weight: bold; }
          .ticket-row .label { color: #444; }
          .ticket-products .product-line { display: flex; justify-content: space-between; font-size: 11px; line-height: 1.5; }
          .ticket-products .product-line .name { flex: 1; margin-right: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .ticket-products .section-title { font-size: 10px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 2px; color: #444; }
          .ticket-total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
          .ticket-footer { text-align: center; font-size: 9px; color: #666; margin-top: 8px; padding-top: 4px; border-top: 1px dashed #000; }
          .cambio-tag { font-size: 10px; color: #666; }
          @media print {
            body { width: 80mm; }
          }
        </style>
      </head>
      <body>
        <div class="ticket-print-zone">${content}</div>
        <script>
          window.onload = function() { window.print(); window.close(); };
        </script>
      </body>
      </html>
    `);
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
      '─'.repeat(30),
      ...lineas.map(l =>
        `${l.cantidad}x ${l.nombre}${l.esCambio ? ' (CAMBIO)' : ''} $${fmt(l.total)}`
      ),
      '─'.repeat(30),
      `Subtotal: $${fmt(subtotal)}`,
      iva > 0 ? `IVA: $${fmt(iva)}` : '',
      ieps > 0 ? `IEPS: $${fmt(ieps)}` : '',
      `TOTAL: $${fmt(total)}`,
      `Pago: ${condicionPago === 'credito' ? 'Crédito' : condicionPago === 'contado' ? 'Contado' : 'Por definir'}`,
      metodoPago ? `Método: ${metodoPago}` : '',
      montoRecibido ? `Recibido: $${fmt(montoRecibido)}` : '',
      cambio && cambio > 0 ? `Cambio: $${fmt(cambio)}` : '',
      '',
      'Elaborado por Uniline — Innovación en la nube',
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: `Ticket ${folio}`, text });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 -ml-1"><X className="h-5 w-5 text-foreground" /></button>
          <h1 className="text-[16px] font-bold text-foreground">Comprobante</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/10 text-foreground text-[12px] font-semibold active:scale-95 transition-transform"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold active:scale-95 transition-transform"
          >
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col items-center">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Header with total — screen only */}
          <div className="bg-primary px-5 py-5 text-center print:hidden">
            <div className="w-11 h-11 bg-primary-foreground/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <Check className="h-6 w-6 text-primary-foreground" />
            </div>
            <p className="text-primary-foreground/80 text-[12px] font-medium">Venta registrada</p>
            <p className="text-primary-foreground text-[28px] font-bold mt-0.5">$ {fmt(total)}</p>
          </div>

          {/* Printable ticket content */}
          <div ref={ticketRef}>
            {/* Company info with logo */}
            <div className="ticket-header px-5 pt-4 pb-3 text-center border-b border-dashed border-border">
              {empresa.logo_url && (
                <img
                  src={empresa.logo_url}
                  alt={empresa.nombre}
                  className="h-10 max-w-[140px] object-contain mx-auto mb-2"
                />
              )}
              <p className="empresa-nombre text-[13px] font-bold text-foreground">{empresa.nombre}</p>
              {empresa.rfc && <p className="empresa-info text-[10px] text-muted-foreground mt-0.5">RFC: {empresa.rfc}</p>}
              {empresa.direccion && <p className="empresa-info text-[10px] text-muted-foreground mt-0.5">{empresa.direccion}</p>}
              {empresa.telefono && <p className="empresa-info text-[10px] text-muted-foreground">Tel: {empresa.telefono}</p>}
            </div>

            <div className="ticket-sep" />

            {/* Sale info */}
            <div className="px-5 py-3 space-y-1.5 border-b border-border">
              <div className="ticket-row bold"><span className="label">Folio</span><span>{folio}</span></div>
              <div className="ticket-row"><span className="label">Fecha</span><span>{fecha}</span></div>
              <div className="ticket-row"><span className="label">Cliente</span><span>{clienteNombre}</span></div>
              <div className="ticket-row"><span className="label">Pago</span><span>{condicionPago === 'credito' ? 'Crédito' : condicionPago === 'contado' ? 'Contado' : 'Por definir'}</span></div>
              {metodoPago && <div className="ticket-row"><span className="label">Método</span><span>{metodoPago}</span></div>}
            </div>

            <div className="ticket-sep" />

            {/* Products */}
            <div className="ticket-products px-5 py-3 border-b border-border">
              <p className="section-title text-[10px] text-muted-foreground uppercase font-semibold mb-2 tracking-wide">Productos</p>
              {lineas.map((l, i) => (
                <div key={i} className="product-line flex justify-between text-[12px] py-0.5">
                  <span className="name text-foreground truncate flex-1 mr-2">
                    {l.cantidad}x {l.nombre}
                    {l.esCambio && <span className="cambio-tag text-muted-foreground ml-1">(cambio)</span>}
                  </span>
                  <span className="text-foreground font-medium shrink-0">$ {fmt(l.total)}</span>
                </div>
              ))}
            </div>

            <div className="ticket-sep" />

            {/* Totals */}
            <div className="px-5 py-3 space-y-1">
              <div className="ticket-row"><span className="label text-muted-foreground">Subtotal</span><span className="text-foreground">$ {fmt(subtotal)}</span></div>
              <div className="ticket-row"><span className="label text-muted-foreground">IVA</span><span className="text-foreground">$ {fmt(iva)}</span></div>
              {ieps > 0 && (
                <div className="ticket-row"><span className="label text-muted-foreground">IEPS</span><span className="text-foreground">$ {fmt(ieps)}</span></div>
              )}
              <div className="ticket-total-row">
                <span>Total</span>
                <span>$ {fmt(total)}</span>
              </div>
              {montoRecibido != null && montoRecibido > 0 && (
                <>
                  <div className="ticket-row"><span className="label text-muted-foreground">Recibido</span><span className="text-foreground">$ {fmt(montoRecibido)}</span></div>
                  {(cambio ?? 0) > 0 && (
                    <div className="ticket-row"><span className="label text-muted-foreground">Cambio</span><span className="text-primary font-bold">$ {fmt(cambio!)}</span></div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="ticket-footer px-5 py-3 border-t border-border text-center">
              <p className="text-[9px] text-muted-foreground">Elaborado por Uniline — Innovación en la nube</p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full max-w-sm mt-5 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
