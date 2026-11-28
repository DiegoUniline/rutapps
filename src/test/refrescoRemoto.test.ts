import { QueryClient } from '@tanstack/react-query';
import {
  AGRUPAR_REMOTO_MS,
  CONTEO_REMOTO_MS,
  INTERVALO_REMOTO_MS,
  programarRefrescoRemoto,
  reiniciarRefrescoRemoto,
} from '@/lib/refresco/refrescoRemoto';

describe('programarRefrescoRemoto (cambios de otro dispositivo)', () => {
  let qc: QueryClient;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    qc = new QueryClient();
  });
  afterEach(() => {
    reiniciarRefrescoRemoto(qc);
    vi.useRealTimers();
  });

  const invalida = (k: unknown[]) => qc.getQueryState(k)?.isInvalidated;
  const sembrar = (k: unknown[]) => qc.setQueryData(k, [], { updatedAt: Date.now() - 60_000 });

  it('una ráfaga de eventos produce UNA invalidación', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    for (let i = 0; i < 50; i++) programarRefrescoRemoto(qc, { tablas: ['venta_lineas'] });
    programarRefrescoRemoto(qc, { tablas: ['ventas'] });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('como máximo una recarga por intervalo aunque sigan llegando eventos', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    programarRefrescoRemoto(qc, { tablas: ['ventas'] });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    // Eventos continuos durante el intervalo: no se recarga antes de que pase.
    for (let t = 0; t < INTERVALO_REMOTO_MS - AGRUPAR_REMOTO_MS - 100; t += 500) {
      programarRefrescoRemoto(qc, { tablas: ['ventas'] });
      vi.advanceTimersByTime(500);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('usa el mapa central: una venta remota marca existencias, CxC y listas de ventas, no lo ajeno', () => {
    for (const k of [['ventas', 'e1'], ['cuentas-cobrar', 'e1'], ['stock-almacen-form', 'x'], ['marcas', 'e1']]) sembrar(k);
    programarRefrescoRemoto(qc, { tablas: ['ventas'] });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(invalida(['ventas', 'e1'])).toBe(true);
    expect(invalida(['cuentas-cobrar', 'e1'])).toBe(true);
    expect(invalida(['stock-almacen-form', 'x'])).toBe(true);
    expect(invalida(['marcas', 'e1'])).toBe(false);
  });

  it('un cambio de stock no recarga el catálogo de productos; productos solo usa sus claves explícitas', () => {
    sembrar(['productos', 'e1']);
    sembrar(['pos-stock-almacen', 'e1']);
    sembrar(['venta', 'v1']); // lee productos embebidos: no debe recargarse por un evento de productos
    programarRefrescoRemoto(qc, { tablas: ['stock_almacen'] });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(invalida(['pos-stock-almacen', 'e1'])).toBe(true);
    expect(invalida(['productos', 'e1'])).toBe(false);

    vi.advanceTimersByTime(INTERVALO_REMOTO_MS);
    programarRefrescoRemoto(qc, { tablas: ['productos'], claves: [['productos']] });
    vi.advanceTimersByTime(INTERVALO_REMOTO_MS);
    expect(invalida(['productos', 'e1'])).toBe(true);
    expect(invalida(['venta', 'v1'])).toBe(false);
  });

  it('las claves explícitas se respetan por prefijo completo', () => {
    sembrar(['ventas-hoy', 'e1', 'x']);
    sembrar(['ventas-hoy', 'e2', 'x']);
    programarRefrescoRemoto(qc, { claves: [['ventas-hoy', 'e1']] });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(invalida(['ventas-hoy', 'e1', 'x'])).toBe(true);
    expect(invalida(['ventas-hoy', 'e2', 'x'])).toBe(false);
  });

  it('los conteos de pestañas esperan hasta 30 s', () => {
    sembrar(['ventas', 'e1', 'conteo']);
    programarRefrescoRemoto(qc, { tablas: ['ventas'] });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(invalida(['ventas', 'e1', 'conteo'])).toBe(false);
    vi.advanceTimersByTime(CONTEO_REMOTO_MS);
    expect(invalida(['ventas', 'e1', 'conteo'])).toBe(true);
  });

  it('el resumen de totales de Ventas también espera hasta 30 s (no cada 5 s)', () => {
    sembrar(['ventas-resumen', 'e1']);
    programarRefrescoRemoto(qc, { tablas: ['clientes'] }); // clientes sí lo marca (mapa central)
    vi.advanceTimersByTime(INTERVALO_REMOTO_MS);
    expect(invalida(['ventas-resumen', 'e1'])).toBe(false);
    vi.advanceTimersByTime(CONTEO_REMOTO_MS);
    expect(invalida(['ventas-resumen', 'e1'])).toBe(true);
  });

  it('omite lo que ya se recargó después del evento', () => {
    programarRefrescoRemoto(qc, { tablas: ['ventas'] });
    vi.advanceTimersByTime(10);
    qc.setQueryData(['ventas', 'e1'], [], { updatedAt: Date.now() });
    vi.advanceTimersByTime(AGRUPAR_REMOTO_MS);
    expect(invalida(['ventas', 'e1'])).toBe(false);
  });
});
