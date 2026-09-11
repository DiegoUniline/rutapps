import { createClient } from 'npm:@supabase/supabase-js@2.57.2'
import { sendAppEmail } from '../_shared/app-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const publicUrlFor = (token: string) =>
  `https://rutapp.mx/proveedor/solicitud-compra.html?token=${encodeURIComponent(token)}`

const dateLabel = (value?: string | null) => {
  if (!value) return undefined
  try {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' })
      .format(new Date(`${value}T12:00:00-06:00`))
  } catch { return value }
}

async function addEvent(sb: ReturnType<typeof admin>, solicitud: any, tipo: string, actorTipo: string, actorId?: string | null, detalle: any = {}) {
  const { error } = await sb.from('solicitud_compra_eventos').insert({
    solicitud_id: solicitud.id,
    empresa_id: solicitud.empresa_id,
    tipo,
    actor_tipo: actorTipo,
    actor_id: actorId || null,
    detalle,
  })
  if (error) console.error('solicitud_compra_eventos', error.message)
}

async function loadByToken(sb: ReturnType<typeof admin>, token: string) {
  const { data: solicitud, error } = await sb
    .from('solicitudes_compra')
    .select('*')
    .eq('public_token', token)
    .maybeSingle()
  if (error) throw error
  if (!solicitud) return { error: json({ error: 'Solicitud no encontrada' }, 404) }

  if (solicitud.token_expires_at && new Date(solicitud.token_expires_at).getTime() < Date.now()
      && !['respondida', 'convertida'].includes(solicitud.status)) {
    return { error: json({ error: 'Este enlace ha vencido. Solicita un nuevo enlace a tu cliente.' }, 410) }
  }

  const [{ data: lineas, error: lineError }, { data: empresa, error: empresaError }] = await Promise.all([
    sb.from('solicitud_compra_lineas').select('*').eq('solicitud_id', solicitud.id).order('orden'),
    sb.from('empresas').select('id,nombre').eq('id', solicitud.empresa_id).maybeSingle(),
  ])
  if (lineError) throw lineError
  if (empresaError) throw empresaError
  return { solicitud, lineas: lineas || [], empresa: empresa || { nombre: 'Cliente RutApp' } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const sb = admin()

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const token = url.searchParams.get('token')?.trim()
      if (!token) return json({ error: 'Token requerido' }, 400)

      const loaded: any = await loadByToken(sb, token)
      if (loaded.error) return loaded.error
      const { solicitud, lineas, empresa } = loaded

      if (!solicitud.visto_at && ['enviada', 'vista'].includes(solicitud.status)) {
        const now = new Date().toISOString()
        await sb.from('solicitudes_compra').update({
          visto_at: now,
          status: solicitud.status === 'enviada' ? 'vista' : solicitud.status,
        }).eq('id', solicitud.id)
        await addEvent(sb, solicitud, 'vista_proveedor', 'proveedor', null, {})
        solicitud.visto_at = now
        if (solicitud.status === 'enviada') solicitud.status = 'vista'
      }

      return json({
        solicitud: {
          id: solicitud.id,
          folio: solicitud.folio,
          proveedor_nombre: solicitud.proveedor_nombre,
          fecha_requerida: solicitud.fecha_requerida,
          notas: solicitud.notas,
          proveedor_observaciones: solicitud.proveedor_observaciones,
          status: solicitud.status,
          enviado_at: solicitud.enviado_at,
          visto_at: solicitud.visto_at,
          respondido_at: solicitud.respondido_at,
        },
        empresa: { nombre: empresa?.nombre || 'Cliente RutApp' },
        lineas: lineas.map((l: any) => ({
          id: l.id,
          producto_codigo: l.producto_codigo,
          producto_nombre: l.producto_nombre,
          unidad: l.unidad,
          cantidad_solicitada: l.cantidad_solicitada,
          cantidad_surtida: l.cantidad_surtida,
          costo_unitario: l.costo_unitario,
          fecha_entrega: l.fecha_entrega,
          disponible: l.disponible,
          observaciones: l.observaciones,
        })),
      })
    }

    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '').trim()

    if (action === 'send') {
      const authHeader = req.headers.get('Authorization') || ''
      const jwt = authHeader.replace(/^Bearer\s+/i, '')
      if (!jwt) return json({ error: 'No autorizado' }, 401)
      const { data: userData, error: userError } = await sb.auth.getUser(jwt)
      const user = userData?.user
      if (userError || !user) return json({ error: 'Sesión inválida' }, 401)

      const solicitudId = String(body?.solicitud_id || '')
      const to = String(body?.to || '').trim().toLowerCase()
      const cc = Array.isArray(body?.cc)
        ? [...new Set(body.cc.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean))]
        : []
      if (!solicitudId || !to || !/^\S+@\S+\.\S+$/.test(to)) {
        return json({ error: 'Solicitud y correo del proveedor son requeridos' }, 400)
      }

      const [{ data: profile }, { data: solicitud, error: solicitudError }] = await Promise.all([
        sb.from('profiles').select('empresa_id').eq('id', user.id).maybeSingle(),
        sb.from('solicitudes_compra').select('*').eq('id', solicitudId).maybeSingle(),
      ])
      if (solicitudError) throw solicitudError
      if (!solicitud || !profile?.empresa_id || solicitud.empresa_id !== profile.empresa_id) {
        return json({ error: 'No tienes acceso a esta solicitud' }, 403)
      }
      if (['convertida', 'cancelada'].includes(solicitud.status)) {
        return json({ error: 'Esta solicitud ya no se puede enviar' }, 409)
      }

      const [{ data: lineas, error: lineError }, { data: empresa, error: empresaError }] = await Promise.all([
        sb.from('solicitud_compra_lineas').select('*').eq('solicitud_id', solicitud.id).order('orden'),
        sb.from('empresas').select('nombre').eq('id', solicitud.empresa_id).maybeSingle(),
      ])
      if (lineError) throw lineError
      if (empresaError) throw empresaError
      if (!lineas?.length) return json({ error: 'La solicitud no tiene productos' }, 400)

      const sentAt = new Date().toISOString()
      const publicUrl = publicUrlFor(String(solicitud.public_token))
      const totalUnidades = lineas.reduce((s: number, l: any) => s + Number(l.cantidad_solicitada || 0), 0)
      const templateData = {
        empresaNombre: empresa?.nombre || 'Cliente RutApp',
        proveedorNombre: solicitud.proveedor_nombre || 'Proveedor',
        folio: solicitud.folio,
        fechaRequerida: dateLabel(solicitud.fecha_requerida),
        publicUrl,
        totalPartidas: lineas.length,
        totalUnidades,
        productos: lineas.map((l: any) => ({ nombre: l.producto_nombre, cantidad: l.cantidad_solicitada, unidad: l.unidad || '' })),
        mensaje: solicitud.notas || undefined,
      }

      const providerResult = await sendAppEmail('solicitud-compra-proveedor', to, {
        templateData,
        idempotencyKey: `sc:${solicitud.id}:proveedor:${sentAt}`,
        replyTo: user.email || undefined,
      })
      if (!providerResult.sent) {
        const message = providerResult.reason === 'recipient_suppressed'
          ? 'El correo del proveedor está suprimido por el servicio de entrega'
          : providerResult.error
        return json({ error: message || 'No se pudo enviar el correo al proveedor' }, 502)
      }

      const ccWarnings: string[] = []
      for (const email of cc) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          ccWarnings.push(`${email}: formato inválido`)
          continue
        }
        const result = await sendAppEmail('solicitud-compra-proveedor', email, {
          templateData: { ...templateData, isCopy: true },
          idempotencyKey: `sc:${solicitud.id}:cc:${email}:${sentAt}`,
          replyTo: user.email || undefined,
        })
        if (!result.sent) ccWarnings.push(`${email}: no se pudo entregar la copia`)
      }

      await sb.from('solicitudes_compra').update({
        proveedor_email: to,
        cc_emails: cc,
        enviado_at: sentAt,
        visto_at: null,
        respondido_at: null,
        token_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'enviada',
      }).eq('id', solicitud.id)
      await addEvent(sb, solicitud, 'enviada_proveedor', 'interno', user.id, { to, cc, public_url: publicUrl, cc_warnings: ccWarnings })

      return json({ success: true, public_url: publicUrl, warnings: ccWarnings })
    }

    if (action === 'save' || action === 'respond') {
      const token = String(body?.token || '').trim()
      if (!token) return json({ error: 'Token requerido' }, 400)
      const loaded: any = await loadByToken(sb, token)
      if (loaded.error) return loaded.error
      const { solicitud, lineas } = loaded
      if (['convertida', 'cancelada'].includes(solicitud.status)) {
        return json({ error: 'Esta solicitud ya está cerrada' }, 409)
      }
      if (solicitud.status === 'respondida' && action === 'respond') {
        return json({ error: 'La respuesta ya fue enviada. Solicita a tu cliente que reabra la solicitud si necesitas hacer cambios.' }, 409)
      }

      const incoming = Array.isArray(body?.lineas) ? body.lineas : []
      const byId = new Map(lineas.map((l: any) => [l.id, l]))
      if (action === 'respond' && incoming.length !== lineas.length) {
        return json({ error: 'Debes responder todas las partidas antes de enviar' }, 400)
      }

      for (const item of incoming) {
        const original: any = byId.get(String(item?.id || ''))
        if (!original) return json({ error: 'Se recibió una partida inválida' }, 400)
        const disponible = item?.disponible === false ? false : true
        const cantidad = disponible ? Math.max(0, Number(item?.cantidad_surtida || 0)) : 0
        const costo = disponible && item?.costo_unitario !== '' && item?.costo_unitario != null
          ? Math.max(0, Number(item.costo_unitario || 0))
          : null
        if (action === 'respond' && disponible && cantidad <= 0) {
          return json({ error: `Indica la cantidad disponible para ${original.producto_nombre}` }, 400)
        }
        const { error } = await sb.from('solicitud_compra_lineas').update({
          disponible,
          cantidad_surtida: cantidad,
          cantidad_aceptada: null,
          costo_unitario: costo,
          fecha_entrega: item?.fecha_entrega || null,
          observaciones: String(item?.observaciones || '').trim() || null,
        }).eq('id', original.id).eq('solicitud_id', solicitud.id)
        if (error) throw error
      }

      const now = new Date().toISOString()
      const nextStatus = action === 'respond' ? 'respondida' : 'borrador_proveedor'
      const update: any = {
        status: nextStatus,
        proveedor_observaciones: String(body?.proveedor_observaciones || '').trim() || null,
      }
      if (action === 'respond') update.respondido_at = now
      else update.borrador_proveedor_at = now
      const { error: updateError } = await sb.from('solicitudes_compra').update(update).eq('id', solicitud.id)
      if (updateError) throw updateError
      await addEvent(sb, solicitud, action === 'respond' ? 'respuesta_enviada' : 'borrador_guardado', 'proveedor', null, {})

      return json({ success: true, status: nextStatus })
    }

    return json({ error: 'Acción no válida' }, 400)
  } catch (error) {
    console.error('solicitud-compra-proveedor', error)
    return json({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
