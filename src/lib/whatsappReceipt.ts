import { supabase } from '@/lib/supabase';
import type { TicketData } from '@/lib/ticketHtml';
import { construirModeloTicket } from '@/lib/ticketModelo';
import { ticketATexto } from '@/lib/ticketLayout';
import { generarTicketPdf, nombreArchivoTicket } from '@/lib/ticketPdf';
import { sendDocumentWhatsApp } from '@/lib/whatsappDocument';

interface SendReceiptParams {
  data: TicketData;
  empresaId: string;
  phone: string;
  referencia_id?: string;
  tipo?: string;
  currencySymbol?: string;
  /** Ancho del ticket del diseñador ('58' | '80'); por omisión 80 mm. */
  ticketAncho?: string | null;
}

/**
 * Envía el ticket por WhatsApp como PDF generado por código (D-051) desde el
 * modelo único (mismos campos del diseñador que la impresión). Si el envío del
 * PDF falla, manda el mismo ticket como texto.
 */
export async function sendReceiptWhatsApp(params: SendReceiptParams): Promise<{ success: boolean; error?: string }> {
  const { data, empresaId, phone, referencia_id, tipo = 'pedido_confirmado', currencySymbol: cs = '$', ticketAncho } = params;
  const fmt2 = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  try {
    const blob = await generarTicketPdf(data, { ticketAncho });
    const result = await sendDocumentWhatsApp({
      blob,
      fileName: nombreArchivoTicket(data.folio),
      empresaId,
      phone,
      caption: `✓ Comprobante\nFolio: ${data.folio}\nTotal: ${cs}${fmt2(data.total)}`,
      tipo,
      referencia_id,
    });
    if (!result.success) throw new Error(result.error || 'Error enviando WhatsApp');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error enviando WhatsApp';
    // Respaldo: el mismo ticket (modelo único) como texto.
    try {
      const { error: fnErr } = await supabase.functions.invoke('whatsapp-sender', {
        body: { action: 'send-text', empresa_id: empresaId, phone, message: ticketATexto(construirModeloTicket(data)), tipo, referencia_id },
      });
      if (fnErr) return { success: false, error: `${message}. Tampoco se pudo enviar como texto: ${fnErr.message}` };
    } catch (fallbackErr) {
      const detalle = fallbackErr instanceof Error ? fallbackErr.message : 'error desconocido';
      return { success: false, error: `${message}. Tampoco se pudo enviar como texto: ${detalle}` };
    }
    return { success: false, error: `${message}. Se envió el ticket como texto.` };
  }
}
