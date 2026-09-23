import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { Database } from '@/integrations/supabase/types';
import type { ReportOrder, ReportDelivery, ReportSaleLine, ReportDeliveryLine, ReportSource } from './concentradoReport';

export interface ConcentradoReportFilters {
  empresaId: string;
  desde: string;
  hasta: string;
  fechaField: 'fecha' | 'fecha_entrega';
  statuses: string[];
  tipo: 'pedido' | 'venta_directa' | 'todos';
}

// No exportar silenciosamente un resultado recortado por el límite del helper.
async function readAll<T>(query: Parameters<typeof fetchAllPages>[0]): Promise<T[]> {
  const cap = 200_000;
  const rows = await fetchAllPages<T>(query, cap);
  if (rows.length >= cap) throw new Error('El reporte excede 200,000 registros. Reduce el rango de fechas.');
  return rows;
}

export async function fetchConcentradoReport(filters: ConcentradoReportFilters): Promise<ReportSource> {
  const { empresaId, desde, hasta, fechaField, statuses, tipo } = filters;
  if (!empresaId) throw new Error('Selecciona una empresa.');
  if (desde && hasta && desde > hasta) throw new Error('La fecha inicial debe ser anterior a la final.');
  const orders = await readAll<ReportOrder>((from, to) => {
    let query = supabase.from('ventas')
      .select('id, folio, vendedor_id, vendedor:profiles!ventas_vendedor_id_profiles_fkey(nombre)')
      .eq('empresa_id', empresaId)
      .in('status', (statuses.length ? statuses : ['confirmado', 'entregado', 'facturado']) as Database['public']['Enums']['status_venta'][])
      .order('id').range(from, to);
    if (tipo !== 'todos') query = query.eq('tipo', tipo);
    if (desde) query = query.gte(fechaField, desde);
    if (hasta) query = query.lte(fechaField, hasta);
    return query;
  });
  const result: ReportSource = { orders, deliveries: [], saleLines: [], deliveryLines: [] };
  // Lotes de IDs pequeños para no exceder la longitud del URL. Las líneas se
  // paginan por separado: los embeds anidados también pueden quedar truncados.
  for (let start = 0; start < orders.length; start += 100) {
    const ids = orders.slice(start, start + 100).map(order => order.id);
    const [saleLines, deliveries] = await Promise.all([
      readAll<ReportSaleLine>((from, to) => supabase.from('venta_lineas')
        .select('id, venta_id, producto_id, descripcion, cantidad, productos(codigo, nombre)')
        .eq('empresa_id', empresaId).in('venta_id', ids).order('id').range(from, to)),
      readAll<ReportDelivery>((from, to) => supabase.from('entregas')
        .select('id, pedido_id, status, vendedor_ruta_id, ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre)')
        .eq('empresa_id', empresaId).in('pedido_id', ids).neq('status', 'cancelado')
        .order('id').range(from, to)),
    ]);
    result.saleLines.push(...saleLines);
    result.deliveries.push(...deliveries);
    for (let offset = 0; offset < deliveries.length; offset += 100) {
      const deliveryIds = deliveries.slice(offset, offset + 100).map(d => d.id);
      const lines = await readAll<ReportDeliveryLine>((from, to) => supabase.from('entrega_lineas')
        .select('entrega_id, producto_id, cantidad_entregada, entregas!inner(empresa_id)')
        .eq('entregas.empresa_id', empresaId).in('entrega_id', deliveryIds)
        .order('id').range(from, to));
      result.deliveryLines.push(...lines);
    }
  }
  return result;
}
