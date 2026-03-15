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

const GRACE_DAYS = 3;

/* ─── Build text message ─── */
export function buildBillingTextMessage(data: BillingTicketData): string {
  const c = data.campos;
  const lines: string[] = [];
  lines.push(`${data.emoji} *${data.encabezado}*\n`);
  const greeting = c.nombre_cliente && data.clienteNombre ? `Hola ${data.clienteNombre}` : 'Hola';
  const empresaLine = c.nombre_empresa && data.empresaNombre ? ` de *${data.empresaNombre}*` : '';
  lines.push(`${greeting}${empresaLine},\n`);

  if (data.tipo === 'pre_cobro') {
    if (c.fecha_cobro && data.fechaCobro) lines.push(`Mañana *${data.fechaCobro}* se realizará tu cobro automático`);
    if (c.monto && data.monto) lines.push(`de *${data.monto}*`);
    if (c.num_usuarios && data.numUsuarios) lines.push(`por *${data.numUsuarios} usuario(s)*.`);
    if (c.enlace_facturacion) lines.push(`\n💳 ${data.enlaceFacturacion || ''}`);
    if (c.mensaje_despedida) lines.push('\n¡Gracias por confiar en Rutapp! 🚀');
  }
  if (data.tipo === 'cobro_exitoso') {
    if (c.monto && data.monto) lines.push(`Tu pago de *${data.monto}* se procesó correctamente.`);
    if (c.fecha_vigencia && data.fechaVigencia) lines.push(`Vigente hasta el *${data.fechaVigencia}*.`);
    if (c.mensaje_despedida) lines.push('\n¡Gracias! 🎉');
  }
  if (data.tipo === 'cobro_fallido') {
    lines.push('No pudimos procesar tu pago.');
    if (c.monto && data.monto) lines.push(`Pendiente: *${data.monto}*.`);
    if (c.dias_gracia) lines.push(`Tienes *${GRACE_DAYS} días* para pagar.`);
    if (c.enlace_pago) lines.push(`\n💳 ${data.enlacePago || ''}`);
    if (c.advertencia_suspension) lines.push('\n⚠️ Si no regularizas, tu acceso será suspendido.');
  }
  if (data.tipo === 'suspension') {
    lines.push('Tu cuenta ha sido *suspendida* por falta de pago.');
    if (c.enlace_facturacion) lines.push(`\n${data.enlaceFacturacion || ''}`);
    if (c.mensaje_contacto) lines.push('\nSi tienes dudas, contáctanos.');
  }
  return lines.join('\n');
}

/* ─── Send text message via WhatsApp ─── */
export async function sendBillingTicketWhatsApp(params: {
  data: BillingTicketData;
  phone: string;
  waToken: string;
  customerEmail: string;
  textCaption?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, phone, waToken, customerEmail } = params;
  const WHATSAPI_URL = 'https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy';

  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  const textMsg = buildBillingTextMessage(data);

  try {
    const res = await fetch(WHATSAPI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': waToken },
      body: JSON.stringify({ action: 'send-text', phone: cleanPhone, message: textMsg }),
    });

    if (!res.ok) throw new Error(`WhatsAPI error: HTTP ${res.status}`);

    // Log to billing_notifications
    await supabase.from('billing_notifications').insert({
      customer_email: customerEmail,
      customer_phone: cleanPhone,
      channel: 'whatsapp',
      tipo: data.tipo,
      mensaje: textMsg,
      status: 'sent',
    } as any);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
