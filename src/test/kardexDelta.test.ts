import { describe, it, expect } from 'vitest';
import { deltaKardexUbicacion } from '@/hooks/useKardexUbicacion';

const R3 = 'ruta03', R5 = 'ruta05', ALM = 'almacen';
const mov = (tipo: string, origen: string | null, destino: string | null, cantidad = 12, referencia_tipo: string | null = null) =>
  ({ tipo, cantidad, almacen_origen_id: origen, almacen_destino_id: destino, referencia_tipo });

describe('deltaKardexUbicacion', () => {
  it('reasignación (salida + entrada con origen y destino) cuenta una sola vez en cada almacén', () => {
    const par = [mov('salida', R3, R5), mov('entrada', R3, R5)];
    expect(par.reduce((s, m) => s + deltaKardexUbicacion(m, R3), 0)).toBe(-12);
    expect(par.reduce((s, m) => s + deltaKardexUbicacion(m, R5), 0)).toBe(12);
  });
  it('carga a camión: solo entra al camión (el surtido ya descontó el almacén)', () => {
    const m = mov('entrada', ALM, R3, 12, 'entrega_cargado');
    expect(deltaKardexUbicacion(m, R3)).toBe(12);
    expect(deltaKardexUbicacion(m, ALM)).toBe(0);
  });
  it('reverso viejo con mismo almacén de origen y destino: entrada', () => {
    expect(deltaKardexUbicacion(mov('entrada', ALM, ALM, 5, 'cancelacion_venta'), ALM)).toBe(5);
  });
  it('traspaso en un solo renglón: resta en origen y suma en destino', () => {
    const m = mov('traspaso', ALM, R3, 24);
    expect(deltaKardexUbicacion(m, ALM)).toBe(-24);
    expect(deltaKardexUbicacion(m, R3)).toBe(24);
  });
  it('venta y ajuste simples', () => {
    expect(deltaKardexUbicacion(mov('salida', R3, null, 6), R3)).toBe(-6);
    expect(deltaKardexUbicacion(mov('entrada', null, R3, 24), R3)).toBe(24);
  });
});
