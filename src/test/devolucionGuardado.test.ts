/**
 * H1: la pantalla «Devolución» de ruta mandaba accion = null (NOT NULL en la BD) y nunca
 * guardaba. Reglas puras del guardado y de la reparación de la cola offline.
 */
import { describe, it, expect } from 'vitest';
import { accionDevolucionODefault, esCantidadDevolucionValida, sanearDevolucionLinea } from '@/lib/devolucionGuardado';

describe('accionDevolucionODefault', () => {
  it('sin acción (pantalla Devolución) → reposicion, que no genera crédito ni dinero', () => {
    expect(accionDevolucionODefault(undefined)).toBe('reposicion');
    expect(accionDevolucionODefault(null)).toBe('reposicion');
    expect(accionDevolucionODefault('')).toBe('reposicion');
    expect(accionDevolucionODefault('basura')).toBe('reposicion');
  });

  it('respeta las acciones válidas', () => {
    expect(accionDevolucionODefault('nota_credito')).toBe('nota_credito');
    expect(accionDevolucionODefault('devolucion_dinero')).toBe('devolucion_dinero');
    expect(accionDevolucionODefault('descuento_venta')).toBe('descuento_venta');
  });
});

describe('esCantidadDevolucionValida', () => {
  it('solo cantidades mayores a cero', () => {
    expect(esCantidadDevolucionValida(1)).toBe(true);
    expect(esCantidadDevolucionValida(0.25)).toBe(true);
    expect(esCantidadDevolucionValida('2')).toBe(true);
    expect(esCantidadDevolucionValida(0)).toBe(false);
    expect(esCantidadDevolucionValida(-1)).toBe(false);
    expect(esCantidadDevolucionValida(Number.NaN)).toBe(false);
    expect(esCantidadDevolucionValida(undefined)).toBe(false);
  });
});

describe('sanearDevolucionLinea (cola offline)', () => {
  it('repara un renglón viejo encolado con accion null', () => {
    const r = sanearDevolucionLinea({ id: 'x', devolucion_id: 'd', producto_id: 'p', cantidad: 2, accion: null });
    expect(r.accion).toBe('reposicion');
    expect(r.cantidad).toBe(2);
  });

  it('no toca una acción válida', () => {
    expect(sanearDevolucionLinea({ accion: 'devolucion_dinero' }).accion).toBe('devolucion_dinero');
  });
});
