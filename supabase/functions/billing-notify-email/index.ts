import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, empresa, plan, amount, url, reference } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Email 'to' es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentInfo = reference
      ? `<tr><td style="padding:12px 0;font-size:14px;color:#374151;">Tu referencia de pago es:</td></tr>
         <tr><td style="padding:8px 16px;background:#f0f9ff;border:2px dashed #2563eb;border-radius:8px;text-align:center;">
           <span style="font-size:22px;font-weight:700;font-family:monospace;letter-spacing:3px;color:#1e40af;">${reference}</span>
         </td></tr>
         <tr><td style="padding:12px 0 0;font-size:13px;color:#6b7280;">
           Presenta esta referencia en cualquier tienda de conveniencia (OXXO, 7-Eleven, etc.) para realizar tu pago.
         </td></tr>`
      : url
      ? `<tr><td style="padding:16px 0;text-align:center;">
           <a href="${url}" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#ffffff;font-weight:600;font-size:16px;border-radius:8px;text-decoration:none;">Pagar ahora</a>
         </td></tr>
         <tr><td style="padding:4px 0;text-align:center;font-size:12px;color:#9ca3af;">
           Tambi&eacute;n puedes pagar desde la app &rarr; Mi Suscripci&oacute;n
         </td></tr>`
      : `<tr><td style="padding:16px 0;text-align:center;">
           <a href="https://rutapps.lovable.app/mi-suscripcion" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#ffffff;font-weight:600;font-size:16px;border-radius:8px;text-decoration:none;">Ver mi suscripci&oacute;n</a>
         </td></tr>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:24px 32px;">
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">&#x1F4B3; ${reference ? 'Referencia de Pago' : 'Factura pendiente de pago'}</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding-bottom:16px;font-size:16px;color:#111827;">
        Hola <strong>${empresa || "Cliente"}</strong>,
      </td></tr>
      <tr><td style="padding-bottom:20px;font-size:14px;color:#374151;">
        ${reference ? 'Se ha generado una referencia de pago para tu suscripci&oacute;n:' : 'Se ha generado una factura pendiente para tu suscripci&oacute;n en Rutapp:'}
      </td></tr>
      <tr><td style="padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">Plan:</td>
              <td style="font-size:14px;font-weight:600;color:#111827;text-align:right;">${plan || "&mdash;"}</td></tr>
          <tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">Monto:</td>
              <td style="font-size:18px;font-weight:700;color:#111827;text-align:right;">$${amount || 0} MXN</td></tr>
        </table>
      </td></tr>
      ${paymentInfo}
      <tr><td style="padding:24px 0 0;font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;margin-top:24px;">
        &iexcl;Gracias por confiar en Rutapp! &#x1F680;<br>
        <span style="font-size:12px;">Este es un mensaje autom&aacute;tico, no responder.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabaseAdmin.from("billing_notifications").insert({
      customer_email: to,
      channel: "email",
      tipo: reference ? "referencia_pago" : "factura_pendiente",
      mensaje: `${reference ? `Referencia: ${reference}` : `Enlace: ${url || 'N/A'}`} | Plan: ${plan} | $${amount} MXN`,
      monto_centavos: Math.round((amount || 0) * 100),
      status: "logged",
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, message: "Notificaci\u00f3n de email registrada" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
