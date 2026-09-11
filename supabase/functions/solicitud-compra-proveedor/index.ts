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
  `https://rutapp.mx/proveedor/solicitud-compra?token=${encodeURIComponent(token)}`

const legacyPublicUrlFor = (token: string) =>
  `https://rutapp.mx/proveedor/solicitud-compra.html?token=${encodeURIComponent(token)}`

const tokenFromPublicUrl = (value?: string | null) => {
  if (!value) return null
  try { return new URL(value).searchParams.get('token')?.trim() || null }
  catch { return null }
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

async function requestIdFromIssuedToken(sb: ReturnType<typeof admin>, token: string) {
  // Compatibilidad: antes de este cambio, al cerrar se rotaba public_token.
  // Recuperamos el enlace realmente enviado al proveedor desde el historial.
  for (const candidate of [publicUrlFor(token), legacyPublicUrlFor(token)]) {
    const { data, error } = await sb
      .from('solicitud_compra_eventos')
      .select('solicitud_id,detalle,created_at')
      .eq('tipo', 'enviada_proveedor')
      .contains('detalle', { public_url: candidate })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('lookup issued supplier token', error.message)
      continue
    }
    if (data?.solicitud_id) return String(data.solicitud_id)
  }
  return null
}

async function latestIssuedToken(sb: ReturnType<typeof admin>, solicitudId: string) {
  const { data, error } = await sb
    .from('solicitud_compra_eventos')
    .select('detalle,created_at')
    .eq('solicitud_id', solicitudId)
    .eq('tipo', 'enviada_proveedor')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('latest issued supplier token', error.message)
    return null
  }
  return tokenFromPublicUrl(data?.detalle?.public_url)
}

async function hydrateLineUnits(sb: ReturnType<typeof admin>, lineas: any[]) {
  const missingProductIds = [...new Set(
    lineas
      .filter((line: any) => !String(line?.unidad || '').trim() && line?.producto_id)
      .map((line: any) => String(line.producto_id)),
  )]

  if (!missingProductIds.length) return lineas

  const { data: products, error: productError } = await sb
    .from('productos')
    .select('id,unidad_compra_id,unidad_venta_id')
    .in('id', missingProductIds)

  if (productError) {
    console.error('hydrate supplier request units: products', productError.message)
    return lineas
  }

  const unitIds = [...new Set((products || []).flatMap((product: any) =>
    [product.unidad_compra_id, product.unidad_venta_id].filter(Boolean).map(String),
  ))]

  if (!unitIds.length) {
    return lineas.map((line: any) => ({ ...line, unidad: String(line?.unidad || '').trim() || 'pz' }))
  }

  const { data: units, error: unitError } = await sb
    .from('unidades')
    .select('id,abreviatura,nombre')
    .in('id', unitIds)

  if (unitError) {
    console.error('hydrate supplier request units: unidades', unitError.message)
    return lineas
  }

  const unitById = new Map((units || []).map((unit: any) => [
    String(unit.id),
    String(unit.abreviatura || unit.nombre || '').trim(),
  ]))
  const productById = new Map((products || []).map((product: any) => [String(product.id), product]))

  return lineas.map((line: any) => {
    if (String(line?.unidad || '').trim()) return line
    const product: any = productById.get(String(line.producto_id))
    const unidad = product
      ? unitById.get(String(product.unidad_compra_id || '')) || unitById.get(String(product.unidad_venta_id || '')) || 'pz'
      : 'pz'
    return { ...line, unidad }
  })
}

async function loadByToken(sb: ReturnType<typeof admin>, token: string) {
  let { data: solicitud, error } = await sb
    .from('solicitudes_compra')
    .select('*')
    .eq('public_token', token)
    .maybeSingle()
  if (error) throw error

  if (!solicitud) {
    const historicalRequestId = await requestIdFromIssuedToken(sb, token)
    if (historicalRequestId) {
      const result = await sb.from('solicitudes_compra').select('*').eq('id', historicalRequestId).maybeSingle()
      if (result.error) throw result.error
      solicitud = result.data
    }
  }

  if (!solicitud) return { error: json({ error: 'Este enlace ya no está disponible.' }, 404) }
  if (solicitud.status === 'cancelada') {
    return { error: json({ error: 'Esta solicitud fue cancelada y ya no está disponible.' }, 410) }
  }

  const readonly = ['respondida', 'convertida'].includes(solicitud.status)
  if (!readonly && solicitud.token_expires_at && new Date(solicitud.token_expires_at).getTime() < Date.now()) {
    return { error: json({ error: 'Este enlace ha vencido. Solicita un nuevo enlace a tu cliente.' }, 410) }
  }

  const [{ data: rawLines, error: lineError }, { data: empresa, error: empresaError }] = await Promise.all([
    sb.from('solicitud_compra_lineas').select('*').eq('solicitud_id', solicitud.id).order('orden'),
    sb.from('empresas').select('id,nombre').eq('id', solicitud.empresa_id).maybeSingle(),
  ])
  if (lineError) throw lineError
  if (empresaError) throw empresaError
  const lineas = await hydrateLineUnits(sb, rawLines || [])
  return { solicitud, lineas, empresa: empresa || { nombre: 'Cliente RutApp' }, readonly }
}

async function authorizeInternalRequest(sb: ReturnType<typeof admin>, req: Request, solicitudId: string) {
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return { error: json({ error: 'No autorizado' }, 401) }

  const { data: userData, error: userError } = await sb.auth.getUser(jwt)
  const user = userData?.user
  if (userError || !user) return { error: json({ error: 'Sesión inválida' }, 401) }

  const [{ data: profile }, { data: solicitud, error: solicitudError }, { data: superAdmin }] = await Promise.all([
    sb.from('profiles').select('empresa_id').eq('id', user.id).maybeSingle(),
    sb.from('solicitudes_compra').select('*').eq('id', solicitudId).maybeSingle(),
    sb.from('super_admins').select('id').eq('user_id', user.id).maybeSingle(),
  ])
  if (solicitudError) throw solicitudError
  const esSuperAdmin = !!superAdmin?.id
  if (!solicitud || (!esSuperAdmin && (!profile?.empresa_id || solicitud.empresa_id !== profile.empresa_id))) {
    return { error: json({ error: 'No tienes acceso a esta solicitud' }, 403) }
  }
  return { user, solicitud }
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
      const { solicitud, lineas, empresa, readonly } = loaded

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
        readonly,
        solicitud: {
          id: solicitud.id,
          folio: solicitud.folio,
          proveedor_nombre: solicitud.proveedor_nombre,
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
          disponible: l.disponible,
          observaciones: l.observaciones,
        })),
      })
    }

    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '').trim()

    if (action === 'send') {
      const solicitudId = String(body?.solicitud_id || '')
      const to = String(body?.to || '').trim().toLowerCase()
      const cc = Array.isArray(body?.cc)
        ? [...new Set(body.cc.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean))]
        : []
      if (!solicitudId || !to || !/^\S+@\S+\.\S+$/.test(to)) {
        return json({ error: 'Solicitud y correo del proveedor son requeridos' }, 400)
      }

      const auth: any = await authorizeInternalRequest(sb, req, solicitudId)
      if (auth.error) return auth.error
      const { user, solicitud } = auth
      if (['respondida', 'convertida', 'cancelada'].includes(solicitud.status)) {
        return json({ error: 'Esta solicitud está cerrada. Ábrela para modificar antes de volver a enviarla.' }, 409)
      }

      const [{ data: rawLines, error: lineError }, { data: empresa, error: empresaError }] = await Promise.all([
        sb.from('solicitud_compra_lineas').select('*').eq('solicitud_id', solicitud.id).order('orden'),
        sb.from('empresas').select('nombre').eq('id', solicitud.empresa_id).maybeSingle(),
      ])
      if (lineError) throw lineError
      if (empresaError) throw empresaError
      if (!rawLines?.length) return json({ error: 'La solicitud no tiene productos' }, 400)
      const lineas = await hydrateLineUnits(sb, rawLines)

      const sentAt = new Date().toISOString()
      const publicUrl = publicUrlFor(String(solicitud.public_token))
      const totalUnidades = lineas.reduce((s: number, l: any) => s + Number(l.cantidad_solicitada || 0), 0)
      const templateData = {
        empresaNombre: empresa?.nombre || 'Cliente RutApp',
        proveedorNombre: solicitud.proveedor_nombre || 'Proveedor',
        folio: solicitud.folio,
        publicUrl,
        totalPartidas: lineas.length,
        totalUnidades,
        productos: lineas.map((l: any) => ({ nombre: l.producto_nombre, cantidad: l.cantidad_solicitada, unidad: l.unidad || 'pz' })),
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

    if (action === 'reopen') {
      const solicitudId = String(body?.solicitud_id || '')
      if (!solicitudId) return json({ error: 'Solicitud requerida' }, 400)

      const auth: any = await authorizeInternalRequest(sb, req, solicitudId)
      if (auth.error) return auth.error
      const { user, solicitud } = auth

      if (solicitud.status === 'convertida') {
        return json({ error: 'Esta solicitud ya fue convertida en compra y no puede reabrirse.' }, 409)
      }
      if (solicitud.status === 'cancelada') {
        return json({ error: 'Esta solicitud está cancelada y no puede reabrirse.' }, 409)
      }
      if (solicitud.status !== 'respondida') {
        return json({ error: 'La solicitud no está cerrada.' }, 409)
      }

      const issuedToken = await latestIssuedToken(sb, solicitud.id)
      const publicToken = issuedToken || String(solicitud.public_token)
      const reopenedAt = new Date().toISOString()
      const { error: reopenError } = await sb.from('solicitudes_compra').update({
        status: 'borrador_proveedor',
        public_token: publicToken,
        token_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        respondido_at: null,
        borrador_proveedor_at: reopenedAt,
      }).eq('id', solicitud.id)
      if (reopenError) throw reopenError

      await sb.from('solicitud_compra_lineas').update({ cantidad_aceptada: null }).eq('solicitud_id', solicitud.id)
      await addEvent(sb, solicitud, 'reabierta_proveedor', 'interno', user.id, { public_url: publicUrlFor(publicToken) })

      return json({ success: true, status: 'borrador_proveedor', public_url: publicUrlFor(publicToken) })
    }

    // `respond` remains accepted for backwards compatibility with already cached public pages.
    if (action === 'save' || action === 'close' || action === 'respond') {
      const token = String(body?.token || '').trim()
      if (!token) return json({ error: 'Token requerido' }, 400)
      const loaded: any = await loadByToken(sb, token)
      if (loaded.error) return loaded.error
      const { solicitud, lineas } = loaded
      const isClose = action === 'close' || action === 'respond'

      if (['respondida', 'convertida'].includes(solicitud.status)) {
        return json({ error: 'Esta solicitud está cerrada en modo consulta. Tu cliente debe abrirla para modificar desde RutApp.' }, 409)
      }

      const incoming = Array.isArray(body?.lineas) ? body.lineas : []
      const byId = new Map(lineas.map((l: any) => [l.id, l]))
      if (isClose && incoming.length !== lineas.length) {
        return json({ error: 'Debes completar todas las partidas antes de cerrar la solicitud' }, 400)
      }

      for (const item of incoming) {
        const original: any = byId.get(String(item?.id || ''))
        if (!original) return json({ error: 'Se recibió una partida inválida' }, 400)
        const disponible = item?.disponible === false ? false : true
        const cantidad = disponible ? Math.max(0, Number(item?.cantidad_surtida || 0)) : 0
        const costo = disponible && item?.costo_unitario !== '' && item?.costo_unitario != null
          ? Math.max(0, Number(item.costo_unitario || 0))
          : null
        if (isClose && disponible && cantidad <= 0) {
          return json({ error: `Indica la cantidad disponible para ${original.producto_nombre}` }, 400)
        }
        const { error } = await sb.from('solicitud_compra_lineas').update({
          disponible,
          cantidad_surtida: cantidad,
          cantidad_aceptada: null,
          costo_unitario: costo,
          observaciones: String(item?.observaciones || '').trim() || null,
        }).eq('id', original.id).eq('solicitud_id', solicitud.id)
        if (error) throw error
      }

      const now = new Date().toISOString()
      const nextStatus = isClose ? 'respondida' : 'borrador_proveedor'
      const update: any = {
        status: nextStatus,
        proveedor_observaciones: String(body?.proveedor_observaciones || '').trim() || null,
      }

      if (isClose) {
        update.respondido_at = now
        // Cerrada = solo lectura. Conservamos el mismo token para consulta permanente.
        update.token_expires_at = null
      } else {
        update.borrador_proveedor_at = now
      }

      const { error: updateError } = await sb.from('solicitudes_compra').update(update).eq('id', solicitud.id)
      if (updateError) throw updateError
      await addEvent(sb, solicitud, isClose ? 'solicitud_cerrada' : 'borrador_guardado', 'proveedor', null, {})

      return json({ success: true, status: nextStatus, closed: isClose, readonly: isClose })
    }

    return json({ error: 'Acción no válida' }, 400)
  } catch (error) {
    console.error('solicitud-compra-proveedor', error)
    return json({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
