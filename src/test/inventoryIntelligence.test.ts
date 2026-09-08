import { describe, expect, it } from 'vitest';
import { analyzeInventoryProduct, getAbcClasses, getExpirationHealth } from '@/lib/inventoryIntelligence';

const base = {
  id: 'p1', stock: 100, cost: 10, price: 18, soldUnits: 60, windowDays: 60,
  targetCoverageDays: 14, leadTimeDays: 3, createdAt: '2026-01-01', referenceDate: '2026-09-08',
};

describe('inventory intelligence', () => {
  it('calcula capital, cobertura y margen potencial', () => {
    const row = analyzeInventoryProduct({ ...base, lastSaleAt: '2026-09-07' });
    expect(row.inventoryValue).toBe(1_000);
    expect(row.potentialMargin).toBe(800);
    expect(row.coverageDays).toBe(100);
    expect(row.health).toBe('lento');
  });

  it('detecta quiebre y recomienda sólo lo necesario', () => {
    const row = analyzeInventoryProduct({ ...base, stock: 3, soldUnits: 60, lastSaleAt: '2026-09-08' });
    expect(row.health).toBe('critico');
    expect(row.suggestedPurchase).toBe(14);
  });

  it('marca capital detenido sin ventas durante 90 días', () => {
    const row = analyzeInventoryProduct({ ...base, soldUnits: 0, lastInboundAt: '2026-04-01' });
    expect(row.health).toBe('detenido');
    expect(row.idleDays).toBeGreaterThan(90);
  });

  it('clasifica lotes vencidos y próximos a vencer', () => {
    expect(getExpirationHealth('2026-09-01', '2026-09-08').health).toBe('vencido');
    expect(getExpirationHealth('2026-09-12', '2026-09-08').health).toBe('critico');
    expect(getExpirationHealth(null, '2026-09-08').health).toBe('sin_fecha');
  });

  it('calcula ABC sin excluir el producto que cruza el 80%', () => {
    const rows = getAbcClasses([{ revenue: 70 }, { revenue: 20 }, { revenue: 10 }]);
    expect(rows.map(row => row.abcClass)).toEqual(['A', 'A', 'B']);
  });
});
