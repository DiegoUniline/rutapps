export type CondicionPago = 'contado' | 'credito' | 'por_definir';

/**
 * Condición de pago derivada del cliente.
 * - Cliente con crédito → 'credito' (usa su límite y días de crédito)
 * - Cliente sin crédito → 'contado'
 * - Sin cliente (público general) → 'por_definir'
 */
export function condicionPagoDesdeCliente(
  cliente?: { credito?: boolean | null } | null,
): CondicionPago {
  if (!cliente) return 'por_definir';
  return cliente.credito ? 'credito' : 'contado';
}
