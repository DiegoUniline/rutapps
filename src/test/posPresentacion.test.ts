import { describe, it, expect } from 'vitest';
import { buildPresentationPatch } from '@/lib/ventaPresentacion';
import { buildPosLinePricing } from '@/lib/posPricing';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

// Mismo armado que addGranelLine del POS: precio de la línea vía buildPresentationPatch.
const caja: ProductoPresentacion = { id: 'caja', empresa_id: 'e', producto_id: 'p', nombre: 'Caja', factor_base: 12, precio_especial: 100, orden: 1, activo: true };
const lista = { unitPrice: 10, displayPrice: 11.6, rawUnitPrice: 10, rawDisplayPrice: 11.6, basePrecio: 'sin_impuestos' as const, redondeo: 'ninguno' };

function lineaPos(pres: ProductoPresentacion | null, cantidad: number, iva_pct: number) {
  const p = buildPresentationPatch(pres, 1, lista, { iva_pct });
  return {
    precio_unitario: Number(p.precio_unitario),
    precio_unitario_sin_redondeo: Number(p.precio_unitario_sin_redondeo),
    precio_display_sin_redondeo: Number(p.precio_display_sin_redondeo),
    cantidad, tiene_iva: iva_pct > 0, iva_pct, tiene_ieps: false, ieps_pct: 0,
    base_precio: p.base_precio as 'con_impuestos' | 'sin_impuestos', redondeo: String(p.redondeo),
    precio_manual: !!p.precio_manual,
  };
}

describe('POS: precio de presentación', () => {
  it.each([0, 16])('una caja de $100 (12 pz) cobra $100 con IVA %s%%, sin sumarle impuesto otra vez', iva => {
    const l = lineaPos(caja, 12, iva);
    expect(buildPosLinePricing(l).finalGross).toBe(100);
    expect(l.precio_manual).toBe(true); // el re-precio por lista no lo pisa
  });

  it('dos cajas cobran $200', () => {
    expect(buildPosLinePricing(lineaPos(caja, 24, 16)).finalGross).toBe(200);
  });

  it('sin precio especial usa el precio de lista (neto + IVA), no el bruto como neto', () => {
    const l = lineaPos({ ...caja, precio_especial: null }, 12, 16);
    expect(buildPosLinePricing(l).finalGross).toBe(139.2);
    expect(l.precio_manual).toBe(false);
  });
});
