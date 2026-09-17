import { describe, expect, it } from 'vitest';
import { buildPresentationPatch, presentationSummary } from '@/lib/ventaPresentacion';
import { calculateSaleLineAmounts, type SaleLinePricingLike } from '@/lib/salePricing';
import { pickColumns, VENTA_LINEA_COLUMNS } from '@/lib/allowlist';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

const box: ProductoPresentacion = { id: 'box', empresa_id: 'e', producto_id: 'p', nombre: 'Caja', factor_base: 12, precio_especial: null, orden: 1, activo: true };
const base = { unitPrice: 10, displayPrice: 11.6, rawUnitPrice: 10, rawDisplayPrice: 11.6, basePrecio: 'con_impuestos' as const, redondeo: 'ninguno' };

describe('admin sale presentations', () => {
  it('converts packages to inventory units and keeps list pricing', () => {
    const line = buildPresentationPatch(box, 2, base, { iva_pct: 16 });
    expect(line).toMatchObject({ cantidad: 24, paquetes: 2, presentacion_factor: 12, precio_unitario: 10, precio_manual: false });
    expect(calculateSaleLineAmounts({ ...line, iva_pct: 16 } as SaleLinePricingLike).total).toBe(278.4);
    expect(presentationSummary(line, 'pz')).toBe('2 × Caja (12 pz c/u) · 24 pz');
  });

  it.each([0, 16])('preserves a $100 package price with %s%% IVA before and after saving', iva_pct => {
    const line = { ...buildPresentationPatch({ ...box, precio_especial: 100 }, 2, base, { iva_pct }), iva_pct };
    expect(calculateSaleLineAmounts(line as SaleLinePricingLike).total).toBe(200);
    const saved = pickColumns(line, VENTA_LINEA_COLUMNS);
    expect(saved).toMatchObject({ presentacion_id: 'box', presentacion_nombre: 'Caja', paquetes: 2, cantidad: 24 });
    expect(calculateSaleLineAmounts(saved as SaleLinePricingLike).total).toBe(200);
    expect(presentationSummary(saved, 'pz')).toContain('2 × Caja');
  });

  it('handles discounts, IEPS/IVA and tax removal without double taxation', () => {
    const line = { ...buildPresentationPatch({ ...box, precio_especial: 125.28 }, 2, base, { iva_pct: 16, ieps_pct: 8 }), iva_pct: 16, ieps_pct: 8, descuento_pct: 10 };
    expect(calculateSaleLineAmounts(line as SaleLinePricingLike).total).toBe(225.5);
    expect(calculateSaleLineAmounts(line as SaleLinePricingLike, true).total).toBe(180);
  });

  it('clears presentation metadata and restores list pricing when returning to base units', () => {
    expect(buildPresentationPatch(null, 24, base, { iva_pct: 16 })).toMatchObject({ cantidad: 24, paquetes: null, presentacion_id: null, presentacion_nombre: null, presentacion_factor: null, precio_unitario: 10, precio_manual: false });
  });

  it('shows historical snapshots without needing an active catalog entry', () => {
    expect(presentationSummary({ presentacion_nombre: 'Saco', presentacion_factor: 25, paquetes: 2, cantidad: 49.5 }, 'kg')).toBe('2 × Saco (25 kg c/u) · 49.5 kg');
    expect(presentationSummary({ cantidad: 3 }, 'pz')).toBe('');
    expect(presentationSummary({ presentacion_nombre: 'Caja', presentacion_factor: 12, cantidad: 24 }, 'pz')).toContain('2 × Caja');
  });

  it('accepts fractional packages and rejects invalid factors', () => {
    expect(buildPresentationPatch(box, 0.5, base, {}).cantidad).toBe(6);
    expect(() => buildPresentationPatch({ ...box, factor_base: 0 }, 1, base, {})).toThrow();
  });
});
