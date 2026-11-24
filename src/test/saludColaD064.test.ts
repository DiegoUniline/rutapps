// D-064 · Estado de la cola que se reporta como salud del dispositivo (IndexedDB simulada).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: () => { throw new Error('no se espera red en esta prueba'); },
    rpc: async () => ({ data: null, error: null }),
  },
}));

const { offlineDb } = await import('@/lib/offlineDb');
const { estadoSaludCola, processSyncQueue, LS_ULTIMO_SYNC_OK, SYNC_QUEUE_MAX_RETRIES } = await import('@/lib/syncQueue');

beforeEach(async () => {
  await offlineDb.syncQueue.clear();
  localStorage.removeItem(LS_ULTIMO_SYNC_OK);
});

describe('salud de la cola', () => {
  it('cuenta pendientes y fallidas (dead-letter) y toma el último error intentado', async () => {
    await offlineDb.syncQueue.bulkAdd([
      { table: 'ventas', operation: 'insert', data: { id: 'v1' }, keyField: 'id', keyValue: 'v1', createdAt: 1, retries: 0, rev: 0 },
      { table: 'cobros', operation: 'insert', data: { id: 'c1' }, keyField: 'id', keyValue: 'c1', createdAt: 2, retries: 2, rev: 0, lastError: 'timeout viejo', lastAttemptAt: 100 },
      { table: 'clientes', operation: 'insert', data: { id: 'k1' }, keyField: 'id', keyValue: 'k1', createdAt: 3, retries: SYNC_QUEUE_MAX_RETRIES + 1, rev: 0, lastError: 'violates check constraint', lastAttemptAt: 200 },
    ]);
    const e = await estadoSaludCola();
    expect(e.pendientes).toBe(2);
    expect(e.fallidas).toBe(1);
    expect(e.ultimoError).toBe('clientes: violates check constraint');
    expect(e.ultimoSyncOk).toBeNull();
    // El estado NO lleva los datos de las filas.
    expect(JSON.stringify(e)).not.toContain('v1');
  });

  it('una pasada con la cola vacía marca la última sincronización correcta', async () => {
    const antes = Date.now();
    await processSyncQueue();
    const e = await estadoSaludCola();
    expect(e.pendientes).toBe(0);
    expect(e.ultimoSyncOk).not.toBeNull();
    expect(e.ultimoSyncOk!).toBeGreaterThanOrEqual(antes);
  });
});
