import { supabase } from '@/lib/supabase';
import { generarYSubirReciboCobro } from '@/lib/cobroReciboPdf';

/**
 * Genera el PDF del recibo, lo sube al bucket y dispara el envío por
 * email + WhatsApp a través de la edge function `send-cobro-recibo`.
 *
 * Fire-and-forget: nunca lanza. Cualquier fallo se loggea en consola y
 * queda registrado en `cobros.notif_*` por la edge function.
 */
export async function enviarReciboCobro(cobroId: string, empresaId: string): Promise<void> {
  try {
    if (!cobroId || !empresaId) return;
    // Generación de PDF + subida en cliente (mantiene la edge function liviana)
    const pdfUrl = await generarYSubirReciboCobro(cobroId, empresaId).catch(() => null);

    await supabase.functions.invoke('send-cobro-recibo', {
      body: { cobro_id: cobroId, pdf_url: pdfUrl },
    });
  } catch (e) {
    console.error('enviarReciboCobro error', e);
  }
}
