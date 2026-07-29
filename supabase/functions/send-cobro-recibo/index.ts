import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const PUBLIC_BASE = 'https://rutapp.mx'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fmtMoney(v: number, code = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: code }).format(v ?? 0)
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SRV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SRV)

  let body: { cobro_id?: string; pdf_url?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  const { cobro_id, pdf_url } = body
  if (!cobro_id) return json({ error: 'cobro_id requerido' }, 400)

  // Load cobro + aplicaciones + cliente + empresa
  const { data: cobro, error: cErr } = await supabase
    .from('cobros')
    .select('id, empresa_id, cliente_id, monto, metodo_pago, referencia, fecha, created_at')
    .eq('id', cobro_id)
    .single()
  if (cErr || !cobro) return json({ error: 'Cobro no encontrado' }, 404)

  const [{ data: empresa }, { data: cliente }, { data: apps }] = await Promise.all([
    supabase.from('empresas').select('id, nombre, moneda, enviar_recibo_auto, logo_url, direccion, telefono, email').eq('id', cobro.empresa_id).single(),
    supabase.from('clientes').select('id, nombre, email, telefono, portal_token, recibir_notificaciones').eq('id', cobro.cliente_id).single(),
    supabase.from('cobro_aplicaciones').select('venta_id, monto_aplicado, ventas(folio)').eq('cobro_id', cobro_id),
  ])

  if (!empresa || !cliente) return json({ error: 'Datos incompletos' }, 404)
  if (empresa.enviar_recibo_auto === false || cliente.recibir_notificaciones === false) {
    return json({ skipped: true, reason: 'opt-out' })
  }

  // Ensure portal_token
  let portalToken = cliente.portal_token as string | null
  if (!portalToken) {
    portalToken = crypto.randomUUID().replace(/-/g, '')
    await supabase.from('clientes').update({ portal_token: portalToken }).eq('id', cliente.id)
  }
  const portalUrl = `${PUBLIC_BASE}/cliente/${portalToken}`

  // Compute saldo actual (sum of saldo_pendiente of all client's ventas)
  const { data: ventasSaldo } = await supabase
    .from('ventas')
    .select('saldo_pendiente')
    .eq('cliente_id', cliente.id)
    .neq('status', 'cancelado')
  const saldoActual = (ventasSaldo ?? []).reduce((s, v: any) => s + Number(v.saldo_pendiente || 0), 0)

  const folios = (apps ?? [])
    .map((a: any) => a.ventas?.folio)
    .filter(Boolean)
    .join(', ')

  const moneda = (empresa as any).moneda || 'MXN'
  const montoFmt = fmtMoney(Number(cobro.monto || 0), moneda)
  const saldoFmt = fmtMoney(saldoActual, moneda)
  const fechaFmt = fmtDate(cobro.fecha || cobro.created_at)

  const templateData = {
    clienteNombre: cliente.nombre || 'Cliente',
    empresaNombre: empresa.nombre,
    empresaLogoUrl: (empresa as any).logo_url || '',
    empresaDireccion: (empresa as any).direccion || '',
    empresaTelefono: (empresa as any).telefono || '',
    empresaEmail: (empresa as any).email || '',
    monto: montoFmt,
    fecha: fechaFmt,
    metodoPago: cobro.metodo_pago || '',
    referencia: cobro.referencia || '',
    folios,
    saldoActual: saldoFmt,
    portalUrl,
    pdfUrl: pdf_url || '',
    folioRecibo: cobro_id.slice(0, 8).toUpperCase(),
  }

  // Fire both channels in parallel
  const emailPromise = cliente.email
    ? supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'cobro-recibo',
          recipientEmail: cliente.email,
          idempotencyKey: `cobro-recibo-${cobro_id}`,
          templateData,
        },
      })
    : Promise.resolve({ data: { skipped: 'no_email' }, error: null } as any)

  const waMessage =
    `Hola ${cliente.nombre || ''}, recibimos tu pago por ${montoFmt} (${fechaFmt}).` +
    (folios ? `\nAplicado a: ${folios}` : '') +
    `\nSaldo actual: ${saldoFmt}` +
    `\nEstado de cuenta: ${portalUrl}` +
    (pdf_url ? `\nRecibo: ${pdf_url}` : '')

  const waPromise = cliente.telefono
    ? supabase.functions.invoke('whatsapp-sender', {
        body: {
          action: pdf_url ? 'send-file' : 'send-text',
          empresa_id: empresa.id,
          phone: cliente.telefono,
          message: waMessage,
          url: pdf_url,
          fileName: pdf_url ? `recibo-${cobro_id.slice(0, 8)}.pdf` : undefined,
          caption: waMessage,
          tipo: 'cobro_recibo',
          referencia_id: cobro_id,
        },
      })
    : Promise.resolve({ data: { skipped: 'no_phone' }, error: null } as any)

  const [emailRes, waRes] = await Promise.allSettled([emailPromise, waPromise])

  const emailStatus = emailRes.status === 'fulfilled'
    ? ((emailRes.value as any)?.error ? 'failed' : (cliente.email ? 'sent' : 'skipped'))
    : 'failed'
  const waStatus = waRes.status === 'fulfilled'
    ? ((waRes.value as any)?.error ? 'failed' : (cliente.telefono ? 'sent' : 'skipped'))
    : 'failed'

  const errors: string[] = []
  if (emailStatus === 'failed') {
    const e = emailRes.status === 'fulfilled' ? (emailRes.value as any)?.error : emailRes.reason
    errors.push(`email: ${e?.message || String(e)}`)
  }
  if (waStatus === 'failed') {
    const e = waRes.status === 'fulfilled' ? (waRes.value as any)?.error : waRes.reason
    errors.push(`whatsapp: ${e?.message || String(e)}`)
  }

  await supabase.from('cobros').update({
    notif_email_status: emailStatus,
    notif_wa_status: waStatus,
    notif_error: errors.length ? errors.join(' | ').slice(0, 500) : null,
  }).eq('id', cobro_id)

  return json({
    email: { status: emailStatus, hasEmail: !!cliente.email },
    whatsapp: { status: waStatus, hasPhone: !!cliente.telefono },
    portalUrl,
  })
})
