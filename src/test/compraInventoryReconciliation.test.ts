import { describe, expect, it } from 'vitest';
import {
  calcularImpactoEdicionCompra,
  type CompraInventoryLine,
} from '@/lib/compraInventoryReconciliation';

const recibida = (overrides: Partial<CompraInventoryLine> = {}): CompraInventoryLine => ({
  id: 'linea-1',
  productoId: 'producto-1',
  piezasTotales: 10,
  piezasRecibidas: 10,
  requiereLote: false,
  ...overrides,
});
describe('conciliación de inventario al editar una compra', () => {
  it('suma únicamente la diferencia cuando la cantidad aumenta', () => {
    const impact = calcularImpactoEdicionCompra(
      [recibida()],
      [recibida({ piezasTotales: 12 })],
      'recibida',
    );
    expect(impact).toEqual({ entradas: 2, salidas: 0, pendientes: 0, bloqueos: [] });
  });

  it('resta únicamente la diferencia cuando la cantidad disminuye', () => {
    const impact = calcularImpactoEdicionCompra(
      [recibida()],
      [recibida({ piezasTotales: 7 })],
      'recibida',
    );
    expect(impact).toEqual({ entradas: 0, salidas: 3, pendientes: 0, bloqueos: [] });
  });

  it('revierte exactamente lo recibido al eliminar un renglón', () => {
    const impact = calcularImpactoEdicionCompra([recibida()], [], 'recibida');
    expect(impact).toEqual({ entradas: 0, salidas: 10, pendientes: 0, bloqueos: [] });
  });

  it('no toca inventario cuando sólo cambia el costo', () => {
    const impact = calcularImpactoEdicionCompra([recibida()], [recibida()], 'recibida');
    expect(impact).toEqual({ entradas: 0, salidas: 0, pendientes: 0, bloqueos: [] });
  });

  it('en una recepción parcial conserva lo recibido y deja pendiente el aumento', () => {
    const anterior = recibida({ piezasRecibidas: 5 });
    const siguiente = recibida({ piezasTotales: 12, piezasRecibidas: 5 });
    const impact = calcularImpactoEdicionCompra([anterior], [siguiente], 'confirmada');
    expect(impact).toEqual({ entradas: 0, salidas: 0, pendientes: 7, bloqueos: [] });
  });

  it('un aumento con lote queda pendiente hasta seleccionar el lote', () => {
    const anterior = recibida({ requiereLote: true });
    const siguiente = recibida({ requiereLote: true, piezasTotales: 12 });
    const impact = calcularImpactoEdicionCompra([anterior], [siguiente], 'recibida');
    expect(impact).toEqual({ entradas: 0, salidas: 0, pendientes: 2, bloqueos: [] });
  });

  it('recibe automáticamente un renglón nuevo sin lote en una compra recibida', () => {
    const nuevo = recibida({ id: null, productoId: 'producto-2', piezasTotales: 4, piezasRecibidas: 0 });
    const impact = calcularImpactoEdicionCompra([], [nuevo], 'recibida');
    expect(impact).toEqual({ entradas: 4, salidas: 0, pendientes: 0, bloqueos: [] });
  });

  it('es idempotente al repetir el mismo estado ya conciliado', () => {
    const estado = recibida({ piezasTotales: 12, piezasRecibidas: 12 });
    const impact = calcularImpactoEdicionCompra([estado], [estado], 'recibida');
    expect(impact).toEqual({ entradas: 0, salidas: 0, pendientes: 0, bloqueos: [] });
  });

  it('bloquea cambiar de producto si el renglón ya fue recibido', () => {
    const impact = calcularImpactoEdicionCompra(
      [recibida()],
      [recibida({ productoId: 'producto-2' })],
      'recibida',
    );
    expect(impact.bloqueos).toHaveLength(1);
  });
});
