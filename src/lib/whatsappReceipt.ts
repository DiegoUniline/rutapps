import { toPng } from 'html-to-image';
import { supabase } from '@/lib/supabase';

interface ReceiptLine {
  nombre: string;
  cantidad: number;
  precio: number;
  total: number;
  esCambio?: boolean;
}

interface ReceiptData {
  empresa: { nombre: string; telefono?: string; direccion?: string; logo_url?: string };
  folio: string;
  fecha: string;
  clienteNombre: string;
  tipo: 'pedido_confirmado' | 'entrega_confirmada' | 'recibo_pago';
  lineas: ReceiptLine[];
  subtotal: number;
  iva: number;
  ieps?: number;
  total: number;
  condicionPago?: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
}

const TIPO_LABELS: Record<string, { badge: string; color: string }> = {
  pedido_confirmado: { badge: '✓ PEDIDO CONFIRMADO', color: '#2563eb' },
  entrega_confirmada: { badge: '✓ ENTREGA REALIZADA', color: '#16a34a' },
  recibo_pago: { badge: '✓ PAGO RECIBIDO', color: '#7c3aed' },
};

function buildReceiptHTML(data: ReceiptData): string {
  const { empresa, folio, fecha, clienteNombre, tipo, lineas, subtotal, iva, ieps, total, condicionPago, metodoPago, montoRecibido, cambio } = data;
  const label = TIPO_LABELS[tipo] || TIPO_LABELS.pedido_confirmado;

  const logoHtml = empresa.logo_url
    ? `<img src="${empresa.logo_url}" crossorigin="anonymous" style="max-height:80px;max-width:200px;margin:0 auto;display:block" />`
    : '';

  const lineasHtml = lineas.map(l => `
    <tr>
      <td style="padding:2px 0;font-size:11px">${l.esCambio ? '🔄 ' : ''}${l.nombre}</td>
      <td style="text-align:right;font-size:11px;white-space:nowrap">${l.cantidad}</td>
      <td style="text-align:right;font-size:11px;white-space:nowrap">$${l.precio.toFixed(2)}</td>
      <td style="text-align:right;font-size:11px;white-space:nowrap;font-weight:600">$${l.total.toFixed(2)}</td>
    </tr>
  `).join('');

  const pagoHtml = montoRecibido != null ? `
    <div style="margin-top:4px;font-size:11px">
      <div style="display:flex;justify-content:space-between"><span>Recibido:</span><span>$${montoRecibido.toFixed(2)}</span></div>
      ${(cambio ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Cambio:</span><span>$${cambio!.toFixed(2)}</span></div>` : ''}
    </div>
  ` : '';

  return `
    <div style="width:380px;padding:16px;font-family:'Courier New',monospace;background:#fff;color:#000">
      ${logoHtml}
      <div style="text-align:center;margin-top:8px">
        <div style="font-size:14px;font-weight:bold">${empresa.nombre}</div>
        ${empresa.telefono ? `<div style="font-size:10px;color:#666">${empresa.telefono}</div>` : ''}
        ${empresa.direccion ? `<div style="font-size:10px;color:#666">${empresa.direccion}</div>` : ''}
      </div>
      <div style="text-align:center;margin:10px 0;padding:4px 8px;background:${label.color};color:#fff;border-radius:4px;font-size:12px;font-weight:bold;display:inline-block;width:100%;box-sizing:border-box">
        ${label.badge}
      </div>
      <div style="border-top:1px dashed #999;border-bottom:1px dashed #999;padding:6px 0;margin:6px 0;font-size:11px">
        <div style="display:flex;justify-content:space-between"><span>Folio:</span><span style="font-weight:bold">${folio}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Fecha:</span><span>${fecha}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Cliente:</span><span>${clienteNombre}</span></div>
        ${condicionPago ? `<div style="display:flex;justify-content:space-between"><span>Pago:</span><span>${condicionPago}</span></div>` : ''}
        ${metodoPago ? `<div style="display:flex;justify-content:space-between"><span>Método:</span><span>${metodoPago}</span></div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px dashed #ccc">
          <th style="text-align:left;font-size:10px;padding:2px 0;color:#666">Producto</th>
          <th style="text-align:right;font-size:10px;padding:2px 0;color:#666">Cant</th>
          <th style="text-align:right;font-size:10px;padding:2px 0;color:#666">P.U.</th>
          <th style="text-align:right;font-size:10px;padding:2px 0;color:#666">Total</th>
        </tr></thead>
        <tbody>${lineasHtml}</tbody>
      </table>
      <div style="border-top:1px dashed #999;margin-top:6px;padding-top:6px;font-size:11px">
        <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>$${subtotal.toFixed(2)}</span></div>
        ${(ieps ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>IEPS:</span><span>$${ieps!.toFixed(2)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between"><span>IVA:</span><span>$${iva.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;margin-top:4px;border-top:2px solid #000;padding-top:4px">
          <span>TOTAL:</span><span>$${total.toFixed(2)}</span>
        </div>
        ${pagoHtml}
      </div>
      <div style="text-align:center;margin-top:12px;font-size:10px;color:#888;border-top:1px dashed #ccc;padding-top:8px">
        Gracias por su compra ❤️
      </div>
    </div>
  `;
}

/**
 * Generate receipt image, upload to Storage, send via WhatsApp, and cleanup.
 */
export async function sendReceiptWhatsApp(params: {
  data: ReceiptData;
  empresaId: string;
  phone: string;
  referencia_id?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, empresaId, phone, referencia_id } = params;

  // 1. Build HTML element off-screen
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.innerHTML = buildReceiptHTML(data);
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
    const label = TIPO_LABELS[data.tipo]?.badge || 'Ticket';
    const { data: resp, error: fnErr } = await supabase.functions.invoke('whatsapp-sender', {
      body: {
        action: 'send-image',
        empresa_id: empresaId,
        phone,
        url: publicUrl,
        caption: `${label}\nFolio: ${data.folio}\nTotal: $${data.total.toFixed(2)}`,
        tipo: data.tipo,
        referencia_id,
      },
    });

    if (fnErr) throw new Error(fnErr.message);
    if (resp && !resp.success) throw new Error(resp.error || 'Error enviando WhatsApp');

    return { success: true };
  } catch (err: any) {
    // Fallback: send as text
    try {
      const textMsg = `${TIPO_LABELS[data.tipo]?.badge || 'Ticket'}\n` +
        `Folio: ${data.folio}\nCliente: ${data.clienteNombre}\n` +
        data.lineas.map(l => `${l.cantidad}x ${l.nombre} $${l.total.toFixed(2)}`).join('\n') +
        `\n─────────\nTOTAL: $${data.total.toFixed(2)}`;

      await supabase.functions.invoke('whatsapp-sender', {
        body: { action: 'send-text', empresa_id: empresaId, phone, message: textMsg, tipo: data.tipo, referencia_id },
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
