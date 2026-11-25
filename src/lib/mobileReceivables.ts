export interface MobileReceivableSale {
  id: string;
  cliente_id?: string | null;
  saldo_pendiente?: number | null;
  status?: string | null;
  fecha?: string | null;
}

/**
 * Solo documentos confirmados generan cuenta por cobrar (misma regla que la web, CuentasCobrarPage):
 * un borrador (aún no confirmado) o un cancelado no se cobran aunque traigan saldo guardado.
 */
export const ESTADOS_CXC = ['confirmado', 'entregado', 'facturado'];

/**
 * Regla única de Cuentas por cobrar en App Móvil.
 * Una nota confirmada con saldo puede cobrarse sin importar si nació como crédito,
 * contado o con condición pendiente de definir.
 */
export function isMobileReceivable(sale: MobileReceivableSale): boolean {
  return Boolean(
    sale.id &&
    sale.cliente_id &&
    Number(sale.saldo_pendiente ?? 0) > 0 &&
    ESTADOS_CXC.includes(sale.status ?? ''),
  );
}

export function getMobileReceivables<T extends MobileReceivableSale>(
  sales: T[],
  clienteId: string,
): T[] {
  return sales
    .filter(sale => sale.cliente_id === clienteId && isMobileReceivable(sale))
    .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
}

