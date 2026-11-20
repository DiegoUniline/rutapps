import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import TicketHtmlVista from '@/components/ticket/TicketHtmlVista';
import { buildTicketHTML } from '@/lib/ticketHtml';
import { buildTicketEjemplo, buildNotaEjemploParams } from '@/lib/ticketEjemplo';
import type { TicketCampos } from '@/lib/ticketModelo';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface TicketDisenadorPreviewProps {
  /** Datos de la empresa tal como están en el formulario (sin guardar). */
  form: Record<string, string>;
  logoPreview: string | null;
  campos: TicketCampos;
  ticketAncho: '58' | '80';
  moneda: string;
  empresaId: string;
}

/**
 * Vista previa del diseñador de ticket con el documento REAL:
 * - Ticket: `buildTicketHTML` sobre una venta de ejemplo fija, al instante.
 * - Nota de venta: el PDF carta real (`generarPedidoPdf`) con las mismas opciones;
 *   en escritorio se regenera solo al cambiar opciones; en teléfono, bajo demanda.
 */
export default function TicketDisenadorPreview({ form, logoPreview, campos, ticketAncho, moneda, empresaId }: TicketDisenadorPreviewProps) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'ticket' | 'nota'>('ticket');

  const ejemplo = useMemo(() => buildTicketEjemplo({
    nombre: form.nombre, razon_social: form.razon_social, rfc: form.rfc,
    direccion: form.direccion, colonia: form.colonia, ciudad: form.ciudad, estado: form.estado, cp: form.cp,
    telefono: form.telefono, email: form.email, notas_ticket: form.notas_ticket,
    logo_url: logoPreview, moneda, ticket_campos: campos,
  }), [form, logoPreview, moneda, campos]);

  // Ticket: mismas columnas que la impresora térmica (58 mm = 32, 80 mm = 48).
  const html = useMemo(() => buildTicketHTML(ejemplo, { columnas: ticketAncho === '80' ? 48 : 32 }), [ejemplo, ticketAncho]);

  /* ── Nota de venta (PDF real) ── */
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const peticion = useRef(0);

  const generarNota = async (): Promise<Blob | null> => {
    const id = ++peticion.current;
    setGenerando(true);
    try {
      const [{ generarPedidoPdf }, { loadLogoBase64 }] = await Promise.all([import('@/lib/pedidoPdf'), import('@/lib/pdfBase')]);
      const logo = campos.logo !== false && logoPreview ? await loadLogoBase64(logoPreview) : null;
      const blob = await generarPedidoPdf(buildNotaEjemploParams(ejemplo, logo));
      if (id !== peticion.current) return null; // llegó una versión más nueva
      setPdfBlob(blob);
      return blob;
    } catch (err) {
      toast.error(`No se pudo generar la nota: ${err instanceof Error ? err.message : 'error'}`);
      return null;
    } finally {
      if (id === peticion.current) setGenerando(false);
    }
  };

  // Escritorio: la nota real se regenera sola (con pausa) al cambiar opciones.
  useEffect(() => {
    if (tab !== 'nota' || isMobile) return;
    const t = setTimeout(() => { void generarNota(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isMobile, ejemplo]);

  useEffect(() => {
    if (!pdfBlob) { setPdfUrl(null); return; }
    const url = URL.createObjectURL(pdfBlob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  const verNotaReal = async () => {
    const blob = await generarNota();
    if (blob) setModalAbierto(true);
  };

  const tabBtn = (val: 'ticket' | 'nota', label: string, Icon: typeof Receipt) => (
    <button
      type="button"
      onClick={() => setTab(val)}
      aria-pressed={tab === val}
      className={cn(
        'flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 h-9 rounded-md text-[12px] font-medium transition-colors',
        tab === val ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Vista previa en tiempo real</span>
      </div>
      <div className="flex gap-1 mb-3">
        {tabBtn('ticket', `Ticket ${ticketAncho} mm`, Receipt)}
        {tabBtn('nota', 'Nota de venta', FileText)}
      </div>

      {tab === 'ticket' ? (
        <div className="p-3 bg-muted/40 rounded-lg border border-border">
          <TicketHtmlVista html={html} />
          <p className="text-[11px] text-muted-foreground mt-3">
            Venta de ejemplo con tus datos. Es el mismo ticket que se imprime, se ve tras la venta y se manda por WhatsApp.
          </p>
        </div>
      ) : (
        <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-3">
          <p className="text-[11px] text-muted-foreground">
            La nota de venta carta (PDF) obedece las mismas opciones; conserva su diseño en blanco y negro.
          </p>
          {!isMobile && (
            <div className="relative bg-card rounded-md border border-border overflow-hidden h-[560px]">
              {pdfUrl && <iframe title="Nota de venta de ejemplo" src={`${pdfUrl}#toolbar=0&view=FitH`} className="w-full h-full" />}
              {generando && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/60">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
          <Button type="button" variant="outline" className="btn-pdf w-full sm:w-auto" onClick={verNotaReal} disabled={generando}>
            {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Ver nota real (PDF)
          </Button>
        </div>
      )}

      <DocumentPreviewModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        pdfBlob={pdfBlob}
        fileName="nota-de-venta-ejemplo.pdf"
        empresaId={empresaId}
      />
    </div>
  );
}
