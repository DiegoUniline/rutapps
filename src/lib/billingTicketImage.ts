import { toPng } from 'html-to-image';
import { supabase } from '@/lib/supabase';

/* ─── Types ─── */
export type BillingTicketType = 'pre_cobro' | 'cobro_exitoso' | 'cobro_fallido' | 'suspension';

export interface BillingTicketData {
  tipo: BillingTicketType;
  emoji: string;
  encabezado: string;
  campos: Record<string, boolean>;
  // Client data
  clienteNombre?: string;
  empresaNombre?: string;
  monto?: string;
  fechaCobro?: string;
  numUsuarios?: number;
  enlacePago?: string;
  enlaceFacturacion?: string;
  fechaVigencia?: string;
  diasGracia?: number;
}

/* ─── Color themes ─── */
const THEMES: Record<BillingTicketType, { bg: string; accent: string; badge: string; icon: string }> = {
  pre_cobro:     { bg: '#eff6ff', accent: '#2563eb', badge: '#dbeafe', icon: '🔔' },
  cobro_exitoso: { bg: '#f0fdf4', accent: '#16a34a', badge: '#dcfce7', icon: '✅' },
  cobro_fallido: { bg: '#fef2f2', accent: '#dc2626', badge: '#fee2e2', icon: '⚠️' },
  suspension:    { bg: '#fef2f2', accent: '#991b1b', badge: '#fee2e2', icon: '🔴' },
};

const STATUS_LABELS: Record<BillingTicketType, string> = {
  pre_cobro: 'RECORDATORIO DE COBRO',
  cobro_exitoso: 'PAGO CONFIRMADO',
  cobro_fallido: 'PAGO FALLIDO',
  suspension: 'CUENTA SUSPENDIDA',
};

/* ─── Build HTML ─── */
export function buildBillingTicketHTML(data: BillingTicketData): string {
  const theme = THEMES[data.tipo];
  const c = data.campos;
  const statusLabel = STATUS_LABELS[data.tipo];

  const rows: string[] = [];

  if (c.nombre_cliente && data.clienteNombre) {
    rows.push(row('Cliente', data.clienteNombre));
  }
  if (c.nombre_empresa && data.empresaNombre) {
    rows.push(row('Empresa', data.empresaNombre));
  }

  // Type-specific fields
  if (data.tipo === 'pre_cobro') {
    if (c.fecha_cobro && data.fechaCobro) rows.push(row('Fecha de cobro', data.fechaCobro));
    if (c.monto && data.monto) rows.push(row('Monto', data.monto, true));
    if (c.num_usuarios && data.numUsuarios) rows.push(row('Usuarios', `${data.numUsuarios} usuario(s)`));
    if (c.enlace_facturacion) rows.push(linkRow('Actualizar método de pago', data.enlaceFacturacion || 'https://rutapps.lovable.app/facturacion'));
  }

  if (data.tipo === 'cobro_exitoso') {
    if (c.monto && data.monto) rows.push(row('Monto pagado', data.monto, true));
    if (c.fecha_vigencia && data.fechaVigencia) rows.push(row('Vigente hasta', data.fechaVigencia));
  }

  if (data.tipo === 'cobro_fallido') {
    if (c.monto && data.monto) rows.push(row('Monto pendiente', data.monto, true));
    if (c.dias_gracia && data.diasGracia) rows.push(row('Plazo para pagar', `${data.diasGracia} días`));
    if (c.enlace_pago) rows.push(linkRow('Pagar ahora', data.enlacePago || 'https://rutapps.lovable.app/facturacion'));
    if (c.advertencia_suspension) rows.push(warningRow('Si no regularizas, tu acceso será suspendido.'));
  }

  if (data.tipo === 'suspension') {
    if (c.enlace_facturacion) rows.push(linkRow('Reactivar acceso', data.enlaceFacturacion || 'https://rutapps.lovable.app/facturacion'));
    if (c.mensaje_contacto) rows.push(infoRow('Si tienes dudas, contáctanos.'));
  }

  const despedida = (data.tipo === 'pre_cobro' || data.tipo === 'cobro_exitoso') && c.mensaje_despedida
    ? `<div style="text-align:center;margin-top:12px;font-size:12px;color:#666">
        ${data.tipo === 'pre_cobro' ? '¡Gracias por confiar en Rutapp! 🚀' : '¡Gracias por tu pago! 🎉'}
       </div>`
    : '';

  return `
    <div style="width:360px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
      <!-- Header -->
      <div style="background:${theme.accent};padding:18px 20px;text-align:center">
        <div style="font-size:28px;margin-bottom:4px">${data.emoji}</div>
        <div style="font-size:16px;font-weight:700;color:#fff;letter-spacing:0.5px">${data.encabezado}</div>
      </div>
      <!-- Status badge -->
      <div style="text-align:center;margin-top:-12px">
        <span style="display:inline-block;background:${theme.badge};color:${theme.accent};font-size:10px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:0.8px;border:1.5px solid ${theme.accent}20">
          ${statusLabel}
        </span>
      </div>
      <!-- Body -->
      <div style="padding:16px 20px">
        ${rows.join('')}
        ${despedida}
      </div>
      <!-- Footer -->
      <div style="background:#f8f9fa;padding:10px 20px;text-align:center;border-top:1px solid #eee">
        <div style="font-size:10px;color:#999;display:flex;align-items:center;justify-content:center;gap:4px">
          <span style="font-weight:600;color:${theme.accent}">Rutapp</span> · Elaborado por Uniline
        </div>
      </div>
    </div>
  `;
}

function row(label: string, value: string, bold = false): string {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0">
      <span style="font-size:12px;color:#666">${label}</span>
      <span style="font-size:13px;${bold ? 'font-weight:700;font-size:15px;color:#111' : 'font-weight:500;color:#333'}">${value}</span>
    </div>
  `;
}

function linkRow(label: string, url: string): string {
  return `
    <div style="margin-top:10px;text-align:center">
      <div style="display:inline-block;background:#2563eb;color:#fff;font-size:12px;font-weight:600;padding:8px 20px;border-radius:6px;text-decoration:none">
        💳 ${label}
      </div>
      <div style="font-size:10px;color:#999;margin-top:4px;word-break:break-all">${url}</div>
    </div>
  `;
}

function warningRow(text: string): string {
  return `
    <div style="margin-top:10px;padding:8px 12px;background:#fef3c7;border-radius:6px;border-left:3px solid #f59e0b">
      <span style="font-size:11px;color:#92400e">⚠️ ${text}</span>
    </div>
  `;
}

function infoRow(text: string): string {
  return `
    <div style="margin-top:10px;padding:8px 12px;background:#f0f9ff;border-radius:6px;border-left:3px solid #3b82f6">
      <span style="font-size:11px;color:#1e40af">ℹ️ ${text}</span>
    </div>
  `;
}

/* ─── Generate image and send via WhatsApp ─── */
export async function sendBillingTicketWhatsApp(params: {
  data: BillingTicketData;
  phone: string;
  waToken: string;
  customerEmail: string;
  textCaption?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, phone, waToken, customerEmail, textCaption } = params;
  const WHATSAPI_URL = 'https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy';

  // 1. Build HTML off-screen
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.innerHTML = buildBillingTicketHTML(data);
  document.body.appendChild(container);

  let storagePath = '';

  try {
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
    const fileName = `whatsapp/billing-ticket-${Date.now()}.png`;
    storagePath = fileName;
    const { error: upErr } = await supabase.storage
      .from('empresa-assets')
      .upload(fileName, blob, { contentType: 'image/png', upsert: true });

    if (upErr) throw new Error(`Error subiendo imagen: ${upErr.message}`);

    // 4. Get public URL
    const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // 5. Send image via WhatsAPI
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    const caption = textCaption || `${data.emoji} ${data.encabezado}`;

    const imgRes = await fetch(WHATSAPI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': waToken },
      body: JSON.stringify({ action: 'send-image', phone: cleanPhone, url: publicUrl, caption }),
    });

    if (!imgRes.ok) throw new Error(`WhatsAPI error: HTTP ${imgRes.status}`);

    // 6. Log to billing_notifications
    await supabase.from('billing_notifications').insert({
      customer_email: customerEmail,
      customer_phone: cleanPhone,
      channel: 'whatsapp',
      tipo: data.tipo,
      mensaje: caption,
      status: 'sent',
    } as any);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    document.body.removeChild(container);
    if (storagePath) {
      setTimeout(async () => {
        await supabase.storage.from('empresa-assets').remove([storagePath]);
      }, 30000);
    }
  }
}
