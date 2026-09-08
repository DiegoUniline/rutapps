export type SupervisorDeliveryMetricRow = {
  status?: string | null;
  fecha?: string | null;
  fecha_entrega?: string | null;
  validado_at?: string | null;
};

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

