// Fase 2 «NO PERDER VENTAS»: funciones puras (sin IndexedDB ni red).
import { describe, it, expect } from 'vitest';
import { classifySyncError, esErrorDeSesion } from '@/lib/syncErrorClassify';
import { asegurarSesionParaSubir, type AuthMinimo } from '@/lib/syncSesion';
import { pendientesDeTabla, superponerPendientes, copiasLocalesDeRpc } from '@/lib/pendientesLocales';
import { armarPayloadVentaRuta, vendidoPorProducto } from '@/lib/ventaRutaRpc';
import type { SyncQueueItem } from '@/lib/offlineDb';

describe('clasificador: sesión vencida y RPC no publicada', () => {
  it('JWT vencido (PGRST301 / 401 / mensaje) → auth, nunca dead-letter', () => {
    expect(classifySyncError({ err: { code: 'PGRST301', message: 'JWT expired' }, table: 'ventas', newRetries: 99 })).toBe('auth');
    expect(classifySyncError({ err: { status: 401, message: 'Unauthorized' }, table: 'cobros', newRetries: 1 })).toBe('auth');
    expect(classifySyncError({ err: { message: 'JWT expired' }, table: 'rpc:fn_ruta_registrar_venta', newRetries: 1 })).toBe('auth');
  });
  it('RLS 42501 de una tabla padre NO es sesión', () => {
    expect(esErrorDeSesion({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
  });
  it('RPC aún no publicada (PGRST202) → transient', () => {
    expect(classifySyncError({ err: { code: 'PGRST202', message: 'Could not find the function' }, table: 'rpc:fn_ruta_carga_sumar_vendido', newRetries: 9 })).toBe('transient');
  });
  it('RPC con padre que aún no sube (23503) → defer', () => {
    expect(classifySyncError({ err: { code: '23503', message: 'Falta en el servidor' }, table: 'rpc:fn_ruta_registrar_venta', newRetries: 1 })).toBe('defer');
  });
});

function authFalso(opts: { expira: number; refresco?: { ok: boolean; error?: { name?: string; status?: number; message?: string } } }): AuthMinimo & { refrescos: number } {
  const a = {
    refrescos: 0,
    async getSession() { return { data: { session: { expires_at: opts.expira } }, error: null }; },
    async refreshSession() {
      a.refrescos++;
      if (opts.refresco?.ok !== false) return { data: { session: { expires_at: opts.expira + 3600 } }, error: null };
      return { data: { session: null }, error: opts.refresco?.error ?? null };
    },
  };
  return a;
}

describe('asegurarSesionParaSubir', () => {
  const ahora = 1_700_000_000_000;
  it('token vigente → ok sin refrescar', async () => {
    const a = authFalso({ expira: ahora / 1000 + 3600 });
    expect(await asegurarSesionParaSubir(a, { ahora })).toBe('ok');
    expect(a.refrescos).toBe(0);
  });
  it('por vencer → refresca', async () => {
    const a = authFalso({ expira: ahora / 1000 + 30 });
    expect(await asegurarSesionParaSubir(a, { ahora })).toBe('ok');
    expect(a.refrescos).toBe(1);
  });
  it('refresh token inválido → vencida', async () => {
    const a = authFalso({ expira: ahora / 1000 - 10, refresco: { ok: false, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } } });
    expect(await asegurarSesionParaSubir(a, { ahora })).toBe('vencida');
  });
  it('sin red al refrescar → sin_red', async () => {
    const a = authFalso({ expira: ahora / 1000 - 10, refresco: { ok: false, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } } });
    expect(await asegurarSesionParaSubir(a, { ahora })).toBe('sin_red');
  });
});

const item = (id: number, p: Partial<SyncQueueItem>): SyncQueueItem => ({
  id, table: 'ventas', operation: 'insert', data: {}, keyField: 'id', keyValue: '', createdAt: id, retries: 0, ...p,
});

describe('pendientesDeTabla / superponerPendientes', () => {
  it('combina cambios en orden, alta + baja posterior se anula', () => {
    const p = pendientesDeTabla([
      item(1, { operation: 'update', keyValue: 'a', data: { id: 'a', x: 1 } }),
      item(2, { operation: 'update', keyValue: 'a', data: { id: 'a', y: 2 } }),
      item(3, { operation: 'insert', keyValue: 'b', data: { id: 'b', total: 5 } }),
      item(4, { operation: 'delete', keyValue: 'b', data: { id: 'b' } }),
      item(5, { table: 'venta_lineas', operation: 'insert-many', keyValue: 'v', data: [{ id: 'l1', venta_id: 'v' }] }),
    ], 'ventas');
    expect(p.cambios.get('a')).toEqual({ id: 'a', x: 1, y: 2 });
    expect(p.altas.has('b')).toBe(false);
    expect(p.bajas.has('b')).toBe(true);
  });
  it('reponer alta borrada; respetar la del servidor; mezclar cambios', () => {
    const p = pendientesDeTabla([
      item(1, { operation: 'insert', keyValue: 'nueva', data: { id: 'nueva', total: 3 } }),
      item(2, { operation: 'insert', keyValue: 'subida', data: { id: 'subida', status: 'confirmado' } }),
      item(3, { operation: 'update', keyValue: 'srv', data: { id: 'srv', notas: 'n' } }),
    ], 'ventas');
    const r = superponerPendientes(new Map<string, Record<string, unknown> | undefined>([
      ['nueva', undefined],
      ['subida', { id: 'subida', status: 'cancelado' }],
      ['srv', { id: 'srv', total: 9 }],
    ]), p);
    expect(r.poner).toEqual(expect.arrayContaining([{ id: 'nueva', total: 3 }, { id: 'srv', total: 9, notas: 'n' }]));
    expect(r.poner.find(f => f.id === 'subida')).toBeUndefined();
  });
  it('copias locales de la venta completa y de la devolución', () => {
    const c = copiasLocalesDeRpc('rpc:fn_ruta_registrar_venta', { p_venta: { venta: { id: 'v', empresa_id: 'e' }, lineas: [{ id: 'l' }], cobros: [{ id: 'c', aplicaciones: [{ id: 'a', venta_id: 'v' }] }] } });
    const porTabla = Object.fromEntries(c.map(x => [x.tabla, x.filas]));
    expect(porTabla.venta_lineas).toEqual([{ id: 'l', venta_id: 'v' }]);
    expect(porTabla.cobro_aplicaciones).toEqual([{ id: 'a', venta_id: 'v', cobro_id: 'c' }]);
    const d = copiasLocalesDeRpc('rpc:registrar_devolucion', { p_devolucion: { id: 'd' }, p_lineas: [{ id: 'dl' }] });
    expect(d.find(x => x.tabla === 'devolucion_lineas')?.filas[0]).toMatchObject({ id: 'dl', devolucion_id: 'd' });
    expect(copiasLocalesDeRpc('rpc:otra', { a: 1 })).toEqual([]);
  });
});

describe('payload de la venta de ruta', () => {
  it('fuerza venta_id en hijos, quita carga vacía y exige renglones', () => {
    const r = armarPayloadVentaRuta({
      venta: { id: 'v' }, lineas: [{ id: 'l', venta_id: 'otra' }], lineas_lotes: [], promociones: [{ id: 'p' }],
      cobros: [], carga: { carga_id: 'c', lineas: [] },
    });
    expect(r.p_venta.lineas[0].venta_id).toBe('v');
    expect(r.p_venta.promociones[0].venta_id).toBe('v');
    expect(r.p_venta.carga).toBeNull();
    expect(() => armarPayloadVentaRuta({ venta: { id: 'v' }, lineas: [], lineas_lotes: [], promociones: [], cobros: [], carga: null })).toThrow();
  });
  it('lo vendido se suma por producto (dos renglones del mismo producto ya no se pisan)', () => {
    expect(vendidoPorProducto([
      { producto_id: 'a', cantidad: 2 }, { producto_id: 'b', cantidad: 1 }, { producto_id: 'a', cantidad: 3 }, { producto_id: 'c', cantidad: 0 },
    ])).toEqual([{ producto_id: 'a', cantidad: 5 }, { producto_id: 'b', cantidad: 1 }]);
  });
});
