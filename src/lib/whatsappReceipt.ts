import { toPng } from 'html-to-image';
import { supabase } from '@/lib/supabase';
import { buildTicketHTML, type TicketData } from '@/lib/ticketHtml';

interface SendReceiptParams {
  data: TicketData;
  empresaId: string;
  phone: string;
  referencia_id?: string;
  tipo?: string;
}

/**
 * Generate receipt image using the unified ticket template,
 * upload to Storage, send via WhatsApp, and cleanup.
 */
export async function sendReceiptWhatsApp(params: SendReceiptParams): Promise<{ success: boolean; error?: string }> {
  const { data, empresaId, phone, referencia_id, tipo = 'pedido_confirmado' } = params;

  // 1. Build HTML element off-screen
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.innerHTML = buildTicketHTML(data);
  document.body.appendChild(container);

  let storagePath = '';

  try {
    // Wait for images and layout
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300))));

    // 2. Convert to PNG
    const dataUrl = await toPng(container.firstElementChild as HTMLElement, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: '#ffffff',
      style: { opacity: '1' },
    });

    const blob = await fetch(dataUrl).then(r => r.blob());

    // 3. Upload to Storage
    const fileName = `whatsapp/ticket-${Date.now()}.png`;
    storagePath = fileName;
    const { error: upErr } = await supabase.storage
      .from('empresa-assets')
      .upload(fileName, blob, { contentType: 'image/png', upsert: true });

    if (upErr) throw new Error(`Error subiendo imagen: ${upErr.message}`);

    // 4. Get public URL
    const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // 5. Send via edge function
    const fmt2 = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const { data: resp, error: fnErr } = await supabase.functions.invoke('whatsapp-sender', {
      body: {
        action: 'send-image',
        empresa_id: empresaId,
        phone,
        url: publicUrl,
        caption: `✓ Comprobante\nFolio: ${data.folio}\nTotal: $${fmt2(data.total)}`,
        tipo,
        referencia_id,
      },
    });

    if (fnErr) throw new Error(fnErr.message);
    if (resp && !resp.success) throw new Error(resp.error || 'Error enviando WhatsApp');

    return { success: true };
  } catch (err: any) {
    // Fallback: send as text
    try {
      const fmt2 = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const textMsg = `✓ Comprobante\n` +
        `Folio: ${data.folio}\nCliente: ${data.clienteNombre}\n` +
        data.lineas.map(l => `${l.cantidad}x ${l.nombre} $${fmt2(l.total)}`).join('\n') +
        `\n─────────\nTOTAL: $${fmt2(data.total)}`;

      await supabase.functions.invoke('whatsapp-sender', {
        body: { action: 'send-text', empresa_id: empresaId, phone, message: textMsg, tipo, referencia_id },
      });
    } catch (_) { /* ignore fallback error */ }

    return { success: false, error: err.message };
  } finally {
    document.body.removeChild(container);
    // Cleanup storage after 30s
    if (storagePath) {
      setTimeout(async () => {
        await supabase.storage.from('empresa-assets').remove([storagePath]);
      }, 30000);
    }
  }
}
