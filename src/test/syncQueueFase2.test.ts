// Fase 2 «NO PERDER VENTAS»: pruebas de la cola offline con IndexedDB simulada
// (fake-indexeddb) y un servidor Supabase falso en memoria.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Fila = Record<string, unknown> & { id: string };
type ErrorPg = { code?: string; message: string; status?: number };

// ── Servidor falso ───────────────────────────────────────────────────────────────
const servidor = {
  tablas: new Map<string, Map<string, Fila>>(),
  rpcs: new Map<string, (args: Record<string, unknown>) => { data: unknown; error: ErrorPg | null }>(),
  /** Si devuelve un error, la siguiente petición REST falla con él (una vez). */
  fallarUnaVez: null as ErrorPg | null,
  llamadas: 0,
  /** Se ejecuta antes de responder un update (para simular cambios durante la subida). */
  antesDeUpdate: null as null | (() => Promise<void>),
  sesion: { expires_at: Math.floor(Date.now() / 1000) + 3600 } as { expires_at: number } | null,
  refresco: { ok: true, error: null as null | { name: string; status?: number; message: string } },
  refrescos: 0,
};
function tabla(nombre: string) {
  if (!servidor.tablas.has(nombre)) servidor.tablas.set(nombre, new Map());
  return servidor.tablas.get(nombre)!;
}
function tomarFalla(): ErrorPg | null {
  servidor.llamadas++;
  const f = servidor.fallarUnaVez;
  servidor.fallarUnaVez = null;
  return f;
}

const clienteFalso = {
  from(nombre: string) {
    return {
      upsert(filas: Fila | Fila[], opts?: { ignoreDuplicates?: boolean }) {
        return {
          async select() {
            const falla = tomarFalla();
            if (falla) return { data: null, error: falla };
            const lista = Array.isArray(filas) ? filas : [filas];
            const t = tabla(nombre);
            const devueltas: Fila[] = [];
            for (const f of lista) {
              const actual = t.get(f.id);
              if (actual && opts?.ignoreDuplicates) continue; // ON CONFLICT DO NOTHING
              const nueva = { ...(actual ?? {}), ...f, folio: actual?.folio ?? 'SRV-1' };
              t.set(f.id, nueva);
              devueltas.push(nueva);
            }
            return { data: devueltas, error: null };
          },
        };
      },
      update(cambio: Record<string, unknown>) {
        return {
          eq(_k: string, v: string) {
            return {
              async select() {
                if (servidor.antesDeUpdate) {
                  const fn = servidor.antesDeUpdate;
                  servidor.antesDeUpdate = null;
                  await fn();
                }
                const falla = tomarFalla();
                if (falla) return { data: null, error: falla };
                const t = tabla(nombre);
                const actual = t.get(v);
                if (!actual) return { data: [], error: null };
                const nueva = { ...actual, ...cambio };
                t.set(v, nueva);
                return { data: [nueva], error: null };
              },
            };
          },
        };
      },
      delete() {
        return {
          async eq(_k: string, v: string) {
            tabla(nombre).delete(v);
            return { error: null };
          },
        };
      },
    };
  },
  async rpc(fn: string, args: Record<string, unknown>) {
    const falla = tomarFalla();
    if (falla) return { data: null, error: falla };
    const h = servidor.rpcs.get(fn);
    if (!h) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
    return h(args);
  },
  auth: {
    async getSession() {
      return { data: { session: servidor.sesion }, error: null };
    },
    async refreshSession() {
      servidor.refrescos++;
      if (servidor.refresco.ok) {
        servidor.sesion = { expires_at: Math.floor(Date.now() / 1000) + 3600 };
        return { data: { session: servidor.sesion }, error: null };
      }
      return { data: { session: null }, error: servidor.refresco.error };
    },
  },
};

vi.mock('@/lib/supabase', () => ({ supabase: clienteFalso }));

const { offlineDb } = await import('@/lib/offlineDb');
const cola = await import('@/lib/syncQueue');
const respaldo = await import('@/lib/offlineBackup');
const { escribirDescarga } = await import('@/lib/offlineSync');

const BACKUP_KEY = 'uniline_sync_backup';
const EMP = 'emp-1';

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('uniline_auto_sync', 'false'); // sin subida automática al encolar
  await Promise.all([
    offlineDb.syncQueue.clear(), offlineDb.ventas.clear(), offlineDb.venta_lineas.clear(),
    offlineDb.cobros.clear(), offlineDb.cobro_aplicaciones.clear(), offlineDb.carga_lineas.clear(),
  ]);
  servidor.tablas.clear();
  servidor.rpcs.clear();
  servidor.fallarUnaVez = null;
  servidor.antesDeUpdate = null;
  servidor.llamadas = 0;
  servidor.sesion = { expires_at: Math.floor(Date.now() / 1000) + 3600 };
  servidor.refresco = { ok: true, error: null };
  servidor.refrescos = 0;
});

describe('cola: dos cambios parciales a la misma fila se combinan', () => {
  it('update {cliente_id} y luego {status} → un elemento con ambos y el servidor recibe ambos', async () => {
    tabla('ventas').set('v1', { id: 'v1', empresa_id: EMP, cliente_id: 'c1', status: 'borrador' });
    await cola.queueOperation('ventas', 'update', { id: 'v1', cliente_id: 'c2' });
    await cola.queueOperation('ventas', 'update', { id: 'v1', status: 'confirmado' });
    const items = await offlineDb.syncQueue.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].data).toEqual({ id: 'v1', cliente_id: 'c2', status: 'confirmado' });

    const r = await cola.processSyncQueue();
    expect(r).toEqual({ success: 1, failed: 0 });
    expect(tabla('ventas').get('v1')).toMatchObject({ cliente_id: 'c2', status: 'confirmado' });
  });

  it('un cambio encolado MIENTRAS se sube la misma fila no se pierde (se sube después)', async () => {
    tabla('ventas').set('v1', { id: 'v1', empresa_id: EMP, cliente_id: 'c1', status: 'borrador' });
    await cola.queueOperation('ventas', 'update', { id: 'v1', cliente_id: 'c2' });
    servidor.antesDeUpdate = async () => {
      await cola.queueOperation('ventas', 'update', { id: 'v1', status: 'confirmado' });
    };
    await cola.processSyncQueue();
    expect(await offlineDb.syncQueue.count()).toBe(0);
    expect(tabla('ventas').get('v1')).toMatchObject({ cliente_id: 'c2', status: 'confirmado' });
  });
});

describe('cola: un alta reenviada no pisa al servidor', () => {
  it('insert de una venta que el servidor ya canceló → sigue cancelada', async () => {
    tabla('ventas').set('v1', { id: 'v1', empresa_id: EMP, status: 'cancelado', total: 100 });
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP, status: 'confirmado', total: 100 });
    const r = await cola.processSyncQueue();
    expect(r.success).toBe(1);
    expect(tabla('ventas').get('v1')?.status).toBe('cancelado');
    expect(await offlineDb.syncQueue.count()).toBe(0);
  });

  it('insert nuevo sí se crea y la copia local recibe lo del servidor', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v2', empresa_id: EMP, status: 'confirmado', total: 50 });
    await cola.processSyncQueue();
    expect(tabla('ventas').get('v2')?.status).toBe('confirmado');
    expect((await offlineDb.ventas.get('v2'))?.folio).toBe('SRV-1');
  });
});

describe('cola: el respaldo de localStorage no hace reaparecer lo subido ni lo descartado', () => {
  it('lo subido no se restaura al reiniciar', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]')).toHaveLength(1);
    await cola.processSyncQueue();
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    expect(await respaldo.restoreFromStorageBackup()).toBe(0);
    expect(await offlineDb.syncQueue.count()).toBe(0);
  });

  it('lo descartado no se restaura al reiniciar', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    const [item] = await offlineDb.syncQueue.toArray();
    await cola.discardQueueItem(item.id!);
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    expect(await respaldo.restoreFromStorageBackup()).toBe(0);
  });

  it('un respaldo de una versión anterior (sin marca de formato) no se restaura y se borra', async () => {
    localStorage.setItem(BACKUP_KEY, JSON.stringify([
      { operation: 'insert', table: 'cobro_aplicaciones', data: { id: 'ca-viejo' }, keyField: 'id', keyValue: 'ca-viejo', createdAt: Date.now(), retries: 0 },
    ]));
    expect(await respaldo.restoreFromStorageBackup()).toBe(0);
    expect(await offlineDb.syncQueue.count()).toBe(0);
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
  });

  it('del respaldo solo se recupera lo de las últimas 48 h', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v-nueva', empresa_id: EMP });
    const raw = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]');
    raw.push({ ...raw[0], keyValue: 'v-vieja', data: { id: 'v-vieja', empresa_id: EMP }, createdAt: Date.now() - respaldo.RESPALDO_MAX_EDAD_MS - 60_000 });
    localStorage.setItem(BACKUP_KEY, JSON.stringify(raw));
    await offlineDb.syncQueue.clear(); // simula que el sistema borró IndexedDB
    expect(await respaldo.restoreFromStorageBackup()).toBe(1);
    expect((await offlineDb.syncQueue.toArray()).map(i => i.keyValue)).toEqual(['v-nueva']);
  });

  it('si IndexedDB pierde lo pendiente, el respaldo lo recupera', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    await offlineDb.syncQueue.clear(); // simula que el sistema borró IndexedDB
    expect(await respaldo.restoreFromStorageBackup()).toBe(1);
    expect((await offlineDb.syncQueue.toArray())[0].keyValue).toBe('v1');
  });

  it('subida parcial: el respaldo queda solo con lo que falta', async () => {
    servidor.rpcs.set('fn_x', () => ({ data: null, error: { code: '23503', message: 'padre falta' } }));
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    await cola.queueOperation('rpc:fn_x', 'rpc', { p_id: 'r1' }, 'p_id');
    await cola.processSyncQueue();
    const resp = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]') as Array<{ table: string }>;
    expect(resp.map(i => i.table)).toEqual(['rpc:fn_x']);
  });
});

describe('descarga completa: lo pendiente se conserva en el teléfono', () => {
  it('venta sin subir, cambio parcial y renglones siguen visibles tras reemplazar el alcance', async () => {
    // En el teléfono: una venta vieja (ya no está en el servidor), una venta del servidor y
    // una venta hecha sin señal con sus renglones; además un cambio parcial pendiente.
    await offlineDb.ventas.bulkPut([
      { id: 'vieja', empresa_id: EMP, total: 1 },
      { id: 'srv', empresa_id: EMP, total: 10, status: 'confirmado' },
    ]);
    await cola.queueOperation('ventas', 'insert', { id: 'offline', empresa_id: EMP, total: 30 });
    await cola.queueInsertMany('venta_lineas', [{ id: 'l1', venta_id: 'offline', cantidad: 3 }], 'venta_id');
    await cola.queueOperation('ventas', 'update', { id: 'srv', notas: 'cambio sin señal' });

    // «Descargar todo»: el servidor solo trae 'srv' (sin el cambio aún).
    await escribirDescarga('ventas', [{ id: 'srv', empresa_id: EMP, total: 10, status: 'confirmado' }], { empresaId: EMP, parentIds: null });
    await escribirDescarga('venta_lineas', [], { empresaId: EMP, parentIds: ['offline', 'srv'] });

    expect(await offlineDb.ventas.get('vieja')).toBeUndefined();
    expect(await offlineDb.ventas.get('offline')).toMatchObject({ total: 30 });
    expect(await offlineDb.ventas.get('srv')).toMatchObject({ notas: 'cambio sin señal', status: 'confirmado' });
    expect(await offlineDb.venta_lineas.get('l1')).toMatchObject({ venta_id: 'offline' });
  });

  it('venta encolada como UNA operación (RPC) conserva venta, renglones y cobro', async () => {
    await cola.queueOperations([{
      table: 'rpc:fn_ruta_registrar_venta',
      operation: 'rpc',
      data: { p_venta: {
        venta: { id: 'vr', empresa_id: EMP, total: 20 },
        lineas: [{ id: 'lr', cantidad: 2 }],
        lineas_lotes: [], promociones: [],
        cobros: [{ id: 'cr', monto: 20, aplicaciones: [{ id: 'ar', venta_id: 'vr', monto_aplicado: 20 }] }],
        carga: null,
      } },
      keyField: 'p_venta.venta.id',
    }]);
    // La copia local se escribió junto con la cola.
    expect(await offlineDb.ventas.get('vr')).toBeTruthy();
    await escribirDescarga('ventas', [], { empresaId: EMP, parentIds: null });
    await escribirDescarga('venta_lineas', [], { empresaId: EMP, parentIds: ['vr'] });
    await escribirDescarga('cobros', [], { empresaId: EMP, parentIds: null });
    await escribirDescarga('cobro_aplicaciones', [], { empresaId: EMP, parentIds: ['cr'] });
    expect(await offlineDb.ventas.get('vr')).toMatchObject({ total: 20 });
    expect(await offlineDb.venta_lineas.get('lr')).toMatchObject({ venta_id: 'vr' });
    expect(await offlineDb.cobros.get('cr')).toMatchObject({ empresa_id: EMP, monto: 20 });
    expect(await offlineDb.cobros.get('cr')).not.toHaveProperty('aplicaciones');
    expect(await offlineDb.cobro_aplicaciones.get('ar')).toMatchObject({ cobro_id: 'cr' });
  });

  it('lo ya subido manda el servidor (no se repone la copia vieja)', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP, total: 30 });
    await cola.processSyncQueue();
    tabla('ventas').set('v1', { id: 'v1', empresa_id: EMP, total: 30, status: 'cancelado' });
    await escribirDescarga('ventas', [{ id: 'v1', empresa_id: EMP, total: 30, status: 'cancelado' }], { empresaId: EMP, parentIds: null });
    expect((await offlineDb.ventas.get('v1'))?.status).toBe('cancelado');
  });
});

describe('sesión vencida al sincronizar', () => {
  it('si no se puede renovar: no sube nada, conserva la cola sin gastar intentos y avisa', async () => {
    servidor.sesion = { expires_at: Math.floor(Date.now() / 1000) - 3600 };
    servidor.refresco = { ok: false, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } };
    const avisos: string[] = [];
    const oir = (e: Event) => avisos.push((e as CustomEvent<{ tipo: string }>).detail.tipo);
    window.addEventListener(cola.EVENTO_SYNC_ESTADO, oir);
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    const r = await cola.processSyncQueue();
    window.removeEventListener(cola.EVENTO_SYNC_ESTADO, oir);
    expect(r).toEqual({ success: 0, failed: 0, authRequired: true });
    expect(servidor.llamadas).toBe(0);
    const [item] = await offlineDb.syncQueue.toArray();
    expect(item.retries).toBe(0);
    expect(avisos).toContain('sesion_vencida');
  });

  it('token vencido con red: se renueva antes de subir y sube', async () => {
    servidor.sesion = { expires_at: Math.floor(Date.now() / 1000) - 60 };
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    const r = await cola.processSyncQueue();
    expect(servidor.refrescos).toBe(1);
    expect(r).toEqual({ success: 1, failed: 0 });
  });

  it('401 JWT expired a la mitad: renueva, reintenta y no gasta intentos', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    servidor.fallarUnaVez = { code: 'PGRST301', message: 'JWT expired' };
    const r = await cola.processSyncQueue();
    expect(servidor.refrescos).toBe(1);
    expect(r.success).toBe(1);
    expect(await offlineDb.syncQueue.count()).toBe(0);
  });

  it('sin red para renovar: no sube y no gasta intentos', async () => {
    servidor.sesion = { expires_at: Math.floor(Date.now() / 1000) - 60 };
    servidor.refresco = { ok: false, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } };
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP });
    const r = await cola.processSyncQueue();
    expect(r).toEqual({ success: 0, failed: 0 });
    expect((await offlineDb.syncQueue.toArray())[0].retries).toBe(0);
  });
});

describe('descartar deja registro para el servidor', () => {
  it('quita la operación y encola el registro con motivo; el respaldo queda igual', async () => {
    await cola.queueOperation('ventas', 'insert', { id: 'v1', empresa_id: EMP, total: 9 });
    const [item] = await offlineDb.syncQueue.toArray();
    await expect(cola.descartarConRegistro(item.id!, { motivo: ' ', empresaId: EMP, userId: 'u1' })).rejects.toThrow();
    await cola.descartarConRegistro(item.id!, { motivo: 'venta duplicada', empresaId: EMP, userId: 'u1', dispositivo: 'tel-1' });
    const items = await offlineDb.syncQueue.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].table).toBe('sync_descartes');
    expect(items[0].data).toMatchObject({ empresa_id: EMP, user_id: 'u1', tabla: 'ventas', operacion: 'insert', clave: 'v1', motivo: 'venta duplicada', dispositivo: 'tel-1' });
    expect((items[0].data as { datos: { total: number } }).datos.total).toBe(9);
    const resp = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]') as Array<{ table: string }>;
    expect(resp.map(i => i.table)).toEqual(['sync_descartes']);
    await cola.processSyncQueue();
    expect(tabla('sync_descartes').size).toBe(1);
  });
});

describe('venta de ruta como una operación', () => {
  it('RPC aún no publicada (PGRST202): espera sin gastar intentos', async () => {
    await cola.queueOperation('rpc:fn_ruta_registrar_venta', 'rpc', { p_venta: { venta: { id: 'v9', empresa_id: EMP }, lineas: [{ id: 'l9' }], cobros: [] } }, 'p_venta.venta.id');
    const r = await cola.processSyncQueue();
    expect(r.failed).toBe(0);
    const [item] = await offlineDb.syncQueue.toArray();
    expect(item.retries).toBeLessThanOrEqual(cola.SYNC_QUEUE_MAX_RETRIES);
    expect(item.lastError).toMatch(/Could not find/);
  });

  it('reenviar la misma venta reemplaza el elemento (un solo envío por venta)', async () => {
    const op = { venta: { id: 'v9', empresa_id: EMP }, lineas: [{ id: 'l9' }], cobros: [] };
    await cola.queueOperation('rpc:fn_ruta_registrar_venta', 'rpc', { p_venta: op }, 'p_venta.venta.id');
    await cola.queueOperation('rpc:fn_ruta_registrar_venta', 'rpc', { p_venta: op }, 'p_venta.venta.id');
    expect(await offlineDb.syncQueue.count()).toBe(1);
    servidor.rpcs.set('fn_ruta_registrar_venta', () => ({ data: { ok: true, duplicada: false, aplicaciones_rechazadas: [] }, error: null }));
    expect((await cola.processSyncQueue()).success).toBe(1);
  });

  it('abono rechazado a otra nota: la venta sube y se avisa al vendedor', async () => {
    servidor.rpcs.set('fn_ruta_registrar_venta', () => ({ data: { ok: true, aplicaciones_rechazadas: [{ venta_id: 'otra' }] }, error: null }));
    const avisos: string[] = [];
    const oir = (e: Event) => avisos.push((e as CustomEvent<{ tipo: string; mensaje: string }>).detail.mensaje);
    window.addEventListener(cola.EVENTO_SYNC_ESTADO, oir);
    await cola.queueOperation('rpc:fn_ruta_registrar_venta', 'rpc', { p_venta: { venta: { id: 'v9', empresa_id: EMP }, lineas: [{ id: 'l9' }], cobros: [] } }, 'p_venta.venta.id');
    const r = await cola.processSyncQueue();
    window.removeEventListener(cola.EVENTO_SYNC_ESTADO, oir);
    expect(r.success).toBe(1);
    expect(avisos.join(' ')).toMatch(/abono/);
  });
});

describe('D-065: fallidos no se reintentan en cada pasada', () => {
  it('un fallido reciente NO se reintenta; pasado el intervalo sí, y si ya está en el servidor sale de la cola', async () => {
    await offlineDb.syncQueue.add({
      table: 'cobro_aplicaciones', operation: 'insert', keyField: 'id', keyValue: 'ca-1',
      data: { id: 'ca-1', cobro_id: 'c1', venta_id: 'v1', monto_aplicado: 78 },
      retries: cola.SYNC_QUEUE_MAX_RETRIES + 1, createdAt: Date.now() - 60_000,
    } as any);
    const antes = servidor.llamadas;
    await cola.processSyncQueue();
    expect(servidor.llamadas).toBe(antes); // no tocó el servidor
    expect(await offlineDb.syncQueue.count()).toBe(1);

    const [item] = await offlineDb.syncQueue.toArray();
    await offlineDb.syncQueue.update(item.id!, { createdAt: Date.now() - cola.DEAD_LETTER_RETRY_MS - 1000 });
    tabla('cobro_aplicaciones').set('ca-1', { id: 'ca-1', monto_aplicado: 78 }); // ya estaba en el servidor
    await cola.processSyncQueue();
    expect(servidor.llamadas).toBe(antes + 1);
    expect(await offlineDb.syncQueue.count()).toBe(0);
  });
});
