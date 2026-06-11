import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token || token.length < 16) return json({ error: 'Token inválido' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, empresa_id, nombre, telefono, email, rfc, direccion')
    .eq('portal_token', token)
    .maybeSingle()

  if (error || !cliente) return json({ error: 'No encontrado' }, 404)

  const [{ data: empresa }, { data: ventas }, { data: cobros }] = await Promise.all([
    supabase.from('empresas').select('nombre, logo_url, telefono, moneda').eq('id', cliente.empresa_id).single(),
    supabase
      .from('ventas')
      .select('id, folio, fecha, total, saldo_pendiente, estado, tipo')
      .eq('cliente_id', cliente.id)
      .neq('estado', 'cancelado')
      .order('fecha', { ascending: false })
      .limit(100),
    supabase
      .from('cobros')
      .select('id, monto, metodo_pago, referencia, fecha, created_at')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const saldoTotal = (ventas ?? []).reduce((s, v: any) => s + Number(v.saldo_pendiente || 0), 0)

  return json({
    empresa,
    cliente: { nombre: cliente.nombre, telefono: cliente.telefono, email: cliente.email, rfc: cliente.rfc, direccion: cliente.direccion },
    ventas: ventas ?? [],
    cobros: cobros ?? [],
    saldoTotal,
  })
})
