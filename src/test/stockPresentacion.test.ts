import { describe, expect, it } from 'vitest';
import { getStockBreakdown } from '@/lib/stockPresentacion';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

// Fábrica mínima: solo los campos que usa getStockBreakdown.
const pres = (o: Partial<ProductoPresentacion>): ProductoPresentacion =>
  ({ es_principal_stock: true, activo: true, ...o } as ProductoPresentacion);

describe('getStockBreakdown', () => {
  it('regresa null cuando no hay presentaciones', () => {
    expect(getStockBreakdown(30, null, 'pz')).toBeNull();
    expect(getStockBreakdown(30, [], 'pz')).toBeNull();
  });

  it('regresa null cuando no hay presentación principal activa', () => {
    const ps = [pres({ es_principal_stock: false, factor_base: 12, nombre: 'caja' })];
    expect(getStockBreakdown(30, ps, 'pz')).toBeNull();
  });

  it('regresa null cuando el factor es 0 o inválido', () => {
    const ps = [pres({ factor_base: 0, nombre: 'caja' })];
    expect(getStockBreakdown(30, ps, 'pz')).toBeNull();
  });

  it('desglosa paquetes + resto', () => {
    const ps = [pres({ factor_base: 12, nombre: 'caja' })];
    const r = getStockBreakdown(30, ps, 'pz');
    expect(r).not.toBeNull();
    expect(r!.paquetes).toBe(2);
    expect(r!.resto).toBe(6);
    expect(r!.texto).toBe('2 caja + 6 pz');
  });

  it('múltiplo exacto: sin resto', () => {
    const ps = [pres({ factor_base: 12, nombre: 'caja' })];
    const r = getStockBreakdown(24, ps, 'pz');
    expect(r!.paquetes).toBe(2);
    expect(r!.resto).toBe(0);
    expect(r!.texto).toBe('2 caja');
  });

  it('menos de un paquete: solo resto en unidad base', () => {
    const ps = [pres({ factor_base: 12, nombre: 'caja' })];
    const r = getStockBreakdown(5, ps, 'pz');
    expect(r!.paquetes).toBe(0);
    expect(r!.resto).toBe(5);
    expect(r!.texto).toBe('5 pz');
  });

  it('resto fraccionario se muestra con decimales', () => {
    const ps = [pres({ factor_base: 12, nombre: 'caja' })];
    const r = getStockBreakdown(12.5, ps, 'pz');
    expect(r!.paquetes).toBe(1);
    expect(r!.resto).toBe(0.5);
    expect(r!.texto).toBe('1 caja + 0.5 pz');
  });

  it('stock negativo se trata como 0', () => {
    const ps = [pres({ factor_base: 12, nombre: 'caja' })];
    const r = getStockBreakdown(-5, ps, 'pz');
    expect(r!.paquetes).toBe(0);
    expect(r!.resto).toBe(0);
    expect(r!.texto).toBe('0 pz');
  });

  it('elige la presentación principal entre varias', () => {
    const ps = [
      pres({ es_principal_stock: false, factor_base: 6, nombre: 'media' }),
      pres({ es_principal_stock: true, factor_base: 12, nombre: 'caja' }),
    ];
    const r = getStockBreakdown(30, ps, 'pz');
    expect(r!.presentacion.nombre).toBe('caja');
    expect(r!.paquetes).toBe(2);
  });
});
