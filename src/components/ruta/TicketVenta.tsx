import { Printer, Share2, X } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { buildTicketHTML } from '@/lib/ticketHtml';
import { generarTicketPdf, nombreArchivoTicket } from '@/lib/ticketPdf';
import { compartirPdf } from '@/lib/pdfAcciones';
import { printTicket } from '@/lib/printTicketUtil';
import { ticketVentaADatos, type TicketVentaDatos } from '@/lib/ticketVentaData';
import TicketHtmlVista from '@/components/ticket/TicketHtmlVista';

interface TicketVentaProps extends TicketVentaDatos {
  /** Ancho del diseñador ('58' | '80') para el PDF al compartir; por omisión 80 mm. */
  ticketAncho?: string | null;
  onPrintTicket?: () => void;
  onClose: () => void;
}

/**
 * Comprobante en pantalla tras la venta (ruta y POS). Muestra el ticket ÚNICO
 * (`buildTicketHTML` sobre `construirModeloTicket`): lo mismo que se imprime,
 * se comparte en PDF y se ve en la vista previa del diseñador.
 */
export default function TicketVenta(props: TicketVentaProps) {
  const { onPrintTicket, onClose, ticketAncho, ...datos } = props;
  // Las props llegan como objeto nuevo en cada render del padre; el ticket se
  // recalcula solo cuando cambia su contenido.
  const clave = JSON.stringify(datos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ticketData = useMemo(() => ticketVentaADatos(datos), [clave]);
  const html = useMemo(() => buildTicketHTML(ticketData), [ticketData]);

  const handlePrint = () => {
    printTicket(ticketData).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo imprimir el ticket');
    });
  };

  const handleShare = async () => {
    // Archivo PDF por código (D-051) con el mismo contenido y campos del
    // diseñador que el ticket impreso; si no se pueden compartir archivos, se descarga.
    try {
      const blob = await generarTicketPdf(ticketData, { ticketAncho });
      const r = await compartirPdf(blob, nombreArchivoTicket(ticketData.folio), `Ticket ${ticketData.folio}`);
      if (r === 'descargado') toast.success('Ticket descargado (PDF)');
    } catch (err) {
      toast.error(err instanceof Error ? `No se pudo generar el PDF: ${err.message}` : 'No se pudo generar el PDF');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 -ml-1" aria-label="Cerrar"><X className="h-5 w-5 text-foreground" /></button>
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

      <div className="flex-1 p-4 flex flex-col items-center">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-sm p-2">
          <TicketHtmlVista html={html} />
        </div>

        <button onClick={onClose}
          className="w-full max-w-sm mt-5 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">
          Listo
        </button>
      </div>
    </div>
  );
}
