import { describe, expect, it } from 'vitest';
import { evaluatePromociones, type Promocion } from '@/hooks/usePromociones';

const productoGratis = (overrides: Partial<Promocion> = {}): Promocion => ({
  id: 'promo-vuala',
  empresa_id: 'empresa-tampico',
  nombre: 'VUALA SORP+PAS',
  descripcion: null,
  tipo: 'producto_gratis',
  aplica_a: 'producto',
  activa: true,
  valor: 0,
  cantidad_minima: 1,
  cantidad_gratis: 1,
  producto_gratis_id: 'pastelito',
  producto_ids: ['cajeta', 'chocolate', 'vainilla'],
  clasificacion_ids: [],
  cliente_ids: [],
  zona_ids: [],
  vigencia_inicio: null,
  vigencia_fin: null,
  dias_semana: [],
  prioridad: 1,
  acumulable: false,
  created_at: '2026-07-31T00:00:00Z',
  ...overrides,
});

describe('evaluatePromociones producto_gratis', () => {
  it('acumula tres disparadores distintos en un solo descuento', () => {
    const result = evaluatePromociones([productoGratis()], [
      { producto_id: 'cajeta', precio_unitario: 104, cantidad: 1 },
      { producto_id: 'chocolate', precio_unitario: 104, cantidad: 1 },
      { producto_id: 'vainilla', precio_unitario: 104, cantidad: 1 },
      { producto_id: 'pastelito', precio_unitario: 6.3, cantidad: 3 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      promocion_id: 'promo-vuala',
      producto_id: 'pastelito',
      cantidad_gratis: 3,
      descuento: 18.9,
    });
  });

  it('limita el regalo a las unidades existentes en el carrito', () => {
    const result = evaluatePromociones([productoGratis()], [
      { producto_id: 'cajeta', precio_unitario: 104, cantidad: 2 },
      { producto_id: 'chocolate', precio_unitario: 104, cantidad: 2 },
      { producto_id: 'pastelito', precio_unitario: 6.3, cantidad: 2 },
    ]);

    expect(result[0]).toMatchObject({ cantidad_gratis: 2, descuento: 12.6 });
  });

  it('conserva el comportamiento cuando regalo y disparador son el mismo producto', () => {
    const promo = productoGratis({
      producto_gratis_id: 'cajeta',
      producto_ids: ['cajeta'],
      cantidad_minima: 3,
    });
    const result = evaluatePromociones([promo], [
      { producto_id: 'cajeta', precio_unitario: 10, cantidad: 6 },
    ]);

    expect(result[0]).toMatchObject({ cantidad_gratis: 2, descuento: 20 });
  });
});