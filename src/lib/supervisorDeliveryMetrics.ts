export type SupervisorDeliveryMetricRow = {
  status?: string | null;
  fecha?: string | null;
  fecha_entrega?: string | null;
  validado_at?: string | null;
  vendedor_id?: string | null;
  vendedor_ruta_id?: string | null;
};

export type DeliveryStatusFilter = 'todas' | 'entregadas' | 'pendientes';

const CLOSED_WITHOUT_DELIVERY = new Set(['cancelado', 'no_entregado']);

/**
 * Timestamp real de cierre de la entrega.
 * `validado_at` solo se usa para entregas históricas creadas antes de que
 * `fecha_entrega` fuera obligatorio al cambiar el estado a `hecho`.
 */
export function actualDeliveryTimestamp(row: SupervisorDeliveryMetricRow): string | null {
  if (row.status !== 'hecho') return null;
  return row.fecha_entrega ?? row.validado_at ?? null;
}

export function wasDeliveredInRange(
  row: SupervisorDeliveryMetricRow,
  range: { start: string; end: string },
): boolean {
  const completedAt = actualDeliveryTimestamp(row);
  return completedAt !== null && completedAt >= range.start && completedAt <= range.end;
}

/**
 * Una entrega pendiente pertenece a la carga acumulada si su fecha programada
 * ya llegó. No se limita al día seleccionado: los atrasos deben seguir visibles.
 */
export function isPendingDeliveryThrough(
  row: SupervisorDeliveryMetricRow,
  throughDate: string,
): boolean {
  const status = row.status ?? '';
  if (status === 'hecho' || CLOSED_WITHOUT_DELIVERY.has(status)) return false;
  return Boolean(row.fecha && row.fecha <= throughDate);
}

export function deliveryMatchesStatusFilter(
  row: SupervisorDeliveryMetricRow,
  filter: DeliveryStatusFilter,
  throughDate: string,
): boolean {
  if (filter === 'entregadas') return row.status === 'hecho';
  if (filter === 'pendientes') return isPendingDeliveryThrough(row, throughDate);
  return row.status === 'hecho' || isPendingDeliveryThrough(row, throughDate);
}

export function deliveryBelongsToSeller(
  row: SupervisorDeliveryMetricRow,
  sellerIds?: readonly string[] | null,
): boolean {
  if (!sellerIds) return true;
  return sellerIds.includes(row.vendedor_ruta_id ?? '') || sellerIds.includes(row.vendedor_id ?? '');
}
