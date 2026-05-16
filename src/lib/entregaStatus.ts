import { supabase } from '@/lib/supabase';

const CLOSED_ENTREGA_STATUSES = new Set(['cancelado', 'no_entregado']);

export async function syncPedidoEntregadoSiCompleto(pedidoId?: string | null, now = new Date().toISOString()) {
  if (!pedidoId) return { pedidoCompleto: false, ventaUpdated: false };

  const [{ data: ventaLineas, error: lineasErr }, { data: entregas, error: entregasErr }] = await Promise.all([
    supabase.from('venta_lineas').select('producto_id, cantidad').eq('venta_id', pedidoId),
    supabase.from('entregas').select('id, status, entrega_lineas(producto_id, cantidad_entregada)').eq('pedido_id', pedidoId),
  ]);

  if (lineasErr) throw lineasErr;
  if (entregasErr) throw entregasErr;

  const requerido = new Map<string, number>();
  for (const linea of ventaLineas ?? []) {
    if (!linea.producto_id) continue;
    requerido.set(linea.producto_id, (requerido.get(linea.producto_id) ?? 0) + Number(linea.cantidad ?? 0));
  }

  const entregado = new Map<string, number>();
  for (const entrega of entregas ?? []) {
    if (entrega.status !== 'hecho') continue;
    for (const linea of (entrega.entrega_lineas ?? []) as any[]) {
      if (!linea.producto_id) continue;
      entregado.set(linea.producto_id, (entregado.get(linea.producto_id) ?? 0) + Number(linea.cantidad_entregada ?? 0));
    }
  }

  const hayEntregasPendientes = (entregas ?? []).some((entrega: any) => entrega.status !== 'hecho' && !CLOSED_ENTREGA_STATUSES.has(entrega.status));
  const pedidoCompleto = requerido.size > 0 && !hayEntregasPendientes && [...requerido.entries()].every(([productoId, cantidad]) => (entregado.get(productoId) ?? 0) + 0.0001 >= cantidad);

  if (!pedidoCompleto) return { pedidoCompleto: false, ventaUpdated: false };

  const { error: ventaErr } = await supabase
    .from('ventas')
    .update({ status: 'entregado', fecha_entrega: now } as any)
    .eq('id', pedidoId)
    .neq('status', 'cancelado')
    .neq('status', 'facturado');
  if (ventaErr) throw ventaErr;

  return { pedidoCompleto: true, ventaUpdated: true };
}

export async function marcarEntregaHechaYSincronizarPedido(entregaId: string, pedidoId?: string | null, now = new Date().toISOString()) {
  const { error } = await supabase
    .from('entregas')
    .update({ status: 'hecho', validado_at: now, fecha_entrega: now } as any)
    .eq('id', entregaId)
    .not('status', 'in', '(hecho,cancelado,no_entregado)');
  if (error) throw error;

  return syncPedidoEntregadoSiCompleto(pedidoId, now);
}