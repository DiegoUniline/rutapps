import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const DAYS_AHEAD = 7

function today() { return new Date().toISOString().slice(0, 10) }
function addDays(d: string, n: number) {
  const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
function fmtMoney(v: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v || 0))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const T = today()
  const limit = addDays(T, DAYS_AHEAD)
  const inserts: any[] = []

  // 1) Stock bajo: productos con min > 0 y stock total <= min
  const { data: prods } = await supabase
    .from('productos')
    .select('id, empresa_id, nombre, min, se_puede_inventariar, status')
    .gt('min', 0)
    .eq('se_puede_inventariar', true)
    .neq('status', 'archivado')
  if (prods?.length) {
    const ids = prods.map(p => p.id)
    const stocks: Record<string, number> = {}
    // chunk into 500s
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const { data: rows } = await supabase
        .from('stock_almacen')
        .select('producto_id, cantidad')
        .in('producto_id', chunk)
      for (const r of rows ?? []) {
        stocks[r.producto_id] = (stocks[r.producto_id] || 0) + Number(r.cantidad || 0)
      }
    }
    for (const p of prods) {
      const total = stocks[p.id] || 0
      if (total <= Number(p.min)) {
        inserts.push({
          empresa_id: p.empresa_id,
          tipo: 'stock_bajo',
          title: `Stock bajo · ${p.nombre}`,
          body: `Disponible ${total} · mínimo ${p.min}`,
          link: `/productos/${p.id}`,
          entity_type: 'producto',
          entity_id: p.id,
          dedupe_key: `stock_bajo:${p.id}:${T}`,
        })
      }
    }
  }

  // 2) Compras por vencer en próximos N días con saldo pendiente
  const { data: compras } = await supabase
    .from('compras')
    .select('id, empresa_id, folio, fecha, dias_credito, saldo_pendiente, proveedor_id, proveedores(nombre)')
    .gt('saldo_pendiente', 0)
  for (const c of compras ?? []) {
    const dias = Number((c as any).dias_credito || 0)
    if (!dias && !(c as any).fecha) continue
    const venc = addDays(String((c as any).fecha).slice(0, 10), dias)
    if (venc < T) {
      // Vencida
      inserts.push({
        empresa_id: c.empresa_id,
        tipo: 'compra_vencida',
        title: `Compra vencida ${c.folio ?? ''}`.trim(),
        body: `${(c as any).proveedores?.nombre ?? 'Proveedor'} · ${fmtMoney((c as any).saldo_pendiente)} · venció ${venc}`,
        link: `/almacen/compras/${c.id}`,
        entity_type: 'compra',
        entity_id: c.id,
        dedupe_key: `compra_venc:${c.id}:${T}`,
      })
    } else if (venc <= limit) {
      inserts.push({
        empresa_id: c.empresa_id,
        tipo: 'compra_por_vencer',
        title: `Compra por vencer ${c.folio ?? ''}`.trim(),
        body: `${(c as any).proveedores?.nombre ?? 'Proveedor'} · ${fmtMoney((c as any).saldo_pendiente)} · vence ${venc}`,
        link: `/almacen/compras/${c.id}`,
        entity_type: 'compra',
        entity_id: c.id,
        dedupe_key: `compra_venc:${c.id}:${T}`,
      })
    }
  }

  // 3) Cuentas por cobrar próximas a vencer / vencidas
  const { data: ventas } = await supabase
    .from('ventas')
    .select('id, empresa_id, folio, fecha_vencimiento, saldo_pendiente, cliente_id, clientes(nombre)')
    .gt('saldo_pendiente', 0)
    .not('fecha_vencimiento', 'is', null)
    .neq('status', 'cancelado')
  for (const v of ventas ?? []) {
    const venc = String((v as any).fecha_vencimiento).slice(0, 10)
    if (venc < T) {
      inserts.push({
        empresa_id: v.empresa_id,
        tipo: 'cuenta_vencida',
        title: `Cuenta vencida ${v.folio ?? ''}`.trim(),
        body: `${(v as any).clientes?.nombre ?? 'Cliente'} · ${fmtMoney((v as any).saldo_pendiente)} · venció ${venc}`,
        link: `/ventas/${v.id}`,
        entity_type: 'venta',
        entity_id: v.id,
        dedupe_key: `venta_venc:${v.id}:${T}`,
      })
    } else if (venc <= limit) {
      inserts.push({
        empresa_id: v.empresa_id,
        tipo: 'cuenta_por_vencer',
        title: `Cuenta por vencer ${v.folio ?? ''}`.trim(),
        body: `${(v as any).clientes?.nombre ?? 'Cliente'} · ${fmtMoney((v as any).saldo_pendiente)} · vence ${venc}`,
        link: `/ventas/${v.id}`,
        entity_type: 'venta',
        entity_id: v.id,
        dedupe_key: `venta_venc:${v.id}:${T}`,
      })
    }
  }

  let inserted = 0
  // Upsert in chunks de 500
  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500)
    const { error, count } = await supabase
      .from('internal_notifications')
      .upsert(chunk, { onConflict: 'empresa_id,dedupe_key', ignoreDuplicates: true, count: 'exact' })
    if (error) {
      console.error('upsert error', error)
    } else {
      inserted += count ?? 0
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scanned: { productos: prods?.length ?? 0, compras: compras?.length ?? 0, ventas: ventas?.length ?? 0 },
    candidates: inserts.length,
    inserted,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
