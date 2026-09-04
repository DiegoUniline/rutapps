import { describe, expect, it } from 'vitest';
import { getMobileReceivables, isMobileReceivable } from '@/lib/mobileReceivables';

const sales = [
  { id: 'old', cliente_id: 'client-a', fecha: '2026-08-01', saldo_pendiente: 100, status: 'confirmado', condicion_pago: 'credito' },
  { id: 'new', cliente_id: 'client-a', fecha: '2026-09-03', saldo_pendiente: 250, status: 'borrador', condicion_pago: 'por_definir' },
  { id: 'cash', cliente_id: 'client-a', fecha: '2026-09-04', saldo_pendiente: 75, status: 'confirmado', condicion_pago: 'contado' },
  { id: 'cancelled', cliente_id: 'client-a', fecha: '2026-09-02', saldo_pendiente: 80, status: 'cancelado', condicion_pago: 'credito' },
  { id: 'paid', cliente_id: 'client-a', fecha: '2026-09-01', saldo_pendiente: 0, status: 'facturado', condicion_pago: 'credito' },
  { id: 'other', cliente_id: 'client-b', fecha: '2026-08-15', saldo_pendiente: 300, status: 'entregado', condicion_pago: 'credito' },
];

describe('mobile receivables', () => {
  it('mantiene cobrable una nota reciente con saldo aunque no sea crédito ni tenga estado final', () => {
    expect(isMobileReceivable(sales[1])).toBe(true);
    expect(isMobileReceivable(sales[2])).toBe(true);
  });

  it('excluye notas canceladas o sin saldo', () => {
    expect(isMobileReceivable(sales[3])).toBe(false);
    expect(isMobileReceivable(sales[4])).toBe(false);
  });

  it('devuelve todas las notas cobrables del cliente y conserva el orden por fecha', () => {
    expect(getMobileReceivables(sales, 'client-a').map(sale => sale.id)).toEqual([
      'old',
      'new',
      'cash',
    ]);
  });

  it('permite seleccionar sólo la nota reciente sin sustituirla por la más antigua', () => {
    const selectedIds = new Set(['new']);
    const selected = getMobileReceivables(sales, 'client-a')
      .filter(sale => selectedIds.has(sale.id));

    expect(selected.map(sale => sale.id)).toEqual(['new']);
    expect(selected.reduce((sum, sale) => sum + Number(sale.saldo_pendiente), 0)).toBe(250);
  });

  it('seleccionar todas o liquidar todo incluye todas las notas cobrables', () => {
    const receivables = getMobileReceivables(sales, 'client-a');
    expect(receivables).toHaveLength(3);
    expect(receivables.reduce((sum, sale) => sum + Number(sale.saldo_pendiente), 0)).toBe(425);
  });
});
