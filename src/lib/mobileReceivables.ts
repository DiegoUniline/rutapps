export interface MobileReceivableSale {
  id: string;
  cliente_id?: string | null;
  saldo_pendiente?: number | null;
  status?: string | null;
  fecha?: string | null;
}

/**
 * Regla única de Cuentas por cobrar en App Móvil.
 * Una nota con saldo puede cobrarse mientras no esté cancelada, sin importar
 * si nació como crédito, contado o con condición pendiente de definir.
 */
export function isMobileReceivable(sale: MobileReceivableSale): boolean {
  return Boolean(
    sale.id &&
    sale.cliente_id &&
    Number(sale.saldo_pendiente ?? 0) > 0 &&
    sale.status !== 'cancelado',
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

