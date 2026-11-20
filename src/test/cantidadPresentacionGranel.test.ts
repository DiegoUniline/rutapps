import { describe, expect, it } from 'vitest';
import { buildPresentationPatch, leerCantidad, paquetesParaCantidad } from '@/lib/ventaPresentacion';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

// Auditoría 2026-11-20 (presentaciones y granel): el inventario siempre se mueve
// en unidad base (`venta_lineas.cantidad`); `paquetes` es solo el detalle.
const base = { unitPrice: 10, displayPrice: 11.6, rawUnitPrice: 10, rawDisplayPrice: 11.6, basePrecio: 'con_impuestos' as const, redondeo: 'ninguno' };
const pres = (factor: number): ProductoPresentacion => ({ id: 'p', empresa_id: 'e', producto_id: 'x', nombre: 'Caja', factor_base: factor, precio_especial: null, orden: 1, activo: true });

describe('cantidad en unidad base', () => {
  it('2 cajas de 12 = 24 piezas; 3 paquetes de 6 = 18', () => {
    expect(buildPresentationPatch(pres(12), 2, base, { iva_pct: 16 }).cantidad).toBe(24);
    expect(buildPresentationPatch(pres(6), 3, base, { iva_pct: 16 }).cantidad).toBe(18);
  });

  it('a granel conserva kilos sin redondear a enteros', () => {
    expect(buildPresentationPatch(null, 1.75, base, {}).cantidad).toBe(1.75);
    expect(buildPresentationPatch(pres(0.5), 3, base, {}).cantidad).toBe(1.5);
    expect(buildPresentationPatch(pres(2.5), 0.333, base, {}).cantidad).toBe(0.8325);
  });
});

describe('leerCantidad', () => {
  it('a granel acepta hasta 3 decimales (antes Math.floor/parseInt los perdía)', () => {
    expect(leerCantidad('7.25', true)).toBe(7.25);
    expect(leerCantidad('0.3333', true)).toBe(0.333);
    expect(leerCantidad('1,75', true)).toBe(1.75);
    expect(leerCantidad('.5', true)).toBe(0.5);
  });

  it('por pieza sigue en enteros', () => {
    expect(leerCantidad('7.9', false)).toBe(7);
    expect(leerCantidad('12', false)).toBe(12);
  });

  it('texto inválido regresa NaN', () => {
    expect(Number.isNaN(leerCantidad('', true))).toBe(true);
    expect(Number.isNaN(leerCantidad('abc', false))).toBe(true);
  });
});

describe('paquetesParaCantidad', () => {
  const caja = { presentacion_factor: 12, paquetes: 2 };

  it('por pieza recalcula los paquetes al cambiar las piezas', () => {
    expect(paquetesParaCantidad(caja, 23, false)).toBe(1.917);
    expect(paquetesParaCantidad(caja, 36, false)).toBe(3);
  });

  it('a granel conserva los paquetes (el peso real puede diferir)', () => {
    expect(paquetesParaCantidad({ presentacion_factor: 5, paquetes: 2 }, 9.7, true)).toBe(2);
  });

  it('sin presentación no inventa paquetes', () => {
    expect(paquetesParaCantidad({ presentacion_factor: null, paquetes: null }, 5, false)).toBeNull();
  });
});
