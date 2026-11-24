// D-064 · El cursor de sincronización queda ligado a la empresa: si la entrada guardada es de
// otra empresa, no se usa (descarga completa) y se re-estampa con la empresa activa.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Op = [string, unknown[]];
const consultas: { tabla: string; ops: Op[] }[] = [];

function constructor(tabla: string) {
  const rec = { tabla, ops: [] as Op[] };
  consultas.push(rec);
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'or', 'gte', 'lte', 'order', 'range', 'neq', 'not', 'is', 'limit']) {
    b[m] = (...a: unknown[]) => { rec.ops.push([m, a]); return b; };
  }
  b.maybeSingle = async () => ({ data: { maneja_lotes: false }, error: null });
  b.then = (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => {
    const esConteo = rec.ops.some(([m, a]) => m === 'select' && (a[1] as { head?: boolean } | undefined)?.head);
    let r: unknown;
    if (tabla === 'feature_flags') r = { data: [], error: null };
    else if (esConteo) r = { count: 1, data: null, error: null };
    else r = { data: [{ id: 'p1', empresa_id: 'emp-A', nombre: 'Producto', updated_at: '2026-11-20T00:00:00.000Z' }], error: null };
    return Promise.resolve(r).then(ok, mal);
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => constructor(t), rpc: async () => ({ data: null, error: null }) },
}));

const { offlineDb } = await import('@/lib/offlineDb');
const { downloadAllData, cursorDeEmpresa, LS_LAST_EMPRESA, LS_SYNC_EPOCH, SYNC_EPOCH } = await import('@/lib/offlineSync');

const CURSOR_VIEJO = '2026-01-01T00:00:00.000Z';

function usoCursor(): boolean {
  return consultas
    .filter((c) => c.tabla === 'productos')
    .some((c) => c.ops.some(([m, a]) => m === 'gte' && a[0] === 'updated_at' && a[1] === CURSOR_VIEJO));
}

beforeEach(async () => {
  consultas.length = 0;
  await offlineDb.cacheTimestamps.clear();
  await offlineDb.productos.clear();
  localStorage.setItem(LS_LAST_EMPRESA, 'emp-A');
  localStorage.setItem(LS_SYNC_EPOCH, SYNC_EPOCH);
});

describe('cursorDeEmpresa (pura)', () => {
  it('descarta la entrada de otra empresa y acepta la propia y la anterior al cambio', () => {
    const base = { table: 'productos', lastSync: 1, cursor: CURSOR_VIEJO };
    expect(cursorDeEmpresa({ ...base, empresaId: 'emp-B' }, 'emp-A')).toBeUndefined();
    expect(cursorDeEmpresa({ ...base, empresaId: 'emp-A' }, 'emp-A')?.cursor).toBe(CURSOR_VIEJO);
    expect(cursorDeEmpresa(base, 'emp-A')?.cursor).toBe(CURSOR_VIEJO);
    expect(cursorDeEmpresa(undefined, 'emp-A')).toBeUndefined();
  });
});

describe('downloadAllData con cursor por empresa (IndexedDB simulada)', () => {
  it('cursor de OTRA empresa: no se usa (baja completa) y queda estampado con la empresa activa', async () => {
    await offlineDb.cacheTimestamps.put({
      table: 'productos', empresaId: 'emp-B', lastSync: Date.now(), lastSuccessAt: Date.now(),
      lastFullAt: Date.now(), cursor: CURSOR_VIEJO,
    });
    await downloadAllData('emp-A', false, undefined, { tables: ['productos'] });
    expect(usoCursor()).toBe(false);
    const entrada = await offlineDb.cacheTimestamps.get('productos');
    expect(entrada?.empresaId).toBe('emp-A');
    expect(entrada?.cursor).toBe('2026-11-20T00:00:00.000Z');
    expect(await offlineDb.productos.count()).toBe(1);
  });

  it('cursor de la MISMA empresa: delta desde el cursor (sin cambio de comportamiento)', async () => {
    await offlineDb.cacheTimestamps.put({
      table: 'productos', empresaId: 'emp-A', lastSync: Date.now(), lastSuccessAt: Date.now(),
      lastFullAt: Date.now(), cursor: CURSOR_VIEJO,
    });
    await downloadAllData('emp-A', false, undefined, { tables: ['productos'] });
    expect(usoCursor()).toBe(true);
    expect((await offlineDb.cacheTimestamps.get('productos'))?.empresaId).toBe('emp-A');
  });

  it('entrada anterior al cambio (sin empresa): se sigue usando y se estampa', async () => {
    await offlineDb.cacheTimestamps.put({
      table: 'productos', lastSync: Date.now(), lastSuccessAt: Date.now(), lastFullAt: Date.now(), cursor: CURSOR_VIEJO,
    });
    await downloadAllData('emp-A', false, undefined, { tables: ['productos'] });
    expect(usoCursor()).toBe(true);
    expect((await offlineDb.cacheTimestamps.get('productos'))?.empresaId).toBe('emp-A');
  });

  it('cambio de época (SYNC_EPOCH) sigue borrando todos los cursores', async () => {
    localStorage.setItem(LS_SYNC_EPOCH, 'otra-epoca');
    await offlineDb.cacheTimestamps.put({
      table: 'productos', empresaId: 'emp-A', lastSync: Date.now(), lastFullAt: Date.now(), cursor: CURSOR_VIEJO,
    });
    await downloadAllData('emp-A', false, undefined, { tables: ['productos'] });
    expect(usoCursor()).toBe(false);
    expect(localStorage.getItem(LS_SYNC_EPOCH)).toBe(SYNC_EPOCH);
  });
});
